#!/usr/bin/env node
// Smoke test for ACE routing trace configuration (no repo writes)
const { existsSync, mkdirSync } = await import('node:fs');

const TRACE_ENABLED = String(process.env.ACE_ROUTING_TRACE_ENABLED ?? 'false') === 'true';
const TRACE_SAMPLE_RATE = Number(process.env.ACE_ROUTING_TRACE_SAMPLE_RATE ?? '0.01');
const TRACE_MAX_PER_REQUEST = Number(process.env.ACE_ROUTING_TRACE_MAX_PER_REQUEST ?? '8');

console.log('ACE_ROUTING_TRACE_ENABLED=', TRACE_ENABLED);
console.log('ACE_ROUTING_TRACE_SAMPLE_RATE=', TRACE_SAMPLE_RATE);
console.log('ACE_ROUTING_TRACE_MAX_PER_REQUEST=', TRACE_MAX_PER_REQUEST);

let ok = true;
if (TRACE_ENABLED !== false && TRACE_ENABLED !== true) {
  console.error('ACE_ROUTING_TRACE_ENABLED resolved to non-boolean');
  ok = false;
}
if (typeof TRACE_SAMPLE_RATE !== 'number' || Number.isNaN(TRACE_SAMPLE_RATE) || TRACE_SAMPLE_RATE < 0) {
  console.error('ACE_ROUTING_TRACE_SAMPLE_RATE invalid:', TRACE_SAMPLE_RATE);
  ok = false;
}
if (!Number.isInteger(TRACE_MAX_PER_REQUEST) || TRACE_MAX_PER_REQUEST <= 0) {
  console.error('ACE_ROUTING_TRACE_MAX_PER_REQUEST invalid:', TRACE_MAX_PER_REQUEST);
  ok = false;
}

// If enabled, ensure .tmp exists or can be created (dry-run)
if (TRACE_ENABLED) {
  try {
    if (!existsSync('.tmp')) mkdirSync('.tmp', { recursive: true });
    console.log('.tmp directory is present');
  } catch (err) {
    console.error('Failed to ensure .tmp exists:', err);
    ok = false;
  }
} else {
  console.log('Trace disabled by default (expected)');
}

process.exit(ok ? 0 : 2);
