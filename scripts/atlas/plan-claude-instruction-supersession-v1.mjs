#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildClaudeInstructionSupersessionPlanV1 } from './document-governance-supersession-plan-v1.mjs';

const root = process.cwd();
const registryPath = join(root, 'docs/reports/document-governance-registry-v1.json');
const auditFlag = process.argv.indexOf('--audit');
const auditPath = auditFlag >= 0 && process.argv[auditFlag + 1]
  ? resolve(root, process.argv[auditFlag + 1])
  : join(root, 'docs/reports/document-supersession-audit-current-v1.json');
const reportPath = join(root, 'docs/reports/claude-instruction-supersession-plan-v1.json');
const registryText = readFileSync(registryPath, 'utf8');
const registry = JSON.parse(registryText);
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const instructions = registry.records.filter((record) => record.documentKind === 'CLAUDE_INSTRUCTIONS');
const fileContents = new Map(instructions.map((record) => [record.path, readFileSync(resolve(root, record.path))]));
const plan = buildClaudeInstructionSupersessionPlanV1({ registry, registryText, audit, fileContents });
writeFileSync(reportPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(`${plan.status} instructions=${plan.records.length} dispositions=${JSON.stringify(plan.summary)}`);
console.log(`report=${reportPath}`);
if (plan.status !== 'PROVEN_BOUNDED') process.exitCode = 2;
