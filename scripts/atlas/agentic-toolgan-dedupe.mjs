#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readNdjson, appendNdjson, buildDoNotRepeatKey } from './lib/agentic-toolgan-core.mjs';

const planPath = path.join(ROOT, '.tmp', 'toolgan-current-plan.json');
const dnrPath  = path.join(ROOT, 'memory', 'agentic', 'do-not-repeat.ndjson');
const failuresPath = path.join(ROOT, 'memory', 'agentic', 'failures.ndjson');
const timelinePath = path.join(ROOT, 'memory', 'agentic', 'timeline.ndjson');

if (!existsSync(planPath)) {
  console.error(`❌ Current plan not found at ${planPath}`);
  process.exit(1);
}

const currentPlan = JSON.parse(readFileSync(planPath, 'utf8'));

// Test mode helper
const isTest = process.argv.includes('--test');
if (isTest) {
  console.log(`[DEDUPE-TEST] Running in test mode.`);
  // Add a dummy entry to test success reuse
  appendNdjson(dnrPath, {
    do_not_repeat_key: 'test_key_success',
    result: 'success',
    outcome: 'reused result text'
  });
  // Add a dummy failure record to timeline/failures for testing
  appendNdjson(failuresPath, {
    intent: currentPlan.intent,
    query: currentPlan.query,
    selected_files: currentPlan.selected_files,
    tool_path: currentPlan.tool_path,
    result: 'failure',
    failure_signature: 'test_error'
  });
}

// 1. Load successes from DNR map
const dnrRecords = readNdjson(dnrPath);
const dnrMap = new Map();
for (const r of dnrRecords) {
  if (r.do_not_repeat_key) {
    dnrMap.set(r.do_not_repeat_key, r);
  }
}

// Check successes first (key calculated with null failure signature)
const successKey = buildDoNotRepeatKey(
  currentPlan.intent,
  currentPlan.query,
  currentPlan.selected_files,
  currentPlan.tool_path,
  null
);

if (dnrMap.has(successKey) || dnrMap.has(currentPlan.do_not_repeat_key)) {
  const match = dnrMap.get(successKey) || dnrMap.get(currentPlan.do_not_repeat_key);
  if (match.result === 'success') {
    console.log(JSON.stringify({
      action: 'REUSE',
      reason: `Match found in successes. do_not_repeat_key=${match.do_not_repeat_key}`,
      outcome: match.outcome || 'Success reused from cache.',
      event: currentPlan
    }, null, 2));
    process.exit(0);
  }
}

// 2. Load failures from failures.ndjson and match by properties
const failureRecords = readNdjson(failuresPath);
const normQuery = (currentPlan.query || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sortedFiles = [...(currentPlan.selected_files || [])].sort().join(',');
const normToolPath = [...(currentPlan.tool_path || [])].sort().join(',');

const priorFailure = failureRecords.find(f => {
  const fQuery = (f.query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const fFiles = [...(f.selected_files || [])].sort().join(',');
  const fToolPath = [...(f.tool_path || [])].sort().join(',');
  
  return f.intent === currentPlan.intent &&
         fQuery === normQuery &&
         fFiles === sortedFiles &&
         fToolPath === normToolPath;
});

if (priorFailure) {
  // Propose alternative tool route (reverse the current path as an alternative candidate)
  const alternativePath = [...currentPlan.tool_path].reverse();
  const modifiedPlan = {
    ...currentPlan,
    tool_path: alternativePath,
    reason: 'Alternative route proposed due to prior failure.'
  };
  writeFileSync(planPath, JSON.stringify(modifiedPlan, null, 2));
  
  console.log(JSON.stringify({
    action: 'PROPOSE_ALTERNATIVE',
    reason: `Prior failure found. intent=${currentPlan.intent} query="${currentPlan.query}"`,
    event: modifiedPlan
  }, null, 2));
  process.exit(0);
}

// 3. Check same query but different files
const timelineRecords = readNdjson(timelinePath);
const sameQueryDiffFiles = timelineRecords.find(h => {
  const hQuery = (h.query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const hFiles = [...(h.selected_files || [])].sort().join(',');
  
  return hQuery === normQuery && hFiles !== sortedFiles;
});

if (sameQueryDiffFiles) {
  console.log(JSON.stringify({
    action: 'ALLOW',
    reason: `Same query but different files list. Linking trace_id=${sameQueryDiffFiles.trace_id}`,
    linked_trace: sameQueryDiffFiles.linked_trace_id || sameQueryDiffFiles.trace_id,
    event: currentPlan
  }, null, 2));
  process.exit(0);
}

// Default ALLOW
console.log(JSON.stringify({
  action: 'ALLOW',
  reason: 'No duplicate cache hits found.',
  event: currentPlan
}, null, 2));
