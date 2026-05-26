import fs from 'node:fs';
import path from 'node:path';

const STATUS_PATH = path.resolve(process.cwd(), '.tmp/idle-scanner-status.json');

function main() {
  if (!fs.existsSync(STATUS_PATH)) {
    const defaultPayload = {
      ok: false,
      timedOut: false,
      command: 'scanIdleUsers',
      durationMs: 0,
      checkedAt: new Date().toISOString(),
      matchedFiles: null,
      errorMessage: 'Status file not found. Scanner has not executed yet.',
      smoke_or_report_output: '.tmp/idle-scanner-status.json',
      canonical_status: 'partial',
      risk_notes: 'status file missing'
    };
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    fs.writeFileSync(STATUS_PATH, JSON.stringify(defaultPayload, null, 2), 'utf8');
    console.warn('⚠️  [scanner:status] .tmp/idle-scanner-status.json not found, created pending status');
    process.exit(0); // Exit 0 to not block startup chain if it has just not run yet
  }

  const data = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  console.log('── Idle Scanner Status ──');
  console.log(JSON.stringify(data, null, 2));

  if (data.timedOut) {
    console.warn('⚠️  [scanner:status] Idle scanner timed out in last run.');
  }

  if (data.ok === false && !data.timedOut) {
    console.error('❌  [scanner:status] Idle scanner failed in last run.');
    process.exit(1);
  }
  process.exit(0);
}

main();
