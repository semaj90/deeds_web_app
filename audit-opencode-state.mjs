#!/usr/bin/env node
/**
 * Deep audit of OpenCode configuration and actual runtime state
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🔍 DEEP AUDIT: OpenCode Configuration & Runtime State\n');

// 1. Check config file exists and is valid JSON
console.log('═══ 1. CONFIG FILE VALIDITY ═══');
const configPath = path.join(__dir, '.opencode', 'opencode.jsonc');
if (!fs.existsSync(configPath)) {
  console.log('❌ Config file missing:', configPath);
  process.exit(1);
}
console.log('✅ Config file exists:', configPath);

try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  // JSONC doesn't parse as JSON; strip comments manually
  const json = raw
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const config = JSON.parse(json);
  console.log('✅ Config is valid JSONC');
} catch (e) {
  console.log('❌ Config parse error:', e.message);
  process.exit(1);
}

// 2. Check MCP servers are configured
console.log('\n═══ 2. MCP SERVER CONFIGURATION ═══');
const config = JSON.parse(json);
const mcpServers = config.mcp || {};
const mcpNames = Object.keys(mcpServers);
console.log(`Found ${mcpNames.length} MCP servers configured:`);

for (const [name, server] of Object.entries(mcpServers)) {
  const enabled = server.enabled ?? true;
  const type = server.type || 'unknown';
  const status = enabled ? '✅' : '⚠️ ';
  console.log(`  ${status} ${name} (${type}) - ${enabled ? 'enabled' : 'disabled'}`);
  
  if (server.type === 'local' && server.command) {
    const cmd = Array.isArray(server.command) ? server.command[0] : server.command;
    const args = server.args || [];
    const scriptPath = Array.isArray(server.command) 
      ? server.command[1] 
      : (args[0] || 'unknown');
    
    const fullPath = path.join(__dir, scriptPath);
    if (fs.existsSync(fullPath)) {
      console.log(`     ✅ Script exists: ${scriptPath}`);
    } else {
      console.log(`     ❌ Script missing: ${scriptPath}`);
    }
  }
  
  if (server.type === 'remote' && server.url) {
    console.log(`     Remote: ${server.url}`);
  }
}

// 3. Check LSP servers are installed and configured
console.log('\n═══ 3. LSP SERVER CONFIGURATION ═══');
const lsps = config.lsp || {};
const lspNames = Object.keys(lsps);
console.log(`Found ${lspNames.length} LSP servers configured:`);

for (const [name, lsp] of Object.entries(lsps)) {
  console.log(`  ${name}:`);
  const cmd = lsp.command;
  const args = lsp.args || [];
  const filetypes = lsp.filetypes || [];
  
  console.log(`    Command: ${cmd}`);
  console.log(`    Args: ${args.join(' ')}`);
  console.log(`    Filetypes: ${filetypes.join(', ')}`);
  
  if (args.length > 0) {
    const binPath = path.join(__dir, args[0]);
    if (fs.existsSync(binPath)) {
      console.log(`    ✅ Binary exists: ${args[0]}`);
    } else {
      console.log(`    ❌ Binary missing: ${args[0]}`);
    }
  }
}

// 4. Check bash permission configuration
console.log('\n═══ 4. BASH PERMISSION CONFIGURATION ═══');
const bashPerms = config.permission?.bash || {};
console.log(`Bash permissions (top-level):`);
if (bashPerms['*'] === 'allow') {
  console.log('  ✅ Catch-all: "allow" (commands execute without prompting)');
} else if (bashPerms['*'] === 'ask') {
  console.log('  ❌ Catch-all: "ask" (will prompt on every unknown command)');
} else {
  console.log(`  ⚠️  Catch-all: "${bashPerms['*']}" (unexpected)`);
}

const denyCount = Object.entries(bashPerms).filter(([k, v]) => v === 'deny').length;
console.log(`  Denied patterns: ${denyCount}`);
Object.entries(bashPerms)
  .filter(([k, v]) => v === 'deny')
  .slice(0, 3)
  .forEach(([k]) => console.log(`    • ${k}`));

// 5. Check svelte-frontend directory structure
console.log('\n═══ 5. SVELTEKIT-FRONTEND VERIFICATION ═══');
const svelteDir = path.join(__dir, 'sveltekit-frontend');
const criticalFiles = [
  'package.json',
  'svelte.config.js',
  'tsconfig.json',
  'src/mcp/trace-mcp-server.ts',
  'scripts/ensure-mcp-server.mjs',
  'node_modules/typescript-language-server/package.json',
  'node_modules/svelte-language-server/package.json',
];

for (const file of criticalFiles) {
  const fullPath = path.join(svelteDir, file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file}`);
  }
}

// 6. Check root config delegation
console.log('\n═══ 6. ROOT SVELTE.CONFIG.JS DELEGATION ═══');
const rootConfigPath = path.join(__dir, 'svelte.config.js');
if (fs.existsSync(rootConfigPath)) {
  const rootConfig = fs.readFileSync(rootConfigPath, 'utf-8');
  if (rootConfig.includes('sveltekit-frontend/svelte.config.js')) {
    console.log('✅ Root config delegates to sveltekit-frontend');
  } else {
    console.log('❌ Root config does not delegate (may cause issues)');
  }
}

// 7. Check global config state
console.log('\n═══ 7. GLOBAL CONFIG (~/.config/opencode/) ═══');
const globalConfigPath = path.join(process.env.USERPROFILE || process.env.HOME || '~', '.config', 'opencode', 'opencode.jsonc');
if (fs.existsSync(globalConfigPath)) {
  console.log('⚠️  Global config exists (project config should override)');
  console.log(`    Path: ${globalConfigPath}`);
} else {
  console.log('✅ No conflicting global config');
}

// 8. Agent-specific permission check
console.log('\n═══ 8. BUILT-IN AGENT PERMISSIONS ═══');
const agents = config.agent || {};
for (const [agentName, agent] of Object.entries(agents)) {
  if (agentName === 'build' || agentName === 'plan') {
    const agentBash = agent.permission?.bash || {};
    if (agentBash['*'] === 'allow') {
      console.log(`✅ ${agentName}: bash catch-all is "allow"`);
    } else if (agentBash['*'] === 'ask') {
      console.log(`⚠️  ${agentName}: bash catch-all is "ask" (will prompt)`);
    } else if (!agentBash['*']) {
      console.log(`⚠️  ${agentName}: no bash block (inherits top-level)`);
    }
  }
}

console.log('\n═══ AUDIT COMPLETE ═══\n');
