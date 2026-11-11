/**
 * ContribLens Technology Stack & Readiness Detector
 * 
 * Accurately detects programming languages, frameworks, dependencies, package manifests,
 * package managers, and development tooling with empirical confidence levels and
 * calculates the Contribution Readiness Score.
 */

import type { TechStack, ManifestInfo, PackageManagerInfo, DirectDependency } from '../../types';
import type { BoundedFile } from './github';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.cs': 'C#',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.sql': 'SQL',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'SCSS',
  '.less': 'CSS',
  '.dart': 'Dart',
  '.scala': 'Scala',
  '.lua': 'Lua',
};

function cleanVersionString(v?: string): string | undefined {
  if (!v) return undefined;
  const cleaned = String(v).replace(/[\^~>=<v]/g, '').trim();
  return cleaned || undefined;
}

export function detectTechnologyStack(
  files: BoundedFile[],
  packageJsonData?: { dependencies: Array<{ name: string }>; scripts: Record<string, string> },
  pythonDeps?: Array<{ name: string }>
): { techStack: TechStack; readinessScore: number } {
  const langCounts: Record<string, number> = {};
  const langSources: Record<string, string[]> = {};
  let totalCodeFiles = 0;

  const frameworks: TechStack['frameworks'] = [];
  const tooling: TechStack['tooling'] = [];
  const manifests: ManifestInfo[] = [];
  const packageManagers: PackageManagerInfo[] = [];
  const directDependencies: DirectDependency[] = [];

  // Helper to add or augment tooling
  const addTooling = (name: string, category: string, source: string, confidence: number = 0.90) => {
    const existing = tooling.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.sources && !existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      existing.confidence = Math.max(existing.confidence ?? 0.8, confidence);
    } else {
      tooling.push({ name, category, sources: [source], confidence });
    }
  };

  // Helper to add or augment framework
  const addFramework = (name: string, category: string, source: string, version?: string, confidence: number = 0.95) => {
    const existing = frameworks.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.sources && !existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      if (!existing.version && version) {
        existing.version = version;
      }
      existing.confidence = Math.max(existing.confidence ?? 0.8, confidence);
    } else {
      frameworks.push({ name, category, version, sources: [source], confidence });
    }
  };

  // Helper to add or augment package manager
  const addPackageManager = (
    name: string,
    status: 'detected' | 'inferred',
    source: string,
    lockfile: string | null = null,
    version?: string,
    confidence: number = 0.95
  ) => {
    const existing = packageManagers.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (status === 'detected') existing.status = 'detected';
      if (lockfile && !existing.lockfile) existing.lockfile = lockfile;
      if (version && !existing.version) existing.version = version;
      existing.confidence = Math.max(existing.confidence, confidence);
    } else {
      packageManagers.push({ name, status, source, lockfile, version, confidence });
    }
    // Also mirror to tooling for backward-compatible views and tests
    addTooling(name, 'Package Manager', source, confidence);
  };

  // 1. First pass: Inspect file names, paths, and identify lockfiles & manifests
  const filePaths = new Set(files.map((f) => f.path.toLowerCase()));
  const hasLockfilePnpm = files.some((f) => f.path.toLowerCase().endsWith('pnpm-lock.yaml'));
  const hasLockfileYarn = files.some((f) => f.path.toLowerCase().endsWith('yarn.lock'));
  const hasLockfileBun = files.some((f) => {
    const lp = f.path.toLowerCase();
    return lp.endsWith('bun.lockb') || lp.endsWith('bun.lock');
  });
  const hasLockfileNpm = files.some((f) => f.path.toLowerCase().endsWith('package-lock.json'));
  const hasLockfilePoetry = files.some((f) => f.path.toLowerCase().endsWith('poetry.lock'));
  const hasLockfilePipenv = files.some((f) => f.path.toLowerCase().endsWith('pipfile.lock'));
  const hasLockfileCargo = files.some((f) => f.path.toLowerCase().endsWith('cargo.lock'));
  const hasLockfileGoSum = files.some((f) => f.path.toLowerCase().endsWith('go.sum'));

  let detectedNodePackageManager: { name: string; lockfile: string | null; status: 'detected' | 'inferred'; version?: string } | null = null;
  if (hasLockfilePnpm) {
    const pnpmFile = files.find((f) => f.path.toLowerCase().endsWith('pnpm-lock.yaml'))?.path || 'pnpm-lock.yaml';
    detectedNodePackageManager = { name: 'pnpm', lockfile: pnpmFile, status: 'detected' };
  } else if (hasLockfileYarn) {
    const yarnFile = files.find((f) => f.path.toLowerCase().endsWith('yarn.lock'))?.path || 'yarn.lock';
    detectedNodePackageManager = { name: 'Yarn', lockfile: yarnFile, status: 'detected' };
  } else if (hasLockfileBun) {
    const bunFile = files.find((f) => f.path.toLowerCase().endsWith('bun.lockb') || f.path.toLowerCase().endsWith('bun.lock'))?.path || 'bun.lock';
    detectedNodePackageManager = { name: 'Bun', lockfile: bunFile, status: 'detected' };
  } else if (hasLockfileNpm) {
    const npmFile = files.find((f) => f.path.toLowerCase().endsWith('package-lock.json'))?.path || 'package-lock.json';
    detectedNodePackageManager = { name: 'npm', lockfile: npmFile, status: 'detected' };
  }

  // 2. Second pass: Parse files, extract dependencies, languages, and tooling
  for (const file of files) {
    const lowerPath = file.path.toLowerCase();

    // Map extension to programming language
    const extMatch = file.path.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : '';
    const lang = EXTENSION_LANGUAGE_MAP[ext];
    if (lang) {
      langCounts[lang] = (langCounts[lang] || 0) + 1;
      if (!langSources[lang]) langSources[lang] = [];
      if (langSources[lang].length < 10) {
        langSources[lang].push(file.path);
      }
      totalCodeFiles++;
    }

    // A. Parse JavaScript / TypeScript package.json manifests
    if (lowerPath.endsWith('package.json')) {
      let depCount = 0;
      let explicitPkgMgr: string | undefined = undefined;

      try {
        const json = JSON.parse(file.content || '{}');

        // Check packageManager field in package.json (e.g. "pnpm@8.15.0" or "yarn@3.6.0")
        if (typeof json.packageManager === 'string' && json.packageManager.trim()) {
          const cleanPkgMgr = json.packageManager.trim();
          explicitPkgMgr = cleanPkgMgr;
          const [mgrName, mgrVersion] = cleanPkgMgr.split('@');
          if (mgrName) {
            const canonicalMgr = mgrName.toLowerCase() === 'pnpm' ? 'pnpm' :
              mgrName.toLowerCase() === 'yarn' ? 'Yarn' :
              mgrName.toLowerCase() === 'bun' ? 'Bun' : 'npm';
            addPackageManager(canonicalMgr, 'detected', file.path, detectedNodePackageManager?.lockfile ?? null, mgrVersion, 0.99);
          }
        }

        // Process production dependencies
        if (json.dependencies && typeof json.dependencies === 'object') {
          for (const [name, versionSpec] of Object.entries(json.dependencies)) {
            depCount++;
            const cleanVer = cleanVersionString(String(versionSpec));
            directDependencies.push({
              name,
              version: cleanVer,
              type: 'production',
              sourceFile: file.path,
            });

            // Detect frameworks from dependencies
            inspectNodeDependencyForFrameworks(name, cleanVer, file.path, addFramework, addTooling);
          }
        }

        // Process development dependencies
        if (json.devDependencies && typeof json.devDependencies === 'object') {
          for (const [name, versionSpec] of Object.entries(json.devDependencies)) {
            depCount++;
            const cleanVer = cleanVersionString(String(versionSpec));
            directDependencies.push({
              name,
              version: cleanVer,
              type: 'dev',
              sourceFile: file.path,
            });

            // Detect frameworks & tools from devDependencies
            inspectNodeDependencyForFrameworks(name, cleanVer, file.path, addFramework, addTooling);
          }
        }

        // Process peer dependencies
        if (json.peerDependencies && typeof json.peerDependencies === 'object') {
          for (const [name, versionSpec] of Object.entries(json.peerDependencies)) {
            depCount++;
            const cleanVer = cleanVersionString(String(versionSpec));
            directDependencies.push({
              name,
              version: cleanVer,
              type: 'peer',
              sourceFile: file.path,
            });
          }
        }
      } catch {
        // Fallback to caller-provided packageJsonData if JSON parsing in memory fails
        if (packageJsonData?.dependencies) {
          depCount = packageJsonData.dependencies.length;
        }
      }

      manifests.push({
        path: file.path,
        type: 'npm',
        dependenciesCount: depCount,
      });

      // If no explicit packageManager was recorded yet, use lockfile detection or fallback to npm
      if (!explicitPkgMgr) {
        if (detectedNodePackageManager) {
          addPackageManager(
            detectedNodePackageManager.name,
            detectedNodePackageManager.status,
            detectedNodePackageManager.lockfile || file.path,
            detectedNodePackageManager.lockfile,
            undefined,
            0.98
          );
        } else {
          addPackageManager('npm', 'inferred', file.path, null, undefined, 0.85);
        }
      }
    }

    // B. Parse Python requirements.txt
    else if (lowerPath.endsWith('requirements.txt')) {
      let pyDepCount = 0;
      const lines = (file.content || '').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*(?:==|>=|<=|~=|>|<)?\s*([0-9a-zA-Z\.\-_]*)/);
        if (match) {
          pyDepCount++;
          const name = match[1];
          const ver = match[2] || undefined;
          directDependencies.push({
            name,
            version: ver,
            type: 'production',
            sourceFile: file.path,
          });
          inspectPythonDependencyForFrameworks(name, ver, file.path, addFramework, addTooling);
        }
      }

      manifests.push({
        path: file.path,
        type: 'pip',
        dependenciesCount: pyDepCount || (pythonDeps?.length ?? 0),
      });

      addPackageManager('pip', 'detected', file.path, null, undefined, 0.95);
    }

    // C. Parse Python pyproject.toml
    else if (lowerPath.endsWith('pyproject.toml')) {
      let poetryDepCount = 0;
      const lines = (file.content || '').split('\n');
      let inDeps = false;
      let isPoetry = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          if (trimmed.includes('tool.poetry')) isPoetry = true;
          inDeps = trimmed.includes('dependencies') || trimmed.includes('tool.poetry.dependencies');
          continue;
        }
        if (inDeps && trimmed && !trimmed.startsWith('#')) {
          const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*=\s*['"]([^'"]+)['"]/);
          if (match && match[1].toLowerCase() !== 'python') {
            poetryDepCount++;
            const name = match[1];
            const ver = cleanVersionString(match[2]);
            directDependencies.push({
              name,
              version: ver,
              type: 'production',
              sourceFile: file.path,
            });
            inspectPythonDependencyForFrameworks(name, ver, file.path, addFramework, addTooling);
          }
        }
      }

      manifests.push({
        path: file.path,
        type: 'poetry',
        dependenciesCount: poetryDepCount || (pythonDeps?.length ?? 0),
      });

      const poetryLockFile = files.find((f) => f.path.toLowerCase().endsWith('poetry.lock'))?.path || null;
      if (isPoetry || hasLockfilePoetry) {
        addPackageManager('Poetry', 'detected', file.path, poetryLockFile, undefined, 0.98);
      } else {
        addPackageManager('pip', 'inferred', file.path, null, undefined, 0.90);
      }
    }

    // D. Parse Rust Cargo.toml
    else if (lowerPath.endsWith('cargo.toml')) {
      let cargoDepCount = 0;
      const lines = (file.content || '').split('\n');
      let inDeps = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          inDeps = trimmed.includes('dependencies');
          continue;
        }
        if (inDeps && trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          cargoDepCount++;
        }
      }

      manifests.push({
        path: file.path,
        type: 'cargo',
        dependenciesCount: cargoDepCount,
      });

      const cargoLock = files.find((f) => f.path.toLowerCase().endsWith('cargo.lock'))?.path || null;
      addPackageManager('Cargo', hasLockfileCargo ? 'detected' : 'inferred', file.path, cargoLock, undefined, 0.98);
    }

    // E. Parse Go go.mod
    else if (lowerPath.endsWith('go.mod')) {
      let goDepCount = 0;
      const lines = (file.content || '').split('\n');
      let inRequire = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('require (')) {
          inRequire = true;
          continue;
        }
        if (inRequire && trimmed.startsWith(')')) {
          inRequire = false;
          continue;
        }
        if ((inRequire || trimmed.startsWith('require ')) && trimmed && !trimmed.startsWith('//')) {
          goDepCount++;
        }
      }

      manifests.push({
        path: file.path,
        type: 'go_mod',
        dependenciesCount: goDepCount,
      });

      const goSum = files.find((f) => f.path.toLowerCase().endsWith('go.sum'))?.path || null;
      addPackageManager('Go modules', hasLockfileGoSum ? 'detected' : 'inferred', file.path, goSum, undefined, 0.98);
    }

    // F. Direct Configuration File & Tooling Detection
    if (lowerPath.includes('dockerfile') || lowerPath.endsWith('docker-compose.yml') || lowerPath.endsWith('compose.yaml')) {
      addTooling('Docker', 'Containerization', file.path, 0.95);
    }
    if (lowerPath.includes('.github/workflows/')) {
      addTooling('GitHub Actions', 'CI/CD', file.path, 0.98);
    }
    if (lowerPath.includes('.gitlab-ci.yml')) {
      addTooling('GitLab CI', 'CI/CD', file.path, 0.95);
    }
    if (lowerPath.includes('.eslintrc') || lowerPath.includes('eslint.config')) {
      addTooling('ESLint', 'Linter', file.path, 0.95);
    }
    if (lowerPath.includes('.prettierrc') || lowerPath.includes('prettier.config')) {
      addTooling('Prettier', 'Code Formatter', file.path, 0.95);
    }
    if (lowerPath.includes('biome.json')) {
      addTooling('Biome', 'Linter & Formatter', file.path, 0.95);
    }
    if (lowerPath.includes('jest.config')) {
      addTooling('Jest', 'Testing', file.path, 0.95);
    }
    if (lowerPath.includes('vitest.config')) {
      addTooling('Vitest', 'Testing', file.path, 0.95);
    }
    if (lowerPath.includes('tailwind.config')) {
      addTooling('Tailwind CSS', 'CSS Framework', file.path, 0.95);
    }
    if (lowerPath.includes('pytest.ini') || lowerPath.includes('conftest.py')) {
      addTooling('Pytest', 'Testing', file.path, 0.95);
    }
    if (lowerPath.includes('playwright.config')) {
      addTooling('Playwright', 'Testing', file.path, 0.95);
    }
    if (lowerPath.includes('cypress.config') || lowerPath.includes('cypress.json')) {
      addTooling('Cypress', 'Testing', file.path, 0.95);
    }
    if (lowerPath.includes('tsconfig.json')) {
      addTooling('TypeScript', 'Type Checker', file.path, 0.95);
    }
    if (lowerPath.includes('vite.config')) {
      addTooling('Vite', 'Build Tool', file.path, 0.95);
    }
    if (lowerPath.includes('next.config')) {
      addFramework('Next.js', 'Full-stack Web Framework', file.path, undefined, 0.98);
    }
    if (lowerPath.includes('astro.config')) {
      addFramework('Astro', 'Web Framework', file.path, undefined, 0.95);
    }
    if (lowerPath.includes('nuxt.config')) {
      addFramework('Nuxt', 'Full-stack Framework', file.path, undefined, 0.95);
    }
    if (lowerPath.includes('svelte.config')) {
      addFramework('Svelte', 'UI Framework', file.path, undefined, 0.95);
    }
  }

  // 3. Augment with caller-passed packageJsonData if not already discovered
  if (packageJsonData?.dependencies) {
    for (const dep of packageJsonData.dependencies) {
      inspectNodeDependencyForFrameworks(dep.name, undefined, 'package.json', addFramework, addTooling);
    }
  }

  // 4. Augment with caller-passed pythonDeps if not already discovered
  if (pythonDeps) {
    for (const dep of pythonDeps) {
      inspectPythonDependencyForFrameworks(dep.name, undefined, 'requirements.txt', addFramework, addTooling);
    }
  }

  // 5. Calculate Language percentages and signals
  const languages = Object.entries(langCounts)
    .map(([name, count]) => {
      const sources = langSources[name] || [];
      const isManifestBacked =
        name === 'JavaScript' || name === 'TypeScript'
          ? manifests.some((m) => m.type === 'npm')
          : name === 'Python'
          ? manifests.some((m) => m.type === 'pip' || m.type === 'poetry')
          : name === 'Rust'
          ? manifests.some((m) => m.type === 'cargo')
          : name === 'Go'
          ? manifests.some((m) => m.type === 'go_mod')
          : false;

      // Higher confidence if backed by a project manifest, otherwise path-based
      const confidence = isManifestBacked ? 0.98 : count >= 3 ? 0.90 : 0.75;

      return {
        name,
        filesCount: count,
        percentage: totalCodeFiles > 0 ? Math.round((count / totalCodeFiles) * 100) : 0,
        sources,
        confidence,
      };
    })
    .sort((a, b) => b.filesCount - a.filesCount);

  // 6. Empirical Confidence Score for Tech Detection (0 to 100)
  // If repository has no supported code files, manifests, or tooling, confidence is 0!
  let confidenceScore = 0;
  if (languages.length > 0 || frameworks.length > 0 || manifests.length > 0 || tooling.length > 0) {
    confidenceScore = Math.min(
      100,
      (languages.length > 0 ? 35 : 0) +
        (manifests.length > 0 ? 35 : 0) +
        (frameworks.length > 0 ? 20 : 0) +
        (tooling.length > 0 ? 10 : 0)
    );
  }

  // 7. Contribution Readiness Score (0 to 100)
  // Factors: clear tooling, test runners present, linter present, manifest clarity
  let readinessScore = 50;
  if (tooling.some((t) => t.category === 'Testing')) readinessScore += 20;
  if (tooling.some((t) => t.category === 'CI/CD')) readinessScore += 15;
  if (tooling.some((t) => t.category === 'Linter' || t.category === 'Linter & Formatter')) readinessScore += 10;
  if (manifests.length > 0) readinessScore += 5;

  return {
    techStack: {
      languages,
      frameworks,
      tooling,
      manifests,
      confidenceScore,
      packageManagers,
      dependencies: directDependencies,
    },
    readinessScore: Math.min(100, Math.max(20, readinessScore)),
  };
}

/**
 * Inspects a Node.js dependency name and extracts frameworks or development tooling
 */
function inspectNodeDependencyForFrameworks(
  rawName: string,
  version: string | undefined,
  sourceFile: string,
  addFramework: (name: string, category: string, source: string, version?: string, confidence?: number) => void,
  addTooling: (name: string, category: string, source: string, confidence?: number) => void
) {
  const name = rawName.toLowerCase();

  // Frameworks
  if (name === 'next') {
    addFramework('Next.js', 'Full-stack Web Framework', sourceFile, version, 0.98);
  } else if (name === 'react') {
    addFramework('React', 'UI Library', sourceFile, version, 0.98);
  } else if (name === 'react-dom') {
    addFramework('React DOM', 'UI Renderer', sourceFile, version, 0.95);
  } else if (name === 'vue') {
    addFramework('Vue.js', 'UI Framework', sourceFile, version, 0.98);
  } else if (name === 'nuxt') {
    addFramework('Nuxt', 'Full-stack Framework', sourceFile, version, 0.98);
  } else if (name === 'svelte' || name === '@sveltejs/kit') {
    addFramework('Svelte', 'UI Framework', sourceFile, version, 0.98);
  } else if (name === 'express') {
    addFramework('Express', 'Web Server', sourceFile, version, 0.95);
  } else if (name === 'fastify') {
    addFramework('Fastify', 'Web Framework', sourceFile, version, 0.95);
  } else if (name === 'astro') {
    addFramework('Astro', 'Web Framework', sourceFile, version, 0.98);
  } else if (name === '@nestjs/core' || name === 'nest') {
    addFramework('NestJS', 'Node.js Framework', sourceFile, version, 0.95);
  } else if (name.startsWith('@remix-run/')) {
    addFramework('Remix', 'Full-stack Framework', sourceFile, version, 0.95);
  }

  // Development Tooling & Libraries
  if (name === 'tailwindcss') {
    addTooling('Tailwind CSS', 'CSS Framework', sourceFile, 0.95);
  } else if (name === 'typescript') {
    addTooling('TypeScript', 'Type Checker', sourceFile, 0.95);
  } else if (name === 'eslint' || name.startsWith('eslint-')) {
    addTooling('ESLint', 'Linter', sourceFile, 0.95);
  } else if (name === 'prettier') {
    addTooling('Prettier', 'Code Formatter', sourceFile, 0.95);
  } else if (name === '@biomejs/biome') {
    addTooling('Biome', 'Linter & Formatter', sourceFile, 0.95);
  } else if (name === 'jest' || name === '@types/jest') {
    addTooling('Jest', 'Testing', sourceFile, 0.95);
  } else if (name === 'vitest') {
    addTooling('Vitest', 'Testing', sourceFile, 0.95);
  } else if (name === 'playwright' || name === '@playwright/test') {
    addTooling('Playwright', 'Testing', sourceFile, 0.95);
  } else if (name === 'cypress') {
    addTooling('Cypress', 'Testing', sourceFile, 0.95);
  } else if (name === 'mocha') {
    addTooling('Mocha', 'Testing', sourceFile, 0.95);
  } else if (name === 'vite') {
    addTooling('Vite', 'Build Tool', sourceFile, 0.95);
  }
}

/**
 * Inspects a Python dependency name and extracts frameworks or testing tooling
 */
function inspectPythonDependencyForFrameworks(
  rawName: string,
  version: string | undefined,
  sourceFile: string,
  addFramework: (name: string, category: string, source: string, version?: string, confidence?: number) => void,
  addTooling: (name: string, category: string, source: string, confidence?: number) => void
) {
  const name = rawName.toLowerCase();

  if (name === 'fastapi') {
    addFramework('FastAPI', 'API Framework', sourceFile, version, 0.98);
  } else if (name === 'django') {
    addFramework('Django', 'Web Framework', sourceFile, version, 0.98);
  } else if (name === 'flask') {
    addFramework('Flask', 'Microframework', sourceFile, version, 0.98);
  } else if (name === 'starlette') {
    addFramework('Starlette', 'ASGI Framework', sourceFile, version, 0.95);
  } else if (name === 'tornado') {
    addFramework('Tornado', 'Async Web Framework', sourceFile, version, 0.95);
  }

  if (name === 'pytest') {
    addTooling('Pytest', 'Testing', sourceFile, 0.98);
  } else if (name === 'black') {
    addTooling('Black', 'Code Formatter', sourceFile, 0.95);
  } else if (name === 'ruff') {
    addTooling('Ruff', 'Linter & Formatter', sourceFile, 0.95);
  } else if (name === 'flake8') {
    addTooling('Flake8', 'Linter', sourceFile, 0.95);
  } else if (name === 'mypy') {
    addTooling('Mypy', 'Type Checker', sourceFile, 0.95);
  }
}
