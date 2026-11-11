/**
 * Scanner Safety Bounds and Concurrency Invariants
 * 
 * Single source of truth for repository ingestion boundaries.
 * Bounded ingestion guarantees predictable server execution, protects
 * serverless memory budgets, and prevents resource exhaustion attacks.
 * 
 * Safety Bounds:
 * - 60 configuration/manifest/code files maximum.
 * - 180 KB maximum per individual file (Buffer.byteLength in UTF-8).
 * - 15 MiB cumulative content byte limit across all ingested files.
 * - 20,000 tree entries maximum before repository truncation.
 */

export const SCAN_MAX_FILES: number = Number(process.env.SCAN_MAX_FILES) || 60;
export const SCAN_MAX_FILE_BYTES: number = Number(process.env.SCAN_MAX_FILE_BYTES) || 180 * 1024; // 180 KB
export const SCAN_MAX_TOTAL_BYTES: number = Number(process.env.SCAN_MAX_TOTAL_BYTES) || 15 * 1024 * 1024; // 15 MiB
export const SCAN_MAX_TREE_ENTRIES: number = Number(process.env.SCAN_MAX_TREE_ENTRIES) || 20000;
export const SCAN_MAX_TOTAL_MB: number = 15;
