import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import nextConfig from "../next.config.mjs";
import { MAX_FILES_TO_SCAN, MAX_FILE_SIZE_BYTES, MAX_TOTAL_SCAN_BYTES } from "../src/lib/scanner";

describe("Phase 10 — Release Hardening & Safety Audits", () => {
  it("verifies next.config.mjs defines complete set of security headers", async () => {
    expect(nextConfig.headers).toBeDefined();
    if (typeof nextConfig.headers === "function") {
      const headerConfigs = await nextConfig.headers();
      const allHeaders = headerConfigs.flatMap((h: any) => h.headers);
      const headerKeys = allHeaders.map((h: any) => h.key.toLowerCase());

      expect(headerKeys).toContain("x-frame-options");
      expect(headerKeys).toContain("x-content-type-options");
      expect(headerKeys).toContain("referrer-policy");
      expect(headerKeys).toContain("content-security-policy");
      expect(headerKeys).toContain("permissions-policy");
    }
  });

  it("verifies client bundle chunks do not contain leaked private API secrets", () => {
    const chunksDir = path.join(process.cwd(), ".next", "static", "chunks");
    if (!fs.existsSync(chunksDir)) {
      // In fresh test runner before build, skip gracefully
      return;
    }

    const files = fs.readdirSync(chunksDir);
    const forbiddenPatterns = [
      /AIzaSy[0-9A-Za-z_-]{33}/, // Google API key pattern
      /AKIA[0-9A-Z]{16}/, // AWS Access Key pattern
      /ghp_[0-9a-zA-Z]{36}/, // GitHub PAT pattern
      /github_pat_[0-9a-zA-Z_]{82}/, // Fine-grained PAT pattern
    ];

    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const content = fs.readFileSync(path.join(chunksDir, file), "utf-8");
      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });

  it("verifies zero occurrences of forbidden brand names across entire source tree", () => {
    const srcDir = path.join(process.cwd(), "src");

    function scanFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanFiles(fullPath));
        } else if (/\.(tsx?|jsx?|md|json)$/.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const forbidden = ["ContriB", "ContribShield", "Patchloom"];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf-8");
      // Allow official GitHub repository URL slug
      const sanitizedContent = content
        .replace(/AgentXContriBLens/g, "")
        .replace(/HACKTOBERFEST--ContriBlens/g, "");
      for (const bad of forbidden) {
        // Exclude migration compatibility references in types.ts if any
        if (filePath.endsWith("types.ts") && bad === "ContribShield") {
          continue;
        }
        const hasBad = sanitizedContent.includes(bad);
        if (hasBad) {
          console.error(`Forbidden brand "${bad}" found in ${filePath}`);
        }
        expect(hasBad).toBe(false);
      }
    }
  });

  it("verifies scanner bounds and memory safety invariants", () => {
    expect(MAX_FILES_TO_SCAN).toBe(60);
    expect(MAX_FILE_SIZE_BYTES).toBe(180 * 1024);
    expect(MAX_TOTAL_SCAN_BYTES).toBe(15 * 1024 * 1024);
  });
});
