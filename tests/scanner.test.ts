import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  redactSecrets,
  detectSecretsInText,
  computeEvidenceHash,
} from "../src/lib/redaction";
import { parseGitHubUrl } from "../src/lib/scanner/github";
import {
  parsePackageJson,
  parseRequirementsTxt,
  parsePyprojectToml,
} from "../src/lib/scanner/manifests";
import { scanGitHubActions } from "../src/lib/scanner/actions";
import { checkRepositoryHealth } from "../src/lib/scanner/health";
import { detectTechnologyStack } from "../src/lib/scanner/tech-detector";
import {
  createFindingEvidence,
  convertToTechnologySnapshot,
} from "../src/lib/scanner/evidence";
import { computeFindingFingerprint, compareScans } from "../src/lib/scanner/diff";
import { scanRepositoryFiles } from "../src/lib/scanner/index";
import { buildEvidenceChain } from "../src/lib/scanner/evidence-chain";
import type { ScanSummary } from "../src/types";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

describe("Phase 5 — Secret Redaction Engine (SCANNER_RULES.md Section 5)", () => {
  it("redacts GitHub Classic Personal Access Tokens without leaking raw chars", () => {
    const raw = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(redacted).toMatch(/^ghp_\*{4}/);
  });

  it("redacts GitHub Fine-grained Personal Access Tokens", () => {
    const raw =
      "github_pat_11AAAAAA00000000000000000000000000000000000000000000000000000000000000000000000000";
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain("11AAAAAA00000000000000000000000000000000");
    expect(redacted).toContain("github_pat_");
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts AWS Access Key ID and Secret Access Key", () => {
    const rawId = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
    const redactedId = redactSecrets(rawId);
    expect(redactedId).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redactedId).toContain("AKIA************MPLE");

    const rawSecret =
      'aws_secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const redactedSecret = redactSecrets(rawSecret);
    expect(redactedSecret).not.toContain("wJalrXUtnFEMI");
    expect(redactedSecret).toContain("[REDACTED_AWS_SECRET_KEY]");
  });

  it("detects secrets and assigns CRITICAL severity with deterministic SHA-256 hash", () => {
    const content =
      'GITHUB_TOKEN=ghp_111122223333444455556666777788889999\nconst apiKey = "1234";';
    const findings = detectSecretsInText(".env", content);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("CRITICAL");
    expect(findings[0].confidence).toBe("HIGH");
    expect(findings[0].redactedEvidence).not.toContain(
      "111122223333444455556666777788889999"
    );

    const hash = computeEvidenceHash(findings[0].redactedEvidence);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
  });

  it("ensures raw secrets never appear in serialized finding output", () => {
    const rawToken = "ghp_SecretTokenThatMustNeverLeak1234567";
    const content = `API_KEY=${rawToken}`;
    const findings = detectSecretsInText(".env.production", content);
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("SecretTokenThatMustNeverLeak");
  });
});

describe("Phase 5 — GitHub URL Validator", () => {
  it("parses valid HTTPS GitHub repository URLs", () => {
    const res = parseGitHubUrl("https://github.com/expressjs/express");
    expect(res).toEqual({ owner: "expressjs", repo: "express", branch: undefined });

    const withGit = parseGitHubUrl("https://github.com/facebook/react.git");
    expect(withGit).toEqual({ owner: "facebook", repo: "react", branch: undefined });

    const withTrailing = parseGitHubUrl("https://github.com/vercel/next.js/");
    expect(withTrailing).toEqual({ owner: "vercel", repo: "next.js", branch: undefined });
  });

  it("rejects non-GitHub or invalid URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGitHubUrl("https://bitbucket.org/owner/repo")).toBeNull();
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });
});

describe("Phase 5 — Manifest Parsers with Fixtures", () => {
  it("parses package.json fixture with dependencies, devDependencies, and security tools", () => {
    const pkgPath = path.join(FIXTURES_DIR, "manifests", "package.json");
    const content = fs.readFileSync(pkgPath, "utf-8");
    const parsed = parsePackageJson("package.json", content);

    expect(parsed.dependencies.length).toBe(7);
    expect(parsed.dependencies.some((d) => d.name === "next" && !d.isDev)).toBe(true);
    expect(parsed.dependencies.some((d) => d.name === "react" && !d.isDev)).toBe(true);
    expect(parsed.dependencies.some((d) => d.name === "typescript" && d.isDev)).toBe(true);
    expect(parsed.dependencies.some((d) => d.name === "vitest" && d.isDev)).toBe(true);
    expect(parsed.hasSecurityTools).toBe(true);
  });

  it("parses requirements.txt fixture with version bounds and comments", () => {
    const reqPath = path.join(FIXTURES_DIR, "manifests", "requirements.txt");
    const content = fs.readFileSync(reqPath, "utf-8");
    const parsed = parseRequirementsTxt("requirements.txt", content);

    expect(parsed.length).toBe(4);
    expect(parsed[0].name).toBe("fastapi");
    expect(parsed[0].ecosystem).toBe("PyPI");
    expect(parsed[1].name).toBe("uvicorn");
    expect(parsed[2].name).toBe("django");
    expect(parsed[3].name).toBe("pytest");
  });

  it("parses pyproject.toml dependencies", () => {
    const tomlContent = `
[tool.poetry]
name = "demo"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.11"
requests = "^2.31.0"
pydantic = ">=2.0"
`;
    const parsed = parsePyprojectToml("pyproject.toml", tomlContent);
    expect(parsed.length).toBe(2);
    expect(parsed.some((p) => p.name === "requests")).toBe(true);
    expect(parsed.some((p) => p.name === "pydantic")).toBe(true);
  });
});

describe("Phase 5 — GitHub Actions Auditor (SCANNER_RULES.md Section 2)", () => {
  it("detects all CI/CD vulnerabilities in vulnerable-ci.yml fixture", () => {
    const wfPath = path.join(FIXTURES_DIR, "workflows", "vulnerable-ci.yml");
    const content = fs.readFileSync(wfPath, "utf-8");
    const findings = scanGitHubActions(".github/workflows/vulnerable-ci.yml", content, "scan_fixture");

    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-WRITE-ALL")).toBe(true);
    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-UNPINNED")).toBe(true);
    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-PULL-REQUEST-TARGET")).toBe(true);
    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-CURL-PIPE-SHELL")).toBe(true);
    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-SCRIPT-INJECTION")).toBe(true);
  });

  it("passes clean secure-ci.yml fixture with pinned SHAs and least privilege", () => {
    const wfPath = path.join(FIXTURES_DIR, "workflows", "secure-ci.yml");
    const content = fs.readFileSync(wfPath, "utf-8");
    const findings = scanGitHubActions(".github/workflows/secure-ci.yml", content, "scan_fixture_secure");

    expect(findings.length).toBe(0);
  });

  it("flags missing permissions when no permissions block is declared", () => {
    const unconfiguredWf = `
name: Build
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
`;
    const findings = scanGitHubActions(".github/workflows/build.yml", unconfiguredWf, "scan_test");
    expect(findings.some((f) => f.ruleId === "GH-ACTIONS-MISSING-PERMISSIONS")).toBe(true);
  });
});

describe("Phase 5 — Repository Health & Community Standards (SCANNER_RULES.md Section 4)", () => {
  it("flags missing health files with exact canonical rule IDs", () => {
    const { findings, healthScore } = checkRepositoryHealth([], "scan_test");

    expect(findings.some((f) => f.ruleId === "REPO-MISSING-SECURITY")).toBe(true);
    expect(findings.some((f) => f.ruleId === "REPO-MISSING-LICENSE")).toBe(true);
    expect(findings.some((f) => f.ruleId === "REPO-MISSING-CONTRIBUTING")).toBe(true);
    expect(findings.some((f) => f.ruleId === "REPO-WEAK-README")).toBe(true);
    expect(findings.some((f) => f.ruleId === "REPO-NO-TEST-SIGNAL")).toBe(true);
    expect(healthScore).toBe(0);
  });

  it("awards full score when all community and test files are present", () => {
    const completeRepo = [
      {
        path: "README.md",
        size: 200,
        content: "# ContribLens OSS\nComprehensive open-source security navigator for contributors and maintainers.",
      },
      { path: "LICENSE", size: 100, content: "MIT License\nCopyright (c) 2026" },
      {
        path: "SECURITY.md",
        size: 100,
        content: "# Security Policy\nPlease report vulnerabilities to security@example.com",
      },
      {
        path: "CONTRIBUTING.md",
        size: 100,
        content: "# Contributing Guide\n1. Run tests\n2. Open PR",
      },
      { path: "tests/main.test.ts", size: 50, content: 'test("ok", () => {})' },
    ];
    const { findings, healthScore } = checkRepositoryHealth(completeRepo, "scan_test");
    expect(findings.length).toBe(0);
    expect(healthScore).toBe(100);
  });
});

describe("Phase 5 — Technology Stack & Signal Tracking (SCANNER_RULES.md Section 6)", () => {
  it("tracks source paths and confidence for languages, frameworks, and tooling", () => {
    const pkgPath = path.join(FIXTURES_DIR, "manifests", "package.json");
    const pkgContent = fs.readFileSync(pkgPath, "utf-8");
    const parsedPkg = parsePackageJson("package.json", pkgContent);

    const files = [
      { path: "package.json", size: 400, content: pkgContent },
      { path: "src/index.ts", size: 100, content: "export const app = true;" },
      { path: "src/components/App.tsx", size: 200, content: "export default function App() {}" },
      { path: "Dockerfile", size: 150, content: "FROM node:20" },
      { path: ".github/workflows/ci.yml", size: 150, content: "name: CI" },
      { path: ".eslintrc.json", size: 50, content: "{}" },
    ];

    const { techStack, readinessScore } = detectTechnologyStack(
      files,
      {
        dependencies: parsedPkg.dependencies.map((d) => ({ name: d.name })),
        scripts: parsedPkg.scripts,
      }
    );

    const tsLang = techStack.languages.find((l) => l.name === "TypeScript");
    expect(tsLang).toBeDefined();
    expect(tsLang!.sources && tsLang!.sources.length > 0).toBe(true);

    const nextFw = techStack.frameworks.find((f) => f.name === "Next.js");
    expect(nextFw).toBeDefined();

    const dockerTool = techStack.tooling.find((t) => t.name === "Docker");
    expect(dockerTool).toBeDefined();

    expect(readinessScore).toBeGreaterThanOrEqual(70);

    const snapshot = convertToTechnologySnapshot(techStack);
    expect(snapshot.languages.some((l) => l.name === "TypeScript")).toBe(true);
    expect(snapshot.frameworks.some((f) => f.name === "Next.js")).toBe(true);
    expect(snapshot.tooling.some((t) => t.name === "Docker")).toBe(true);
  });
});

describe("Phase 5 — Evidence Schema Normalization & Skills Mapping", () => {
  it("normalizes findings into FindingEvidence contract with SHA-256 hash and skills", () => {
    const evidence = createFindingEvidence({
      scanId: "scan_123",
      category: "github-actions",
      ruleId: "GH-ACTIONS-UNPINNED",
      title: "Unpinned GitHub Action",
      severity: "medium",
      confidence: 0.95,
      sourceTool: "ContribLens CI Auditor",
      file: ".github/workflows/ci.yml",
      lineStart: 15,
      lineEnd: 15,
      evidence: "uses: actions/checkout@v3",
      impact: "Tag mutation can execute unreviewed code.",
      fixHint: "Pin to 40-character SHA.",
      disclosureMode: "public-issue",
    });

    expect(evidence.id).toContain("GH-ACTIONS-UNPINNED");
    expect(evidence.evidenceHash.length).toBe(64);
    expect(evidence.skills.length).toBeGreaterThan(0);
    expect(evidence.learningResources.length).toBeGreaterThan(0);
    expect(evidence.fingerprint).toBeDefined();
    expect(evidence.disclosureMode).toBe("public-issue");
  });

  it("enforces security-disclosure mode for secret findings", () => {
    const secEvidence = createFindingEvidence({
      scanId: "scan_123",
      category: "secret",
      ruleId: "SECRET-AWS-KEY",
      title: "Exposed AWS Access Key",
      severity: "critical",
      confidence: 1.0,
      sourceTool: "Secret Scanner",
      file: ".env",
      lineStart: 1,
      evidence: "AKIA************MPLE",
      impact: "Unauthorized cloud infrastructure access.",
      fixHint: "Revoke and rotate credentials immediately.",
    });

    expect(secEvidence.disclosureMode).toBe("security-disclosure");
    expect(secEvidence.redacted).toBe(true);
  });
});

describe("Phase 5 — Scan Diff Engine & Fingerprints", () => {
  it("computes stable SHA-256 fingerprints across identical findings", () => {
    const f1 = createFindingEvidence({
      scanId: "scan_1",
      category: "github-actions",
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "write-all",
      severity: "high",
      confidence: 0.95,
      sourceTool: "scanner",
      file: ".github/workflows/ci.yml",
      lineStart: 12,
      evidence: "permissions: write-all",
      impact: "risk",
      fixHint: "fix",
    });

    const f2 = createFindingEvidence({
      scanId: "scan_2",
      category: "github-actions",
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "write-all",
      severity: "high",
      confidence: 0.95,
      sourceTool: "scanner",
      file: ".github/workflows/ci.yml",
      lineStart: 12,
      evidence: "permissions: write-all",
      impact: "risk",
      fixHint: "fix",
    });

    const fp1 = computeFindingFingerprint(f1);
    const fp2 = computeFindingFingerprint(f2);
    expect(fp1).toBe(fp2);
  });

  it("accurately classifies diff items between two scans", () => {
    const f1 = createFindingEvidence({
      scanId: "scan_1",
      category: "github-actions",
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "write-all",
      severity: "high",
      confidence: 0.95,
      sourceTool: "scanner",
      file: ".github/workflows/ci.yml",
      lineStart: 12,
      evidence: "permissions: write-all",
      impact: "risk",
      fixHint: "fix",
    });

    const scanSummary1: ScanSummary = {
      id: "scan_1",
      repoUrl: "https://github.com/owner/repo",
      repoName: "owner/repo",
      owner: "owner",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 10,
      totalBytes: 5000,
      status: "completed",
      readinessScore: 80,
      techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 100 },
      findingsCount: { total: 1, critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    };

    const scanSummary2: ScanSummary = {
      ...scanSummary1,
      id: "scan_2",
      scannedAt: new Date().toISOString(),
      findingsCount: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    };

    // Scan 2 has 0 findings; f1 should be detected as "resolved"
    const comparison = compareScans(scanSummary2, [], scanSummary1, [f1]);
    expect(comparison.summary.resolvedCount).toBe(1);
    expect(comparison.diffs[0].status).toBe("resolved");
  });
});

describe("Phase 5 — Deterministic Repository File Scanner (In-Memory)", () => {
  it("scans bounded files in-memory without network calls", () => {
    const files = [
      {
        path: ".github/workflows/ci.yml",
        size: 200,
        content: `name: CI
on: push
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
`,
      },
      {
        path: "package.json",
        size: 150,
        content: JSON.stringify({
          name: "test-app",
          dependencies: { express: "^4.18.2" },
        }),
      },
      {
        path: "README.md",
        size: 150,
        content: "# Test App\nA simple application for testing deterministic scanner execution.",
      },
      {
        path: "LICENSE",
        size: 50,
        content: "MIT License",
      },
      {
        path: "SECURITY.md",
        size: 50,
        content: "# Security Policy\nReport security issues responsibly.",
      },
      {
        path: "CONTRIBUTING.md",
        size: 50,
        content: "# Contributing\nSubmit PRs against main.",
      },
      {
        path: "test/app.test.js",
        size: 50,
        content: "test('ok', () => {});",
      },
    ];

    const result = scanRepositoryFiles(files, "scan_pure_test", {
      licenseName: "MIT",
      repoName: "test/app",
    });

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.ruleId === "GH-ACTIONS-WRITE-ALL")).toBe(true);
    expect(result.findings.some((f) => f.ruleId === "GH-ACTIONS-UNPINNED")).toBe(true);
    expect(result.readinessScore).toBeGreaterThanOrEqual(80);
    expect(result.techStack.languages.length).toBeGreaterThan(0);
  });

  it("produces exact 8-step trust chain matching EVIDENCE_AND_SCHEMAS.md Section 9", () => {
    const finding = createFindingEvidence({
      scanId: "scan_chain_test",
      category: "github-actions",
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "write-all declared",
      severity: "high",
      confidence: 0.98,
      sourceTool: "CI Auditor",
      file: ".github/workflows/ci.yml",
      lineStart: 12,
      evidence: "permissions: write-all",
      impact: "Broad write access",
      fixHint: "Declare minimum required permissions",
      disclosureMode: "public-issue",
    });

    const chain = buildEvidenceChain(finding, { repoName: "owner/repo" });
    expect(chain.steps.length).toBe(8);

    const stepLabels = chain.steps.map((s) => s.label);
    expect(stepLabels).toEqual([
      "URL validated",
      "Bounded tree fetched",
      "Redaction applied (in-memory)",
      "SHA-256 evidence hash",
      "Deterministic rule match",
      "OSV cross-check",
      "Evidence normalization",
      "Redacted persistence",
    ]);

    expect(chain.evidenceHash.length).toBe(64);
    expect(chain.verificationStatus).toBe("verified");
  });

  it("maps rules to accurate skills, free learning resources, and contributorLevelImpact per SCANNER_RULES.md", () => {
    const writeAll = createFindingEvidence({
      scanId: "scan_rules_test",
      category: "github-actions",
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "write-all",
      severity: "high",
      confidence: 0.98,
      sourceTool: "CI Auditor",
      file: ".github/workflows/ci.yml",
      evidence: "permissions: write-all",
      impact: "risk",
      fixHint: "fix",
    });
    expect(writeAll.skills).toContain("GitHub Actions");
    expect(writeAll.skills).toContain("Principle of least privilege");
    expect(writeAll.contributorLevelImpact).toBe(25);
    expect(writeAll.learningResources.every((r) => ["MDN", "freeCodeCamp", "docs", "youtube"].includes(r.provider))).toBe(true);

    const unpinned = createFindingEvidence({
      scanId: "scan_rules_test",
      category: "github-actions",
      ruleId: "GH-ACTIONS-UNPINNED",
      title: "unpinned action",
      severity: "medium",
      confidence: 0.90,
      sourceTool: "CI Auditor",
      file: ".github/workflows/ci.yml",
      evidence: "uses: actions/checkout@v3",
      impact: "risk",
      fixHint: "fix",
    });
    expect(unpinned.skills).toContain("Supply-chain security");
    expect(unpinned.contributorLevelImpact).toBe(20);

    const missingLicense = createFindingEvidence({
      scanId: "scan_rules_test",
      category: "repository-health",
      ruleId: "REPO-MISSING-LICENSE",
      title: "missing license",
      severity: "low",
      confidence: 0.99,
      sourceTool: "Health Auditor",
      file: "LICENSE",
      evidence: "No license found",
      impact: "risk",
      fixHint: "fix",
    });
    expect(missingLicense.skills).toContain("Licensing");
    expect(missingLicense.contributorLevelImpact).toBe(15);
  });
});
