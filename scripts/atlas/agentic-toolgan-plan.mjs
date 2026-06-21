#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, ensureDirs, buildDoNotRepeatKey } from './lib/agentic-toolgan-core.mjs';

ensureDirs();

const intentArg = process.argv.find(a => a.startsWith('--intent=') || a.startsWith('--intent'));
const queryArg  = process.argv.find(a => a.startsWith('--query=') || a.startsWith('--query'));
const filesArg  = process.argv.find(a => a.startsWith('--files=') || a.startsWith('--files'));

// Parse command line arguments properly (supporting both --arg=val and --arg val)
function getArgValue(argKey, argvList) {
  const index = argvList.findIndex(a => a.startsWith(argKey));
  if (index === -1) return null;
  const arg = argvList[index];
  if (arg.includes('=')) {
    return arg.split('=')[1];
  }
  // Check next token
  if (index + 1 < argvList.length && !argvList[index + 1].startsWith('--')) {
    return argvList[index + 1];
  }
  return '';
}

const intent = getArgValue('--intent', process.argv) || 'error_fix';
const query  = getArgValue('--query', process.argv) || 'default query';
const filesStr = getArgValue('--files', process.argv);
const files  = filesStr ? filesStr.split(',').map(f => f.trim()) : [];

// Simple Generator mapping for proposing tool paths
const intentPaths = {
  error_fix: ['startup_briefing', 'go_retrieval', 'qdrant', 'opencode_patch'],
  semantic_mapping: ['qdrant', 'neo4j', 'gemma4_summary'],
  path_find: ['go_retrieval', 'neo4j', 'redis'],
  cluster: ['qdrant', 'redis', 'gemma4_summary'],
  followup: ['startup_briefing', 'opencode_patch']
};

const tool_path = intentPaths[intent] || ['startup_briefing', 'go_retrieval', 'qdrant'];

// Build event object
const event_id = crypto.randomUUID();
const trace_id = crypto.randomUUID();
const ts = new Date().toISOString();

// Initial calculation of DNR key (failure_signature is null initially)
const do_not_repeat_key = buildDoNotRepeatKey(intent, query, files, tool_path, null);

const event = {
  event_id,
  ts,
  trace_id,
  agent: 'opencode',
  intent,
  query,
  tool_path,
  selected_packets: [],
  selected_files: files,
  graph_path: [],
  cluster_ids: [],
  commands: [],
  result: 'pending',
  failure_signature: null,
  followup_id: null,
  do_not_repeat_key,
  proof: {
    smoke: null,
    replay: null,
    diff: null
  }
};

const planPath = path.join(ROOT, '.tmp', 'toolgan-current-plan.json');
writeFileSync(planPath, JSON.stringify(event, null, 2));

console.log(JSON.stringify(event, null, 2));
