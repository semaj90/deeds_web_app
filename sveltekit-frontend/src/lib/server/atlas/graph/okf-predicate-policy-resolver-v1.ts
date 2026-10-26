import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument } from 'yaml';
import type { OntologyTuplePredicateResolutionV1 } from './ontology-tuple-nary-proposal-v1.js';

export type FeaturePredicateDegreeV1 = 'unary' | 'binary' | 'ternary' | 'nary';

export interface FeaturePredicatePolicyResolutionV1 {
  resolution: OntologyTuplePredicateResolutionV1;
  allowedDegree: FeaturePredicateDegreeV1[];
  pagerankEligible: boolean;
  traversalEligible: boolean;
}

const DOCUMENT_PATH = '.okf/predicates/feature-relationships.yaml';
const SCHEMA_PATH = '.okf/schemas/feature-relationships-v1.schema.json';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function findRepositoryRoot(start: string): string {
  let current = resolve(start);
  while (current !== dirname(current)) {
    if (current.endsWith('.git') || current.endsWith('node_modules')) break;
    try {
      requireManifest(resolve(current, '.okf', 'manifest.yaml'));
      return current;
    } catch {
      current = dirname(current);
    }
  }
  throw new Error('PREDICATE_POLICY_REPOSITORY_ROOT_NOT_FOUND');
}

function requireManifest(path: string): void {
  if (!existsSync(path)) throw new Error('MANIFEST_MISSING');
}

export async function loadOkfPredicatePolicyV1(
  predicate: string,
  degree: FeaturePredicateDegreeV1,
  startDirectory = dirname(fileURLToPath(import.meta.url)),
): Promise<FeaturePredicatePolicyResolutionV1> {
  let documentBytes: Buffer;
  let schemaBytes: Buffer;
  try {
    const root = findRepositoryRoot(startDirectory);
    [documentBytes, schemaBytes] = await Promise.all([
      readFile(resolve(root, DOCUMENT_PATH)),
      readFile(resolve(root, SCHEMA_PATH)),
    ]);
  } catch {
    return unresolved('PREDICATE_POLICY_FILES_UNAVAILABLE');
  }

  let document: unknown;
  let schema: unknown;
  try {
    const parsed = parseDocument(documentBytes.toString('utf8'), { uniqueKeys: true });
    if (parsed.errors.length > 0) return unresolved('PREDICATE_POLICY_YAML_INVALID');
    document = parsed.toJSON();
    schema = JSON.parse(schemaBytes.toString('utf8')) as unknown;
  } catch {
    return unresolved('PREDICATE_POLICY_PARSE_FAILED');
  }

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    if (!ajv.validate(schema as object, document)) return unresolved('PREDICATE_POLICY_SCHEMA_INVALID');
  } catch {
    return unresolved('PREDICATE_POLICY_SCHEMA_INVALID');
  }

  const root = document as {
    predicates?: Record<string, {
      allowed_degree?: FeaturePredicateDegreeV1[];
      pagerank_eligible?: boolean;
      traversal_eligible?: boolean;
    }>;
  };
  const policy = root.predicates?.[predicate];
  if (!policy) return unresolved('PREDICATE_NOT_REGISTERED');
  if (!policy.allowed_degree?.includes(degree)) return unresolved('PREDICATE_DEGREE_NOT_ALLOWED');
  if (typeof policy.pagerank_eligible !== 'boolean' || typeof policy.traversal_eligible !== 'boolean') {
    return unresolved('PREDICATE_POLICY_FIELDS_INVALID');
  }

  return {
    resolution: {
      status: 'RESOLVED',
      predicate,
      registryDocumentSha256: sha256(documentBytes),
      registrySchemaSha256: sha256(schemaBytes),
    },
    allowedDegree: policy.allowed_degree,
    pagerankEligible: policy.pagerank_eligible,
    traversalEligible: policy.traversal_eligible,
  };
}

function unresolved(reasonCode: string): FeaturePredicatePolicyResolutionV1 {
  return {
    resolution: { status: 'UNRESOLVED', reasonCode },
    allowedDegree: [],
    pagerankEligible: false,
    traversalEligible: false,
  };
}
