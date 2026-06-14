#!/usr/bin/env node

/**
 * Ingest workspace metadata from package.json and VS Code config
 *
 * Populates workspace/runtime metadata categories WITHOUT replacing packet identity.
 *
 * Ingests:
 *   - package.json scripts (npm aliases), dependencies, workspaces
 *   - .vscode/tasks.json (npm scripts, commands)
 *   - .vscode/launch.json (debug configurations)
 *   - *.code-workspace files
 *   - Server path mapping (repo_path → server_path)
 *
 * Usage:
 *   npm run atlas:workspace:ingest:dry
 *   npm run atlas:workspace:ingest:apply
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const args = process.argv.slice(2);
const isDry = args.includes('--dry') || !args.includes('--apply');
const isApply = args.includes('--apply');
const isSilent = args.includes('--silent');

/**
 * Load package.json and extract scripts, dependencies, workspaces
 */
function loadPackageJsonMetadata(repoRoot) {
  const packagePath = path.join(repoRoot, 'package.json');
  const svelitekitPackagePath = path.join(repoRoot, 'sveltekit-frontend', 'package.json');

  const metadata = {
    scripts: {},
    workspaces: [],
    dependencies: [],
    devDependencies: [],
    paths: [],
  };

  // Root package.json
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      metadata.scripts = { ...pkg.scripts };
      if (pkg.workspaces) {
        metadata.workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
      }
      if (pkg.dependencies) {
        metadata.dependencies.push(...Object.keys(pkg.dependencies));
      }
      if (pkg.devDependencies) {
        metadata.devDependencies.push(...Object.keys(pkg.devDependencies));
      }
    } catch (err) {
      console.error(`Failed to parse ${packagePath}:`, err.message);
    }
  }

  // SvelteKit package.json
  if (fs.existsSync(svelitekitPackagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(svelitekitPackagePath, 'utf-8'));
      metadata.scripts = { ...metadata.scripts, ...pkg.scripts };
      if (pkg.dependencies) {
        metadata.dependencies.push(...Object.keys(pkg.dependencies).filter((d) => !metadata.dependencies.includes(d)));
      }
      if (pkg.devDependencies) {
        metadata.devDependencies.push(
          ...Object.keys(pkg.devDependencies).filter((d) => !metadata.devDependencies.includes(d))
        );
      }
    } catch (err) {
      console.error(`Failed to parse ${svelitekitPackagePath}:`, err.message);
    }
  }

  return metadata;
}

/**
 * Load VS Code tasks.json
 */
function loadVsCodeTasks(repoRoot) {
  const tasksPath = path.join(repoRoot, '.vscode', 'tasks.json');
  const tasks = [];

  if (fs.existsSync(tasksPath)) {
    try {
      const content = fs.readFileSync(tasksPath, 'utf-8');
      // Remove comments before parsing
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(cleaned);
      if (config.tasks && Array.isArray(config.tasks)) {
        tasks.push(
          ...config.tasks.map((t) => ({
            label: t.label,
            type: t.type || 'shell',
            command: t.command,
            args: t.args,
          }))
        );
      }
    } catch (err) {
      if (!isSilent) {
        console.error(`Failed to parse .vscode/tasks.json:`, err.message);
      }
    }
  }

  return tasks;
}

/**
 * Load VS Code launch.json
 */
function loadVsCodeLaunchConfigs(repoRoot) {
  const launchPath = path.join(repoRoot, '.vscode', 'launch.json');
  const configs = [];

  if (fs.existsSync(launchPath)) {
    try {
      const content = fs.readFileSync(launchPath, 'utf-8');
      const cleaned = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const config = JSON.parse(cleaned);
      if (config.configurations && Array.isArray(config.configurations)) {
        configs.push(...config.configurations.map((c) => ({ name: c.name, type: c.type })));
      }
    } catch (err) {
      if (!isSilent) {
        console.error(`Failed to parse .vscode/launch.json:`, err.message);
      }
    }
  }

  return configs;
}

/**
 * Generate server path mapping (repo_path → server_path)
 */
function buildServerPathMapping(repoRoot) {
  const mapping = {
    repo_path: repoRoot,
    server_path: `/home/user${repoRoot.replace(/\\/g, '/')}`, // Example WSL path
    paths: {
      src: path.join(repoRoot, 'sveltekit-frontend', 'src'),
      scripts: path.join(repoRoot, 'sveltekit-frontend', 'scripts'),
      tests: path.join(repoRoot, 'sveltekit-frontend', 'tests'),
      docs: path.join(repoRoot, 'sveltekit-frontend', 'docs'),
    },
  };
  return mapping;
}

/**
 * Main ingestion
 */
async function ingestWorkspaceMetadata() {
  console.log('📚 Ingesting workspace metadata...\n');

  const packageMetadata = loadPackageJsonMetadata(REPO_ROOT);
  const vscodeTasks = loadVsCodeTasks(REPO_ROOT);
  const vscodeConfigs = loadVsCodeLaunchConfigs(REPO_ROOT);
  const serverPaths = buildServerPathMapping(REPO_ROOT);

  console.log('✅ Workspace metadata loaded:');
  console.log(`   - ${Object.keys(packageMetadata.scripts).length} npm scripts`);
  console.log(`   - ${packageMetadata.dependencies.length} dependencies`);
  console.log(`   - ${packageMetadata.devDependencies.length} dev dependencies`);
  console.log(`   - ${vscodeTasks.length} VS Code tasks`);
  console.log(`   - ${vscodeConfigs.length} VS Code launch configs`);
  console.log(`   - Server path: ${serverPaths.server_path}`);

  const report = {
    timestamp: new Date().toISOString(),
    mode: isDry ? 'dry-run' : 'apply',
    workspace_root: REPO_ROOT,
    metadata: {
      package_json: {
        scripts: Object.keys(packageMetadata.scripts),
        dependencies: packageMetadata.dependencies,
        dev_dependencies: packageMetadata.devDependencies,
        workspaces: packageMetadata.workspaces,
      },
      vscode_tasks: vscodeTasks.map((t) => t.label),
      vscode_configs: vscodeConfigs.map((c) => c.name),
      server_paths: serverPaths,
    },
    next_action:
      'These metadata fields can be injected into packet workspace/runtime categories as packets are indexed.',
  };

  if (!isSilent) {
    console.log('\n📄 Sample workspace metadata structure:');
    console.log(JSON.stringify(report, null, 2).slice(0, 500) + '...\n');
  }

  return report;
}

// Run
try {
  await ingestWorkspaceMetadata();
} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}