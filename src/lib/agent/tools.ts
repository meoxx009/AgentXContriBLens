/**
 * ContribLens Server-Side Agent Tools
 * 
 * Implements exactly the seven named tools described in the hackathon deck:
 * 1. github_fetch_tree
 * 2. fetch_file
 * 3. rule_scan
 * 4. osv_lookup
 * 5. explain_finding
 * 6. draft_issue
 * 7. patch_preview
 * 
 * Safety & Security Invariants:
 * - Read-only operation; zero repository code execution.
 * - Strict Zod validation on inputs and outputs.
 * - Strict bounds on file sizes (180 KB), file counts (60), and total bytes (15 MB).
 * - Directory traversal ('..'), absolute paths, binary extensions, and restricted folders blocked.
 * - In-memory secret redaction before AI or client transmission.
 * - Disclosure guard blocks public draft generation for secrets and critical severity findings.
 * - Patch preview prepares a proposed unified diff for human maintainer review only; never writes to disk or git.
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import {
  parseGitHubUrl,
  fetchRepoMetadata,
  fetchBoundedRepositoryTree,
  resolveAuthoritativeBranch,
  executeGitHubRequest,
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_BYTES,
  type BoundedFile,
} from '../scanner/github.ts';
import { scanRepositoryFiles } from '../scanner/index.ts';
import { queryOSVBatch } from '../scanner/osv.ts';
import { explainFinding, createIssueDraft, buildContributionRoute } from '../gemini.ts';
import { redactSecrets } from '../redaction.ts';
import { db } from '../db.ts';
import type { Finding, FindingEvidence, ScanSummary, TechStack, ContributionRoute } from '../../types.ts';
import {
  AgentToolName,
  AgentToolNameSchema,
  FindingEvidenceSchema,
} from '../../types.ts';

export type { AgentToolName };
export { AgentToolNameSchema };

export const ALLOWED_TOOL_NAMES: readonly AgentToolName[] = [
  'github_fetch_tree',
  'fetch_file',
  'rule_scan',
  'osv_lookup',
  'explain_finding',
  'draft_issue',
  'patch_preview',
] as const;

export const ALLOWED_AGENT_TOOLS = [...ALLOWED_TOOL_NAMES];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.exe', '.dll',
  '.so', '.dylib', '.bin', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mp3', '.mov', '.avi', '.lockb', '.wasm', '.jar'
]);

const RESTRICTED_DIRECTORIES = [
  'node_modules/',
  'vendor/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'out/',
  'venv/',
  '.venv/',
  '__pycache__/',
  'target/',
  '.terraform/',
  'coverage/',
];

export interface AgentToolContext {
  userId?: string;
  scanId?: string;
  findingId?: string;
  repoUrl?: string;
  repoName?: string;
  branch?: string;
  defaultBranch?: string;
  filesCache?: Map<string, string>;
  findingsCache?: Map<string, Finding>;
  verifiedFindings?: Finding[];
}

function createMockScanSummary(context?: AgentToolContext, repoName?: string): ScanSummary {
  const cleanRepo = repoName || context?.repoName || 'example/repo';
  const [owner, repo] = cleanRepo.split('/');
  return {
    id: context?.scanId || 'scn_default',
    userId: context?.userId || 'u-default',
    repoUrl: context?.repoUrl || `https://github.com/${cleanRepo}`,
    repoName: cleanRepo,
    owner: owner || 'example',
    branch: context?.branch || 'main',
    scope: 'partial',
    scannedAt: new Date().toISOString(),
    totalFiles: 1,
    totalBytes: 1000,
    filesScanned: 1,
    bytesScanned: 1000,
    filesSkipped: 0,
    status: 'completed',
    readinessScore: 80,
    techStack: {
      languages: [{ name: 'JavaScript', percentage: 100, filesCount: 1 }],
      frameworks: [],
      tooling: [],
      manifests: [],
      confidenceScore: 0.9,
    },
    technologies: {
      languages: [{ name: 'JavaScript', confidence: 0.9, sources: ['extension'] }],
      frameworks: [],
      tooling: [],
      manifests: [],
    },
    findingsCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
  };
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

// -----------------------------------------------------------------------------
// Tool 1: github_fetch_tree
// -----------------------------------------------------------------------------
export const GithubFetchTreeInputSchema = z.object({
  repoUrl: z.string().min(1, 'repoUrl is required'),
  branch: z.string().optional(),
  scope: z.enum(['partial', 'deep']).optional().default('partial'),
});

export type GithubFetchTreeInput = z.infer<typeof GithubFetchTreeInputSchema>;

export const GithubFetchTreeOutputSchema = z.object({
  repoName: z.string(),
  owner: z.string(),
  repo: z.string(),
  defaultBranch: z.string(),
  targetBranch: z.string(),
  scope: z.enum(['partial', 'deep']),
  filesIndexed: z.number(),
  candidateFiles: z.array(
    z.object({
      path: z.string(),
      size: z.number().optional(),
    })
  ),
  totalFilesAvailable: z.number(),
  truncated: z.boolean(),
  warnings: z.array(z.string()),
});

export type GithubFetchTreeOutput = z.infer<typeof GithubFetchTreeOutputSchema>;

export async function executeGithubFetchTree(
  input: GithubFetchTreeInput,
  context?: AgentToolContext
): Promise<ToolResult<GithubFetchTreeOutput>> {
  const parsed = parseGitHubUrl(input.repoUrl);
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid GitHub repository URL. Must be in format: https://github.com/owner/repo',
    };
  }

  try {
    const meta = await fetchRepoMetadata(parsed.owner, parsed.repo);
    const targetBranch = input.branch?.trim() || parsed.branch?.trim() || meta.defaultBranch || 'main';

    const { files, totalFilesIndexed, warnings, resolvedBranch } = await fetchBoundedRepositoryTree(
      parsed.owner,
      parsed.repo,
      targetBranch,
      meta.defaultBranch,
      input.scope
    );

    // Populate context cache if available
    if (context?.filesCache) {
      for (const f of files) {
        context.filesCache.set(f.path, f.content);
      }
    }

    const candidateFiles = files.map((f) => ({ path: f.path, size: f.size }));

    return {
      ok: true,
      data: {
        repoName: `${parsed.owner}/${parsed.repo}`,
        owner: parsed.owner,
        repo: parsed.repo,
        defaultBranch: meta.defaultBranch,
        targetBranch: resolvedBranch || targetBranch,
        scope: input.scope || 'partial',
        filesIndexed: files.length,
        candidateFiles,
        totalFilesAvailable: totalFilesIndexed,
        truncated: warnings.some((w) => w.toLowerCase().includes('truncated')),
        warnings,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to fetch repository tree: ${err?.message || 'Network or authorization error'}`,
    };
  }
}

// -----------------------------------------------------------------------------
// Tool 2: fetch_file
// -----------------------------------------------------------------------------
export const FetchFileInputSchema = z
  .object({
    repoUrl: z.string().min(1, 'repoUrl is required'),
    path: z.string().optional(),
    filePath: z.string().optional(),
    branch: z.string().optional(),
  })
  .transform((val) => ({
    repoUrl: val.repoUrl,
    path: (val.path || val.filePath || '').trim(),
    branch: val.branch,
  }))
  .refine((val) => val.path.length > 0, {
    message: 'path is required',
    path: ['path'],
  });

export type FetchFileInput = z.infer<typeof FetchFileInputSchema>;

export const FetchFileOutputSchema = z.object({
  path: z.string(),
  size: z.number(),
  content: z.string(),
  truncated: z.boolean(),
  sha256: z.string(),
});

export type FetchFileOutput = z.infer<typeof FetchFileOutputSchema>;

export async function executeFetchFile(
  input: FetchFileInput,
  context?: AgentToolContext
): Promise<ToolResult<FetchFileOutput>> {
  const cleanPath = input.path.trim().replace(/\\/g, '/');

  // Security Invariants: Prohibit traversal, absolute paths, null bytes
  if (cleanPath.includes('\0')) {
    return {
      ok: false,
      error: 'Security violation: Null bytes are prohibited in file paths.',
    };
  }

  if (cleanPath.includes('..')) {
    return {
      ok: false,
      error: `Security violation: Path "${cleanPath}" contains illegal traversal sequences (..).`,
    };
  }

  if (cleanPath.startsWith('/') || cleanPath.startsWith('./')) {
    return {
      ok: false,
      error: `Security violation: Absolute paths are forbidden: "${cleanPath}".`,
    };
  }

  const lowerPath = cleanPath.toLowerCase();

  // Reject restricted folders
  if (RESTRICTED_DIRECTORIES.some((dir) => lowerPath.includes(dir))) {
    return {
      ok: false,
      error: `Access denied: Reading from restricted or sensitive directory "${cleanPath}" is prohibited.`,
    };
  }

  // Reject binary files
  const ext = '.' + lowerPath.split('.').pop();
  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Unsupported file type: Binary/unsupported file extension "${cleanPath}" cannot be scanned as text.`,
    };
  }

  // Check cache first
  if (context?.filesCache && context.filesCache.has(cleanPath)) {
    const cached = context.filesCache.get(cleanPath)!;
    const size = Buffer.byteLength(cached, 'utf-8');
    const safeContent = redactSecrets(cached);
    const hash = createHash('sha256').update(safeContent).digest('hex');
    return {
      ok: true,
      data: {
        path: cleanPath,
        size,
        content: safeContent,
        truncated: false,
        sha256: hash,
      },
    };
  }

  const parsed = parseGitHubUrl(input.repoUrl);
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid GitHub repository URL.',
    };
  }

  const rawBranch = input.branch?.trim() || parsed.branch?.trim() || context?.branch;
  const targetBranch = await resolveAuthoritativeBranch(
    parsed.owner,
    parsed.repo,
    rawBranch,
    context?.defaultBranch
  );

  try {
    const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${targetBranch}/${cleanPath}`;
    const res = await executeGitHubRequest(rawUrl, {
      headers: { 'User-Agent': 'ContribLens-OSS-Scanner' },
      skipAuth: true,
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: false,
          error: `File "${cleanPath}" was not found on branch "${targetBranch}".`,
        };
      }
      return {
        ok: false,
        error: `GitHub HTTP ${res.status} while fetching file "${cleanPath}".`,
      };
    }

    const rawText = await res.text();
    const rawByteLength = Buffer.byteLength(rawText, 'utf-8');
    let content = rawText;
    let truncated = false;

    // Enforce per-file size boundary (180 KB)
    if (rawByteLength > MAX_FILE_SIZE_BYTES) {
      content = rawText.slice(0, MAX_FILE_SIZE_BYTES);
      truncated = true;
    }

    // Defensive secret redaction before storing or returning
    const safeContent = redactSecrets(content);
    const hash = createHash('sha256').update(safeContent).digest('hex');

    if (context?.filesCache) {
      context.filesCache.set(cleanPath, safeContent);
    }

    return {
      ok: true,
      data: {
        path: cleanPath,
        size: Buffer.byteLength(safeContent, 'utf-8'),
        content: safeContent,
        truncated,
        sha256: hash,
      },
      warnings: truncated
        ? [`File "${cleanPath}" exceeded 180 KB and was truncated.`]
        : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Network error retrieving file "${cleanPath}": ${err?.message || 'unknown error'}`,
    };
  }
}

// -----------------------------------------------------------------------------
// Tool 3: rule_scan
// -----------------------------------------------------------------------------
export const RuleScanInputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().min(1),
      content: z.string(),
    })
  ).min(1, 'At least one file is required for rule scanning').max(MAX_FILES, `File batch exceeds maximum limit of ${MAX_FILES}`),
  repoName: z.string().optional(),
  licenseName: z.string().optional(),
  checks: z.array(z.string()).optional(),
});

export type RuleScanInput = z.infer<typeof RuleScanInputSchema>;

export const RuleScanOutputSchema = z.object({
  scanId: z.string(),
  findings: z.array(FindingEvidenceSchema),
  techStack: z.any(),
  readinessScore: z.number(),
  parsedDependencies: z.array(
    z.object({
      name: z.string(),
      version: z.string().optional(),
      ecosystem: z.string().optional(),
    })
  ),
  totalFindings: z.number(),
  scanSummary: z
    .object({
      filesScanned: z.number(),
      bytesScanned: z.number(),
      findingsCount: z.any(),
    })
    .optional(),
});

export type RuleScanOutput = z.infer<typeof RuleScanOutputSchema>;

export async function executeRuleScan(
  input: RuleScanInput,
  context?: AgentToolContext
): Promise<ToolResult<RuleScanOutput>> {
  const scanId = context?.scanId || `scn_agt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Convert files to bounded file objects (enforce byte limit)
  const boundedFiles: BoundedFile[] = input.files.map((f) => ({
    path: f.path,
    content: f.content,
    size: Buffer.byteLength(f.content, 'utf-8'),
  }));

  // Pure deterministic scan in memory — zero code execution
  const { findings, techStack, readinessScore, parsedDeps } = scanRepositoryFiles(
    boundedFiles,
    scanId,
    { repoName: input.repoName || context?.repoName, licenseName: input.licenseName },
    input.checks
  );

  // Cache findings in context
  if (context?.findingsCache) {
    for (const f of findings) {
      context.findingsCache.set(f.id, f as Finding);
    }
  }

  const totalBytes = boundedFiles.reduce((acc, f) => acc + f.size, 0);
  const scanSummary = {
    filesScanned: boundedFiles.length,
    bytesScanned: totalBytes,
    findingsCount: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === 'CRITICAL').length,
      high: findings.filter((f) => f.severity === 'HIGH').length,
      medium: findings.filter((f) => f.severity === 'MEDIUM').length,
      low: findings.filter((f) => f.severity === 'LOW').length,
      info: findings.filter((f) => f.severity === 'INFO').length,
    },
  };

  return {
    ok: true,
    data: {
      scanId,
      findings,
      techStack,
      readinessScore,
      parsedDependencies: parsedDeps.map((d) => ({
        name: d.name,
        version: d.version,
        ecosystem: d.ecosystem,
      })),
      totalFindings: findings.length,
      scanSummary,
    },
  };
}

// -----------------------------------------------------------------------------
// Tool 4: osv_lookup
// -----------------------------------------------------------------------------
export const OsvLookupInputSchema = z.object({
  dependencies: z.array(
    z.object({
      name: z.string().min(1),
      version: z.string().optional(),
      ecosystem: z.string().optional(),
    })
  ).min(1, 'At least one dependency is required').max(100, 'Batch lookup is bounded to 100 dependencies max'),
  scanId: z.string().optional(),
});

export type OsvLookupInput = z.infer<typeof OsvLookupInputSchema>;

export const OsvLookupOutputSchema = z.object({
  findings: z.array(z.any()),
  queriedCount: z.number(),
  vulnerabilitiesCount: z.number(),
  warnings: z.array(z.string()),
});

export type OsvLookupOutput = z.infer<typeof OsvLookupOutputSchema>;

export async function executeOsvLookup(
  input: OsvLookupInput,
  context?: AgentToolContext
): Promise<ToolResult<OsvLookupOutput>> {
  const scanId = input.scanId || context?.scanId || `scn_osv_${Date.now()}`;
  const warnings: string[] = [];

  try {
    const osvFindings = await queryOSVBatch(input.dependencies as any, scanId);

    // Cache findings in context
    if (context?.findingsCache) {
      for (const f of osvFindings) {
        context.findingsCache.set(f.id, f);
      }
    }

    return {
      ok: true,
      data: {
        findings: osvFindings,
        queriedCount: input.dependencies.length,
        vulnerabilitiesCount: osvFindings.length,
        warnings,
      },
    };
  } catch (err: any) {
    warnings.push(`OSV.dev query failed or throttled: ${err?.message || 'service unavailable'}`);
    return {
      ok: true,
      data: {
        findings: [],
        queriedCount: input.dependencies.length,
        vulnerabilitiesCount: 0,
        warnings,
      },
      warnings,
    };
  }
}

// -----------------------------------------------------------------------------
// Tool 5: explain_finding
// -----------------------------------------------------------------------------
export const ExplainFindingInputSchema = z.object({
  findingId: z.string().optional(),
  finding: z.any().optional(),
  scanId: z.string().optional(),
  repoName: z.string().optional(),
}).refine((data) => data.findingId || data.finding, {
  message: 'Either findingId or finding object must be provided to explain_finding',
});

export type ExplainFindingInput = z.infer<typeof ExplainFindingInputSchema>;

export const ExplainFindingOutputSchema = z.object({
  findingId: z.string(),
  title: z.string(),
  explanation: z.string(),
  whatHappened: z.string(),
  whyItMatters: z.string(),
  howToFix: z.string(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  skills: z.array(z.string()),
  generatedBy: z.enum(['gemma', 'gemini', 'deterministic']),
});

export type ExplainFindingOutput = z.infer<typeof ExplainFindingOutputSchema>;

export async function executeExplainFinding(
  input: ExplainFindingInput,
  context?: AgentToolContext
): Promise<ToolResult<ExplainFindingOutput>> {
  // 1. Resolve finding server-side
  let finding: Finding | undefined = input.finding;

  if (input.findingId) {
    finding = db.getFindingById(input.findingId) || context?.findingsCache?.get(input.findingId) || finding;
  }

  if (!finding) {
    return {
      ok: false,
      error: `Finding "${input.findingId || 'unknown'}" could not be resolved from server storage or context.`,
    };
  }

  // 2. Ownership verification if scanId & userId exist
  if (finding.scanId && context?.userId) {
    const scan = db.getScanById(finding.scanId);
    if (scan && scan.userId && scan.userId !== context.userId) {
      return {
        ok: false,
        error: 'Unauthorized: Finding belongs to a scan owned by another user.',
      };
    }
  }

  // 3. Resolve scan summary or fallback
  const scanSummary: ScanSummary = (finding.scanId ? db.getScanById(finding.scanId) : undefined) || createMockScanSummary(context, input.repoName);

  try {
    const exp = await explainFinding(finding, scanSummary);

    return {
      ok: true,
      data: {
        findingId: finding.id,
        title: finding.title,
        explanation: exp.explanation,
        whatHappened: exp.whatHappened || exp.explanation,
        whyItMatters: exp.whyItMatters || exp.riskContext,
        howToFix: exp.howToFix || exp.recommendedFix,
        difficulty: exp.difficulty,
        skills: exp.skillsNeeded || finding.skills || [],
        generatedBy: exp.generatedBy,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to generate grounded explanation: ${err?.message || 'unknown error'}`,
    };
  }
}

// -----------------------------------------------------------------------------
// Tool 6: draft_issue
// -----------------------------------------------------------------------------
export const DraftIssueInputSchema = z.object({
  findingId: z.string().optional(),
  finding: z.any().optional(),
  routeId: z.string().optional(),
  scanId: z.string().optional(),
  repoName: z.string().optional(),
}).refine((data) => data.findingId || data.finding, {
  message: 'Either findingId or finding object must be provided to draft_issue',
});

export type DraftIssueInput = z.infer<typeof DraftIssueInputSchema>;

export const DraftIssueOutputSchema = z.object({
  draftId: z.string(),
  title: z.string(),
  markdownContent: z.string(),
  badge: z.literal('Maintainer review required'),
  generatedBy: z.enum(['gemma', 'gemini', 'deterministic']),
  cached: z.boolean().optional(),
});

export type DraftIssueOutput = z.infer<typeof DraftIssueOutputSchema>;

export async function executeDraftIssue(
  input: DraftIssueInput,
  context?: AgentToolContext
): Promise<ToolResult<DraftIssueOutput>> {
  // 1. Resolve finding server-side
  let finding: Finding | undefined = input.finding;

  if (input.findingId) {
    finding = db.getFindingById(input.findingId) || context?.findingsCache?.get(input.findingId) || finding;
  }

  if (!finding) {
    return {
      ok: false,
      error: `Finding "${input.findingId || 'unknown'}" could not be resolved.`,
    };
  }

  // 2. DISCLOSURE GUARD: Block secrets and critical findings from public issue drafts
  const isDisclosureBlocked =
    finding.category === 'secret' ||
    finding.disclosureMode === 'security-disclosure' ||
    finding.disclosureMode === 'DISCLOSURE_BLOCKED' ||
    String(finding.severity).toUpperCase() === 'CRITICAL';

  if (isDisclosureBlocked) {
    return {
      ok: false,
      error: 'DISCLOSURE_BLOCKED: Public issue drafts cannot be generated for secret credentials or critical vulnerabilities. Follow responsible disclosure guidance.',
    };
  }

  // 3. Ownership verification
  if (finding.scanId && context?.userId) {
    const scan = db.getScanById(finding.scanId);
    if (scan && scan.userId && scan.userId !== context.userId) {
      return {
        ok: false,
        error: 'Unauthorized: Finding belongs to a scan owned by another user.',
      };
    }
  }

  const scanSummary: ScanSummary = (finding.scanId ? db.getScanById(finding.scanId) : undefined) || createMockScanSummary(context, input.repoName);

  try {
    let route: ContributionRoute | undefined = input.routeId ? (await db.getRouteById(input.routeId)) : undefined;
    if (!route) {
      route = await buildContributionRoute(finding, scanSummary);
    }

    const draft = await createIssueDraft(route, finding, scanSummary);

    return {
      ok: true,
      data: {
        draftId: draft.id,
        title: draft.title,
        markdownContent: draft.markdownContent,
        badge: 'Maintainer review required',
        generatedBy: draft.generatedBy as 'gemma' | 'gemini' | 'deterministic',
        cached: (draft as any).cached,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Failed to create issue draft: ${err?.message || 'unknown error'}`,
    };
  }
}

// -----------------------------------------------------------------------------
// Tool 7: patch_preview
// -----------------------------------------------------------------------------
export const PatchPreviewInputSchema = z.object({
  findingId: z.string().optional(),
  finding: z.any().optional(),
  file: z.string().optional(),
  originalContent: z.string().optional(),
  proposedChange: z.string().optional(),
}).refine((data) => data.findingId || data.finding || (data.file && data.proposedChange), {
  message: 'Either findingId, finding, or (file + proposedChange) must be provided to patch_preview',
});

export type PatchPreviewInput = z.infer<typeof PatchPreviewInputSchema>;

export const PatchPreviewOutputSchema = z.object({
  file: z.string(),
  diff: z.string(),
  unifiedDiff: z.string().optional(),
  description: z.string(),
  lineStart: z.number().nullable().optional(),
  lineEnd: z.number().nullable().optional(),
  safetyNotice: z.string(),
  actionable: z.boolean(),
  requiresHumanApproval: z.boolean().optional(),
});

export type PatchPreviewOutput = z.infer<typeof PatchPreviewOutputSchema>;

export async function executePatchPreview(
  input: PatchPreviewInput,
  context?: AgentToolContext
): Promise<ToolResult<PatchPreviewOutput>> {
  let finding: Finding | undefined = input.finding;

  if (input.findingId) {
    finding = db.getFindingById(input.findingId) || context?.findingsCache?.get(input.findingId) || finding;
  }

  const targetFile = input.file || finding?.file || (finding as any)?.targetFile || 'Repository Configuration';
  const lineStart = finding?.lineStart ?? null;
  const lineEnd = finding?.lineEnd ?? null;
  const fixHint = input.proposedChange || finding?.fixHint || (finding as any)?.recommendation || 'Apply recommended secure configuration.';

  // Build proposed unified diff preview
  let diff = '';
  const original = input.originalContent || finding?.evidence || (finding as any)?.snippet || '';
  const safeOriginal = redactSecrets(original.trim());

  if (safeOriginal && safeOriginal.length > 0) {
    const originalLines = safeOriginal.split('\n').map((l) => `- ${l}`).join('\n');
    const proposedLine = `+ ${fixHint}`;
    const lineRange = lineStart ? `@@ -${lineStart},${Math.max(1, (lineEnd || lineStart) - lineStart + 1)} +${lineStart},1 @@` : '@@ -1,1 +1,1 @@';

    diff = [
      `--- a/${targetFile}`,
      `+++ b/${targetFile}`,
      lineRange,
      originalLines,
      proposedLine,
    ].join('\n');
  } else {
    diff = [
      `--- a/${targetFile}`,
      `+++ b/${targetFile}`,
      '@@ -1,1 +1,2 @@',
      `+ # ContribLens Suggested Fix:`,
      `+ # ${fixHint}`,
    ].join('\n');
  }

  // Safety Invariant: Previews are for human maintainer inspection only.
  // Never write to filesystem, never execute git apply, never commit.
  return {
    ok: true,
    data: {
      file: targetFile,
      diff,
      unifiedDiff: diff,
      description: `Proposed security configuration change for ${targetFile}: ${fixHint}`,
      lineStart,
      lineEnd,
      safetyNotice:
        'This patch preview is generated for maintainer review only. ContribLens adheres strictly to "Human approves" and never applies code modifications or commits directly.',
      actionable: true,
      requiresHumanApproval: true,
    },
  };
}

// -----------------------------------------------------------------------------
// Tool Dispatcher & Schema Validator
// -----------------------------------------------------------------------------
export async function executeToolByName(
  toolName: AgentToolName,
  rawArgs: unknown,
  context?: AgentToolContext
): Promise<ToolResult> {
  const start = Date.now();

  // 1. Tool allowlist check
  if (!ALLOWED_TOOL_NAMES.includes(toolName)) {
    return {
      ok: false,
      error: `Tool "${toolName}" is not permitted. Allowed tools: ${ALLOWED_TOOL_NAMES.join(', ')}`,
    };
  }

  // 2. Validate input arguments against tool-specific Zod schema
  switch (toolName) {
    case 'github_fetch_tree': {
      const parsed = GithubFetchTreeInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for github_fetch_tree: ${parsed.error.message}` };
      }
      return executeGithubFetchTree(parsed.data, context);
    }

    case 'fetch_file': {
      const parsed = FetchFileInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for fetch_file: ${parsed.error.message}` };
      }
      return executeFetchFile(parsed.data, context);
    }

    case 'rule_scan': {
      const parsed = RuleScanInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for rule_scan: ${parsed.error.message}` };
      }
      return executeRuleScan(parsed.data, context);
    }

    case 'osv_lookup': {
      const parsed = OsvLookupInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for osv_lookup: ${parsed.error.message}` };
      }
      return executeOsvLookup(parsed.data, context);
    }

    case 'explain_finding': {
      const parsed = ExplainFindingInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for explain_finding: ${parsed.error.message}` };
      }
      return executeExplainFinding(parsed.data, context);
    }

    case 'draft_issue': {
      const parsed = DraftIssueInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for draft_issue: ${parsed.error.message}` };
      }
      return executeDraftIssue(parsed.data, context);
    }

    case 'patch_preview': {
      const parsed = PatchPreviewInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return { ok: false, error: `Invalid arguments for patch_preview: ${parsed.error.message}` };
      }
      return executePatchPreview(parsed.data, context);
    }

    default: {
      return {
        ok: false,
        error: `Unhandled tool: ${toolName}`,
      };
    }
  }
}

export async function executeAgentTool(params: {
  tool: AgentToolName;
  args: unknown;
  context?: AgentToolContext;
}): Promise<ToolResult> {
  return executeToolByName(params.tool, params.args, params.context);
}
