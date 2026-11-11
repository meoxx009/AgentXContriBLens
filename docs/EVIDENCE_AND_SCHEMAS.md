# ContribLens v2 — Evidence & AI Schemas

**Status:** Contract between deterministic code and AI · `Code verifies → evidence schema → AI explains → validator accepts/rejects`

---

## 1. Design Rule

Every scanner result normalizes into ONE evidence contract — the boundary between deterministic code and the AI layer (Gemma 4 31B → Gemini → deterministic). All TypeScript types live in `types/`.

## 2. Finding Schema

```ts
type FindingCategory = "dependency" | "github-actions" | "secret" | "repository-health";
type Severity = "critical" | "high" | "medium" | "low" | "info";
type DisclosureMode = "public-issue" | "maintainer-review" | "security-disclosure";

interface FindingEvidence {
  id: string;                    // stable: rule + scan + location
  scanId: string;
  category: FindingCategory;
  ruleId: string;                // maps to SCANNER_RULES.md
  title: string;
  severity: Severity;            // deterministic — AI cannot change
  confidence: number;            // 0..1
  sourceTool: string;
  file: string | null;           // repo-relative normalized path
  lineStart: number | null;      // 1-based
  lineEnd: number | null;
  evidence: string;              // REDACTED only — never raw secrets
  impact: string;
  fixHint: string;
  skills: string[];              // what you learn fixing this
  learningResources: LearningResource[];
  disclosureMode: DisclosureMode;
  redacted: boolean;
  evidenceHash: string;          // SHA-256 of normalized redacted evidence
  fingerprint: string;           // stable diff key (rule + path + evidence core)
  createdAt: string;
}

interface LearningResource { title: string; url: string; provider: "MDN" | "freeCodeCamp" | "docs" | "youtube"; }
```

## 3. Evidence Rules

- `evidenceHash` = SHA-256 of normalized redacted evidence (never a raw-secret hash); surfaced in the finding detail UI.
- `disclosureMode` is deterministic — AI cannot change it.
- `redacted=true` for all secret-related evidence; raw secrets never leave memory.
- `file` normalized repo-relative or `null`; lines 1-based when known.

## 4. Technology Snapshot

```ts
interface TechnologySnapshot {
  languages:  TechnologySignal[];  frameworks: TechnologySignal[];
  tooling:    TechnologySignal[];  manifests:  ManifestSignal[];
}
interface TechnologySignal { name: string; confidence: number; sources: string[]; }
interface ManifestSignal   { type: "package.json"|"package-lock.json"|"yarn.lock"|"pnpm-lock.yaml"|"requirements.txt"|"pyproject.toml"|"workflow"|"other"; file: string; present: boolean; }
```

## 5. Contribution Route Schema

```ts
interface ContributionRoute {
  id: string; scanId: string; findingIds: string[];
  title: string; summary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  skills: string[];
  learningResources: LearningResource[];   // FREE links only (MDN/freeCodeCamp/docs/YouTube)
  contributorLevelImpact: number;          // points to contributor level on completion
  files: string[];
  suggestedChange: string;
  testPlan: string[];
  acceptanceCriteria: string[];
  readiness: {                             // deterministic, 0–100
    documentationClarity: number; testAvailability: number; ciAutomation: number;
    dependencyFreshness: number; securityGovernance: number; total: number;
  };
  status: "not-started" | "in-progress" | "needs-review" | "completed";
}
```

## 6. AI Request Contract

```ts
interface AIPlanRequest {
  operation: "explain" | "route" | "issue" | "summary";
  scanId: string;
  findingIds: string[];
  evidence: FindingEvidence[];       // server-loaded, redacted, minimal
  technologies: TechnologySnapshot;
  outputLanguage: "en";
  model: "gemma-4-31b-it" | "gemini-2.5-flash";
}
```
Server must: load user-owned findings from DB · ignore client-supplied severity/evidence · redact defensively again · strip unneeded file contents · enforce size limits · instruct: every claim must be grounded in supplied finding IDs.

## 7. AI Response Contract

```ts
interface AIPlanResponse {
  findingIds: string[];
  explanation: string;            // plain English, grounded
  priorityReason: string;
  taskTitle: string; taskSummary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  skills: string[];
  files: string[];
  testPlan: string[];
  acceptanceCriteria: string[];
  unsupportedClaims: string[];    // must be empty to accept
  issueMarkdown: string | null;
  modelUsed: "gemma-4-31b-it" | "gemini-2.5-flash";
}
```
**Reject the response when:** unknown finding ID referenced · `unsupportedClaims` non-empty · files not present in evidence/metadata · deterministic severity/confidence changed · secret-like content detected · required fields missing · Markdown contains a secret or auto-publication instruction. On rejection → next model in chain → deterministic engine.

## 8. Deterministic Fallback Planner

Uses rule metadata + templates. Produces a concrete, rule-specific explanation (not "a finding was detected") without claiming AI was used. Must always produce a useful explanation for supported rules — this is the KEYLESS demo engine (judge path).

## 9. Evidence Chain — 8 Trust Steps (displayed in UI)

```text
1 URL validated → 2 bounded tree fetched → 3 redaction applied (in-memory)
→ 4 SHA-256 evidence hash → 5 deterministic rule match → 6 OSV cross-check
→ 7 evidence normalization → 8 redacted persistence
```
Every finding detail view renders this chain; the hash is copyable for verification.

## 10. Prompt-Injection Boundaries

Repository text is QUOTED EVIDENCE inside untrusted fences — never instructions. Repository text cannot: override system prompts, change severity/confidence, alter disclosure mode, or trigger tools. Validator rejects any response referencing unknown IDs or unevidenced claims.
