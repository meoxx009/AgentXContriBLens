/**
 * ContribLens Manifest Parser
 * Deterministic detection and dependency extraction for JavaScript and Python manifests.
 */

export interface ParsedDependency {
  name: string;
  version: string;
  ecosystem: 'npm' | 'PyPI';
  sourceFile: string;
  isDev?: boolean;
}

export function parsePackageJson(filePath: string, content: string): {
  dependencies: ParsedDependency[];
  scripts: Record<string, string>;
  hasSecurityTools: boolean;
  packageManager?: string;
} {
  const dependencies: ParsedDependency[] = [];
  let scripts: Record<string, string> = {};
  let hasSecurityTools = false;
  let packageManager: string | undefined = undefined;

  try {
    const json = JSON.parse(content);
    scripts = json.scripts || {};
    if (typeof json.packageManager === 'string' && json.packageManager.trim()) {
      packageManager = json.packageManager.trim();
    }

    if (json.dependencies && typeof json.dependencies === 'object') {
      for (const [name, versionSpec] of Object.entries(json.dependencies)) {
        const cleanVersion = String(versionSpec).replace(/[\^~>=<v]/g, '').trim();
        dependencies.push({
          name,
          version: cleanVersion,
          ecosystem: 'npm',
          sourceFile: filePath,
          isDev: false,
        });
      }
    }

    if (json.devDependencies && typeof json.devDependencies === 'object') {
      for (const [name, versionSpec] of Object.entries(json.devDependencies)) {
        const cleanVersion = String(versionSpec).replace(/[\^~>=<v]/g, '').trim();
        dependencies.push({
          name,
          version: cleanVersion,
          ecosystem: 'npm',
          sourceFile: filePath,
          isDev: true,
        });

        if (
          name.includes('eslint') ||
          name.includes('audit') ||
          name.includes('snyk') ||
          name.includes('security')
        ) {
          hasSecurityTools = true;
        }
      }
    }
  } catch (err) {
    // Malformed JSON handled gracefully
  }

  return { dependencies, scripts, hasSecurityTools, packageManager };
}

export function parseRequirementsTxt(filePath: string, content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    // Matches package==1.2.3 or package>=1.2.3 or package~=1.2.3
    const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*(?:==|>=|<=|~=|>|<)?\s*([0-9a-zA-Z\.\-_]*)/);
    if (match) {
      const name = match[1];
      const version = match[2] || '0.0.0';
      dependencies.push({
        name,
        version,
        ecosystem: 'PyPI',
        sourceFile: filePath,
        isDev: false,
      });
    }
  }

  return dependencies;
}

export function parsePyprojectToml(filePath: string, content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split('\n');
  let inDependenciesSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inDependenciesSection =
        trimmed.includes('dependencies') ||
        trimmed.includes('tool.poetry.dependencies');
      continue;
    }

    if (inDependenciesSection && trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        const name = match[1];
        if (name.toLowerCase() !== 'python') {
          dependencies.push({
            name,
            version: match[2].replace(/[\^~>=<]/g, '').trim(),
            ecosystem: 'PyPI',
            sourceFile: filePath,
            isDev: false,
          });
        }
      }
    }
  }

  return dependencies;
}
