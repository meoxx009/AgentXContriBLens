import { describe, it, expect } from "vitest";
import { FindingEvidenceSchema, AIPlanResponseSchema } from "@/types";

describe("Phase 0 — Project Setup & Type Contracts", () => {
  it("validates finding evidence schema with SHA-256 and redacted properties", () => {
    const validFinding = {
      id: "gh-actions-write-all-001",
      scanId: "scan-123",
      category: "github-actions" as const,
      ruleId: "GH-ACTIONS-WRITE-ALL",
      title: "GitHub Actions workflow declares write-all permissions",
      severity: "high" as const,
      confidence: 0.98,
      sourceTool: "contriblens-actions-scanner",
      file: ".github/workflows/ci.yml",
      lineStart: 12,
      lineEnd: 12,
      evidence: "permissions: write-all",
      impact: "Grants write access to repository contents, packages, and issues for all jobs.",
      fixHint: "Specify minimum required permissions such as contents: read.",
      skills: ["GitHub Actions", "YAML", "Principle of least privilege"],
      learningResources: [
        {
          title: "GitHub Actions Workflow Permissions",
          url: "https://docs.github.com/en/actions/security-guides/automatic-token-authentication",
          provider: "docs" as const,
        },
      ],
      disclosureMode: "public-issue" as const,
      redacted: false,
      evidenceHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      fingerprint: "gh-actions-write-all:.github/workflows/ci.yml:permissions:write-all",
      createdAt: new Date().toISOString(),
    };

    const parsed = FindingEvidenceSchema.safeParse(validFinding);
    expect(parsed.success).toBe(true);
  });

  it("validates AI plan response schema with grounded claims", () => {
    const validPlan = {
      findingIds: ["gh-actions-write-all-001"],
      explanation: "The workflow has write-all permissions set, exposing repository secrets to workflow runs.",
      priorityReason: "High risk of credential leakage in PR actions.",
      taskTitle: "Scope down GitHub Actions CI permissions",
      taskSummary: "Update CI workflow to explicitly grant only read permissions.",
      difficulty: "beginner" as const,
      skills: ["GitHub Actions", "Security"],
      files: [".github/workflows/ci.yml"],
      testPlan: ["Trigger PR workflow and verify build passes"],
      acceptanceCriteria: ["permissions block declares contents: read"],
      unsupportedClaims: [],
      issueMarkdown: "# Fix: CI permissions\n\nDeclared read-only permissions.",
      modelUsed: "gemma-4-31b-it" as const,
    };

    const parsed = AIPlanResponseSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
  });
});
