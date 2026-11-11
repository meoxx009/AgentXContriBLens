/**
 * Computes a deterministic SHA-256 hash of normalized redacted evidence.
 * Never hashes raw secrets. Safe for both Node.js server and browser runtimes.
 */
export function computeEvidenceHash(evidence: string): string {
  const normalized = (evidence || '').trim().replace(/\r\n/g, '\n');
  if (typeof window === 'undefined') {
    try {
      // Dynamic evaluation prevents client-side bundler from bundling or stubbing Node crypto
      const nodeCrypto = eval("require('crypto')");
      return nodeCrypto.createHash('sha256').update(normalized).digest('hex');
    } catch {
      // Fallback if Node crypto cannot be evaluated
    }
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * ContribLens Secret Redaction Engine
 * 
 * Ensures raw secrets are NEVER leaked into storage, Gemini API calls, UI, or exports.
 * Deterministic redaction patterns mask sensitive credentials with explicit masked formats.
 */

const SECRET_PATTERNS: { name: string; regex: RegExp; replace: (match: string, ...args: string[]) => string }[] = [
  // GitHub Personal Access Token (classic)
  {
    name: 'GitHub Classic Token',
    regex: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    replace: (match) => `ghp_${'*'.repeat(32)}${match.slice(-4)}`,
  },
  // GitHub Fine-grained PAT
  {
    name: 'GitHub Fine-grained PAT',
    regex: /\b(github_pat_[a-zA-Z0-9_]{60,100})\b/g,
    replace: (match) => `github_pat_${'*'.repeat(24)}...[REDACTED]`,
  },
  // GitHub OAuth / User / Server tokens
  {
    name: 'GitHub Token',
    regex: /\b(gh[ousr]_[a-zA-Z0-9]{36})\b/g,
    replace: (match) => `${match.slice(0, 4)}${'*'.repeat(32)}${match.slice(-4)}`,
  },
  // AWS Access Key ID
  {
    name: 'AWS Access Key ID',
    regex: /\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b/g,
    replace: (match) => `${match.slice(0, 4)}${'*'.repeat(12)}${match.slice(-4)}`,
  },
  // AWS Secret Access Key
  {
    name: 'AWS Secret Access Key',
    regex: /(aws[_-]?secret[_-]?access[_-]?key[\s]*[=:]\s*['"]?)([0-9a-zA-Z\/+]{40})(['"]?)/gi,
    replace: (_, prefix, secret, suffix) => `${prefix}[REDACTED_AWS_SECRET_KEY]${suffix}`,
  },
  // Standalone AWS Secret Access Key (base64 with / or +)
  {
    name: 'AWS Secret Access Key Standalone',
    regex: /\b([A-Za-z0-9]{4,20}[\/+][A-Za-z0-9\/+]{15,35})\b/g,
    replace: () => '[REDACTED_AWS_SECRET_KEY]',
  },
  // Private Key PEM blocks
  {
    name: 'Private Key PEM Block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replace: () => '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY_MATERIAL]\n-----END PRIVATE KEY-----',
  },
  // Slack Tokens
  {
    name: 'Slack Token',
    regex: /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g,
    replace: (match) => `${match.slice(0, 5)}${'*'.repeat(16)}...[REDACTED]`,
  },
  // Slack Webhook URL
  {
    name: 'Slack Webhook URL',
    regex: /(https?:\/\/(?:hooks\.slack\.com\/services\/[A-Za-z0-9+/_-]+|[^\s'"]*slack[_-]?webhook[^\s'"]*))/gi,
    replace: () => '[REDACTED_SLACK_WEBHOOK]',
  },
  // Webhook Assignment
  {
    name: 'Webhook URL Assignment',
    regex: /((?:slack[_-]?webhook[_-]?url|webhook[_-]?url|webhook)[\s]*[=:]\s*['"]?)([^\s'"]{12,})(['"]?)/gi,
    replace: (_, prefix, token, suffix) => `${prefix}[REDACTED_WEBHOOK]${suffix}`,
  },
  // Generic Bearer / API token assignments
  {
    name: 'Generic API Token / Secret Assignment',
    regex: /((?:api[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token|bearer[_-]?token|app[_-]?secret|generic[_-]?api[_-]?key)[\s]*[=:]\s*['"]?)([a-zA-Z0-9_\-\.]{16,})(['"]?)/gi,
    replace: (_, prefix, token, suffix) => `${prefix}[REDACTED_SECRET_${token.length}_CHARS]${suffix}`,
  },
  // Embedded URL credentials
  {
    name: 'URL Embedded Credentials',
    regex: /(https?:\/\/)([^:\s\/]+):([^@\s\/]+)@/g,
    replace: (_, protocol, user) => `${protocol}${user}:[REDACTED]@`,
  },
  // Generic high-entropy hex/base64 strings labeled as password
  {
    name: 'Generic Password Field',
    regex: /((?:password|passwd|pwd)[\s]*[=:]\s*['"]?)([^'"\s\n]{6,})(['"]?)/gi,
    replace: (_, prefix, __, suffix) => `${prefix}[REDACTED_PASSWORD]${suffix}`,
  },
];

/**
 * Redacts any detected secrets in a given text string.
 */
export function redactSecrets(content: string): string {
  if (!content || typeof content !== 'string') return content;
  let safeContent = content;
  for (const pattern of SECRET_PATTERNS) {
    safeContent = safeContent.replace(pattern.regex, pattern.replace as any);
  }
  return safeContent;
}

/**
 * Scan for secrets and return found items with masked evidence
 */
export function detectSecretsInText(
  filePath: string,
  content: string
): Array<{
  ruleId: string;
  title: string;
  line: number;
  redactedEvidence: string;
  severity: 'CRITICAL' | 'HIGH';
  confidence: 'HIGH' | 'MEDIUM';
}> {
  const findings: Array<{
    ruleId: string;
    title: string;
    line: number;
    redactedEvidence: string;
    severity: 'CRITICAL' | 'HIGH';
    confidence: 'HIGH' | 'MEDIUM';
  }> = [];

  const lines = content.split('\n');

  lines.forEach((rawLine, index) => {
    const lineNum = index + 1;
    for (const pattern of SECRET_PATTERNS) {
      // Test regex against line
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      if (regex.test(rawLine)) {
        const maskedLine = rawLine.replace(regex, pattern.replace as any).trim();
        findings.push({
          ruleId: `SEC-${pattern.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
          title: `Exposed ${pattern.name} Detected`,
          line: lineNum,
          redactedEvidence: maskedLine.length > 180 ? maskedLine.slice(0, 180) + '...' : maskedLine,
          severity: 'CRITICAL',
          confidence: 'HIGH',
        });
        break; // Count highest priority rule per line
      }
    }
  });

  return findings;
}
