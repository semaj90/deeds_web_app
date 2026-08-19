#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'sveltekit-frontend/src/lib/server/vector/lane-registry.ts');
const configPath = path.join(root, 'sveltekit-frontend/src/lib/server/config/vector-config.ts');
const registry = fs.readFileSync(registryPath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');

const checks = {
  REGISTRY_768_CANONICAL_ACTIVE:
    registry.includes("laneId: 'embeddinggemma-768d'") &&
    registry.includes("role: 'canonical'") &&
    registry.includes("status: 'active'") &&
    registry.includes('evidenceAuthority: true'),
  REGISTRY_LATENT128_DERIVES_768:
    /topology128:[\s\S]*sourceDimension:\s*SEMANTIC_DIMENSION[\s\S]*evidenceAuthority:\s*false/.test(registry),
  REGISTRY_LATENT64_DERIVES_768:
    /latent64:[\s\S]*sourceDimension:\s*SEMANTIC_DIMENSION[\s\S]*evidenceAuthority:\s*false/.test(registry),
  REGISTRY_384_LEGACY_NON_AUTHORITATIVE:
    /legacy384:[\s\S]*status:\s*'legacy'[\s\S]*evidenceAuthority:\s*false/.test(registry),
  LEGACY_CONFIG_NO_LONGER_MARKS_384_ACTIVE_AUTHORITY:
    !/dense_384:[\s\S]*status:\s*'ACTIVE'[\s\S]*evidenceAuthority:\s*true/.test(config),
  LEGACY_CONFIG_768_NOT_REFERENCE_ONLY:
    !/dense_768:[\s\S]*status:\s*'REFERENCE_ONLY'/.test(config),
  LEGACY_CONFIG_LATENT64_NOT_384_DERIVED:
    !/latent_64:[\s\S]*sourceDimension:\s*384/.test(config),
};

const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
const report = {
  schema: 'atlas.vector-lane-authority-audit.v1',
  status: failed.length === 0 ? 'PROVEN' : 'MIGRATION_REQUIRED',
  checks,
  failed,
  canonicalOwner: 'sveltekit-frontend/src/lib/server/vector/lane-registry.ts',
  compatibilityMetadata: 'sveltekit-frontend/src/lib/server/config/vector-config.ts',
  note: failed.length
    ? 'The canonical lane registry is corrected, but stale 384-era compatibility metadata remains and must not be used as authority.'
    : 'All vector lane metadata agrees on semantic_768 authority and derived latent routing.',
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = failed.length ? 1 : 0;
