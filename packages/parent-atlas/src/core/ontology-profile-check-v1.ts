import { createHash } from 'node:crypto';
import { z } from 'zod';

const profile = z.enum(['OWL2_EL', 'OWL2_DL', 'OUTSIDE_OWL2_DL', 'UNKNOWN']);
const status = z.enum(['PROVEN', 'UNAVAILABLE', 'FAILED']);

export const ontologyProfileCheckV1ReceiptSchema = z.object({
  schema: z.literal('atlas.ontology-profile-check-receipt.v1'),
  owlChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  parser: z.enum(['OWLAPI', 'UNAVAILABLE']),
  parserRevision: z.string().min(1),
  syntax: z.literal('RDFXML'),
  parseStatus: z.enum(['PROVEN', 'UNAVAILABLE', 'FAILED']),
  checker: z.enum(['OWLAPI', 'UNAVAILABLE']),
  checkerRevision: z.string().min(1),
  status,
  owl2El: z.object({ passed: z.boolean(), violations: z.array(z.string()) }).strict(),
  owl2Dl: z.object({ passed: z.boolean(), violations: z.array(z.string()) }).strict(),
  detectedProfile: profile,
  reasonerRoute: z.enum(['ELK', 'HERMIT', 'NONE']),
  canonicalAuthority: z.literal(false),
  receiptChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type OntologyProfileCheckV1Receipt = z.infer<typeof ontologyProfileCheckV1ReceiptSchema>;

export interface OwlApiProfileCheckResultV1 {
  owl2El: { passed: boolean; violations: string[] };
  owl2Dl: { passed: boolean; violations: string[] };
  checkerRevision: string;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/**
 * Adapter boundary for OWLAPI OWL2ELProfile/OWL2DLProfile. The checker is
 * injected so this package remains reasoner-free and JVM-free. OWLAPI profile
 * checking is not reasoning and must be supplied by an isolated sidecar or
 * subprocess before this receipt can become PROVEN.
 */
export function buildOntologyProfileCheckV1(input: {
  owlChecksum: string;
  result?: OwlApiProfileCheckResultV1;
  error?: string;
}): OntologyProfileCheckV1Receipt {
  const result = input.result;
  const body = result ? {
    schema: 'atlas.ontology-profile-check-receipt.v1' as const,
    owlChecksum: input.owlChecksum,
    parser: 'OWLAPI' as const,
    parserRevision: result.checkerRevision,
    syntax: 'RDFXML' as const,
    parseStatus: 'PROVEN' as const,
    checker: 'OWLAPI' as const,
    checkerRevision: result.checkerRevision,
    status: 'PROVEN' as const,
    owl2El: result.owl2El,
    owl2Dl: result.owl2Dl,
    detectedProfile: result.owl2El.passed ? 'OWL2_EL' as const : result.owl2Dl.passed ? 'OWL2_DL' as const : 'OUTSIDE_OWL2_DL' as const,
    reasonerRoute: result.owl2El.passed ? 'ELK' as const : result.owl2Dl.passed ? 'HERMIT' as const : 'NONE' as const,
    canonicalAuthority: false as const,
  } : {
    schema: 'atlas.ontology-profile-check-receipt.v1' as const,
    owlChecksum: input.owlChecksum,
    parser: 'UNAVAILABLE' as const,
    parserRevision: 'not-installed',
    syntax: 'RDFXML' as const,
    parseStatus: input.error ? 'FAILED' as const : 'UNAVAILABLE' as const,
    checker: 'UNAVAILABLE' as const,
    checkerRevision: 'not-installed',
    status: input.error ? 'FAILED' as const : 'UNAVAILABLE' as const,
    owl2El: { passed: false, violations: [input.error ?? 'OWLAPI profile checker unavailable'] },
    owl2Dl: { passed: false, violations: [input.error ?? 'OWLAPI profile checker unavailable'] },
    detectedProfile: 'UNKNOWN' as const,
    reasonerRoute: 'NONE' as const,
    canonicalAuthority: false as const,
  };
  return ontologyProfileCheckV1ReceiptSchema.parse({ ...body, receiptChecksum: hash(body) });
}
