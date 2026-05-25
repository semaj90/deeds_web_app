#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const configCandidates = [
  path.join(cwd, 'opencode.json'),
  path.join(cwd, 'sveltekit-frontend', 'opencode.json')
];
const patchCandidates = [
  path.join(cwd, '.opencode', 'config-patches.json'),
  path.join(cwd, 'sveltekit-frontend', '.opencode', 'config-patches.json')
];

const configPath = configCandidates.find((candidate) => fs.existsSync(candidate));
const patchPath = patchCandidates.find((candidate) => fs.existsSync(candidate));

if (!configPath) throw new Error(`Missing opencode.json. Checked: ${configCandidates.join(', ')}`);
if (!patchPath) throw new Error(`Missing .opencode/config-patches.json. Checked: ${patchCandidates.join(', ')}`);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));

config.command ??= {};
config.command = {
  ...config.command,
  ...(patch.command ?? {})
};

config.agent ??= {};
config.agent['atlas-context'] ??= {
  description: 'Atlas context recovery agent',
  model: config.model,
  temperature: 0,
  steps: 8,
  prompt: ''
};

if (typeof patch['agent.atlas-context.prompt'] === 'string' && patch['agent.atlas-context.prompt'].trim()) {
  const current = String(config.agent['atlas-context'].prompt ?? '');
  if (!current.includes('Never use the task tool for deterministic recovery commands')) {
    config.agent['atlas-context'].prompt = `${current.trim()}\n\n${patch['agent.atlas-context.prompt']}`.trim();
  }
}

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`PATCH_OK ${configPath}`);

