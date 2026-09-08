#!/usr/bin/env node

/** Read-only comparison of the active retrieval proto and TS forwarding surface. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const protoPath = join(root, 'proto/active/retrieval.proto');
const clientPath = join(root, 'packages/parent-atlas-client/src/grpc/client.ts');
const reportPath = join(root, 'docs/reports/retrieval-grpc-envelope-parity-v1.json');
const proto = readFileSync(protoPath, 'utf8');
const client = readFileSync(clientPath, 'utf8');
const block = proto.match(/message CodebaseSearchRequest \{([\s\S]*?)\n\}/)?.[1] ?? '';
const camel = (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const fields = [...block.matchAll(/^\s*(?:repeated\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)/gm)]
  .map(([, type, name, number]) => ({ type, name, number: Number(number), camelName: camel(name) }));
const forwarded = fields.filter((field) => new RegExp(`\\b${field.camelName}\\s*:`).test(client));
const missingForwarders = fields.filter((field) => !forwarded.includes(field));
const internalOnly = ['workspace_id', 'corpus_version', 'cache_policy'];
const report = {
  schema: 'atlas.retrieval-grpc-envelope-parity.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  proto: {
    path: 'proto/active/retrieval.proto',
    message: 'CodebaseSearchRequest',
    checksum: `sha256:${createHash('sha256').update(proto).digest('hex')}`,
    fields,
  },
  typescript: {
    path: 'packages/parent-atlas-client/src/grpc/client.ts',
    forwardedFields: forwarded.map((field) => field.name),
    missingForwarders: missingForwarders.map((field) => field.name),
  },
  internalQualifiersNotOnWire: internalOnly.filter((name) => !fields.some((field) => field.name === name)),
  status: missingForwarders.length === 0 ? 'PROTO_TS_FORWARDING_ALIGNED' : 'PROTO_TS_FORWARDING_INCOMPLETE',
  nextGate: 'GO_TS_REQUEST_SERIALIZATION_AND_CACHE_CONTEXT_PARITY',
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  protoFieldCount: fields.length,
  forwardedFieldCount: forwarded.length,
  missingForwarders: report.typescript.missingForwarders,
  internalQualifiersNotOnWire: report.internalQualifiersNotOnWire,
  writesPerformed: false,
  reportPath: 'docs/reports/retrieval-grpc-envelope-parity-v1.json',
}, null, 2));

