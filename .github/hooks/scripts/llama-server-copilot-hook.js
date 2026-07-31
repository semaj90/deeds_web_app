#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function probeEndpoint(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, body: parsed });
        } catch {
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', () => {
      resolve({ ok: false, statusCode: null, body: null });
    });
  });
}

async function detectRuntime() {
  const workspaceRoot = process.cwd();
  const repoRoot = path.resolve(workspaceRoot);
  const envFile = path.join(repoRoot, '.env');
  const envLocalFile = path.join(repoRoot, '.env.local');
  const envData = [envFile, envLocalFile]
    .map((file) => readJson(file))
    .filter(Boolean);

  const envText = [envFile, envLocalFile]
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  const hasLlamaServer = /LLAMA_SERVER_PATH|LLAMA_URL|8090|llama-server/i.test(envText);
  const hasCopilotPrompt = /copilot|chat|llama/i.test(envText);
  const endpointProbe = await probeEndpoint('http://127.0.0.1:8090/v1/models');
  const modelIds = Array.isArray(endpointProbe.body?.data)
    ? endpointProbe.body.data.map((model) => model.id || model.name || model.model).filter(Boolean)
    : [];

  return {
    workspaceRoot: repoRoot,
    envText,
    hasLlamaServer,
    hasCopilotPrompt,
    envData,
    endpoint: "",
    endpointReachable: endpointProbe.ok,
    modelIds
  };
}

function buildPrompt(runtime) {
  const base = [
    'You are operating inside the deeds-web-app workspace.',
    'When the user asks about local model usage, prefer the existing llama-server 8090 workflow over generic Ollama guidance.',
    'Before recommending a different model or server, verify whether http://127.0.0.1:8090 is reachable and whether the local llama-server binary is configured.',
    'If the endpoint is unavailable, mention that as a prerequisite instead of assuming the model is ready.',
    'When editing or creating files, prefer minimal, repo-safe changes and avoid unrelated churn.'
  ];

  if (runtime.hasLlamaServer || runtime.hasCopilotPrompt) {
    base.push('The workspace appears to have llama-server or Copilot-related settings configured. Use those as the first implementation reference.');
  }

  if (runtime.endpointReachable && runtime.modelIds.length) {
    base.push(`The live endpoint reports these models: ${runtime.modelIds.join(', ')}`);
  }

  return base.join('\n');
}

async function main() {
  const runtime = await detectRuntime();
  const prompt = buildPrompt(runtime);

  console.log(JSON.stringify({
    hook: 'llama-server-copilot-hook',
    workspaceRoot: runtime.workspaceRoot,
    endpointReachable: runtime.endpointReachable,
    modelIds: runtime.modelIds,
    prompt
  }, null, 2));
}

main().catch(() => {
  process.exitCode = 1;
});
