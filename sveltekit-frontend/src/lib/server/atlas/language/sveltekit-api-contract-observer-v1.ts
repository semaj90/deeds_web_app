import { z } from 'zod';

import {
  AstGrepStructuralCandidateV1Schema,
  type AstGrepStructuralCandidateV1,
} from './ast-grep-structural-topk.js';
import {
  compileApiContractObservationV1,
  type ApiContractObservationV1,
} from './api-contract-observation-v1.js';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export const SvelteKitApiObservationOptionsV1Schema = z.object({
  schema: z.literal('atlas.sveltekit-api-observation-options.v1'),
  inputSchemaRefs: z.array(z.string().min(1)).default([]),
  outputSchemaRefs: z.array(z.string().min(1)).default([]),
  authRequirements: z.array(z.string().min(1)).default([]),
  sideEffects: z.array(z.string().min(1)).default([]),
  semanticEngine: z.enum(['TS_MORPH', 'LSP']).nullable().default(null),
  producerRevision: z.string().min(1),
}).strict();
export type SvelteKitApiObservationOptionsV1 = z.infer<typeof SvelteKitApiObservationOptionsV1Schema>;

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function routeFromServerFile(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  const marker = '/src/routes/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0 || !/\/\+server\.(?:ts|js)$/.test(normalized)) return null;
  const relative = normalized.slice(index + marker.length).replace(/\/\+server\.(?:ts|js)$/, '');
  return `/${relative}`.replace(/\/+/g, '/');
}

function candidateMethod(candidate: AstGrepStructuralCandidateV1): string | null {
  const name = candidate.name.toUpperCase();
  return HTTP_METHODS.has(name) && candidate.isExported ? name : null;
}

/**
 * Grounded SvelteKit HTTP observer. It recognizes only exported HTTP method
 * handlers in +server.ts/+server.js files. Schema/auth/side-effect references
 * must be supplied by separately grounded evidence; this function never
 * guesses them from prose or naming conventions.
 */
export function observeSvelteKitHttpContractV1(
  candidateValue: AstGrepStructuralCandidateV1,
  optionsValue: SvelteKitApiObservationOptionsV1,
): ApiContractObservationV1 | null {
  const candidate = AstGrepStructuralCandidateV1Schema.parse(candidateValue);
  const options = SvelteKitApiObservationOptionsV1Schema.parse(optionsValue);
  const route = routeFromServerFile(candidate.filePath);
  const method = candidateMethod(candidate);
  if (!route || !method || !candidate.treeNodeId) return null;

  return compileApiContractObservationV1({
    schema: 'atlas.api-contract-nomination.v1',
    sourceRef: candidate.sourceRef,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    coordinate: {
      sourceRef: candidate.sourceRef,
      filePath: candidate.filePath,
      startByte: candidate.startByte,
      endByte: candidate.endByte,
      startChar: candidate.startColumn,
      endChar: candidate.endColumn,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
    },
    transport: 'HTTP',
    method,
    route,
    handlerSymbol: candidate.name,
    inputSchemaRefs: options.inputSchemaRefs,
    outputSchemaRefs: options.outputSchemaRefs,
    authRequirements: options.authRequirements,
    sideEffects: options.sideEffects,
    evidenceSources: ['AST_GREP'],
    grammarRevision: candidate.producerRevision,
    semanticEngineRevision: options.semanticEngine ? `semantic-engine:${options.semanticEngine}` : null,
    producerRevision: options.producerRevision,
    evidenceRefs: [
      `${candidate.sourceRef}#bytes=${candidate.startByte}-${candidate.endByte}`,
      `${candidate.sourceRef}#handler=${candidate.name}`,
    ],
  });
}
