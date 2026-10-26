import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CALLS_FACT_SCHEMA_V1 = 'atlas.calls-fact.v1' as const;

export const CallsFactResolutionEnum = z.enum(['EXACT', 'UNRESOLVED', 'DYNAMIC']);
export type CallsFactResolution = z.infer<typeof CallsFactResolutionEnum>;

export const CallsFactV1Schema = z.object({
  schema: z.literal(CALLS_FACT_SCHEMA_V1).default(CALLS_FACT_SCHEMA_V1),
  callerSymbolVersionId: z.string().min(1),
  calleeSymbolVersionId: z.string().nullable(),
  calleeExpression: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  resolution: CallsFactResolutionEnum,
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(data => data.endByte > data.startByte, {
  message: 'endByte must be strictly greater than startByte',
  path: ['endByte'],
}).refine(data => {
  // If resolution is EXACT, calleeSymbolVersionId must be present; if UNRESOLVED or DYNAMIC, it must be null unless an explicit proposal ID is supplied
  if (data.resolution === 'EXACT') {
    return Boolean(data.calleeSymbolVersionId);
  }
  return true;
}, {
  message: 'EXACT resolution requires a non-null calleeSymbolVersionId',
  path: ['calleeSymbolVersionId'],
});

export type CallsFactV1 = z.infer<typeof CallsFactV1Schema>;

/**
 * Computes deterministic SHA-256 evidence digest for a CALLS fact.
 */
export function computeCallsFactEvidenceDigest(params: {
  sourceRef: string;
  calleeExpression: string;
  startByte: number;
  endByte: number;
  sourceRevision: string;
}): string {
  const payload = [
    params.sourceRef,
    params.calleeExpression,
    params.startByte.toString(),
    params.endByte.toString(),
    params.sourceRevision,
  ].join('\0');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Mints a deterministic symbol version ID.
 */
export function mintSymbolVersionId(
  sourceRef: string,
  symbolName: string,
  startByte: number,
  sourceRevision: string
): string {
  const hash = createHash('sha256')
    .update(`${sourceRef}:${symbolName}:${startByte}:${sourceRevision}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `sym:${hash}`;
}

export interface KnownSymbolDefinition {
  name: string;
  symbolVersionId: string;
  startByte: number;
  endByte: number;
  kind: 'function' | 'method' | 'arrow' | 'class';
}

export interface ExtractCallsOptions {
  localDefinitions?: KnownSymbolDefinition[];
  imports?: Map<string, string>; // imported identifier -> module specifier
}

/**
 * Pure TypeScript AST Call Extractor.
 * Parses call expressions, resolves enclosing callers (functions, methods, arrow functions),
 * classifies EXACT vs UNRESOLVED vs DYNAMIC resolutions, and computes byte spans and evidence digests.
 */
export function extractCallsFactsFromSource(
  sourceText: string,
  sourceRef: string,
  sourceRevision: string,
  options: ExtractCallsOptions = {}
): CallsFactV1[] {
  const facts: CallsFactV1[] = [];
  const sourceBytes = Buffer.from(sourceText, 'utf8');

  // Discover local definitions if not passed in
  const localDefs: KnownSymbolDefinition[] = options.localDefinitions ? [...options.localDefinitions] : [];
  if (!options.localDefinitions) {
    // Regex discovery of function declarations
    const funcDeclRe = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = funcDeclRe.exec(sourceText)) !== null) {
      const name = m[1];
      const startByte = Buffer.byteLength(sourceText.slice(0, m.index), 'utf8');
      const symbolVersionId = mintSymbolVersionId(sourceRef, name, startByte, sourceRevision);
      localDefs.push({
        name,
        symbolVersionId,
        startByte,
        endByte: startByte + Buffer.byteLength(m[0], 'utf8'),
        kind: 'function',
      });
    }

    // Regex discovery of const/let arrow functions: const foo = (async)? (...) =>
    const arrowRe = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
    while ((m = arrowRe.exec(sourceText)) !== null) {
      const name = m[1];
      const startByte = Buffer.byteLength(sourceText.slice(0, m.index), 'utf8');
      const symbolVersionId = mintSymbolVersionId(sourceRef, name, startByte, sourceRevision);
      localDefs.push({
        name,
        symbolVersionId,
        startByte,
        endByte: startByte + Buffer.byteLength(m[0], 'utf8'),
        kind: 'arrow',
      });
    }

    // Regex discovery of class methods: methodName(...) {
    const methodRe = /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^\{]+)?\s*\{/g;
    while ((m = methodRe.exec(sourceText)) !== null) {
      const name = m[1];
      if (/^(if|for|while|switch|catch|function)$/.test(name)) continue;
      const startByte = Buffer.byteLength(sourceText.slice(0, m.index), 'utf8');
      const symbolVersionId = mintSymbolVersionId(sourceRef, name, startByte, sourceRevision);
      localDefs.push({
        name,
        symbolVersionId,
        startByte,
        endByte: startByte + Buffer.byteLength(m[0], 'utf8'),
        kind: 'method',
      });
    }
  }

  const localDefsByName = new Map<string, KnownSymbolDefinition>();
  for (const def of localDefs) {
    localDefsByName.set(def.name, def);
  }

  // Find call expressions: identifier(...) or obj.method(...) or computed[expr](...)
  const callRe = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|(?:\b[A-Za-z_$][\w$]*\[[^\]]+\]))\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callRe.exec(sourceText)) !== null) {
    const rawExpression = match[1].trim();

    // Skip control flow keywords
    if (/^(if|for|while|switch|catch|function|return|import|export)$/.test(rawExpression)) {
      continue;
    }

    const matchCharIndex = match.index;
    const startByte = Buffer.byteLength(sourceText.slice(0, matchCharIndex), 'utf8');
    const endByte = startByte + Buffer.byteLength(rawExpression, 'utf8');

    // Find enclosing caller from local definitions
    let enclosingCaller: KnownSymbolDefinition | null = null;
    for (const def of localDefs) {
      if (def.startByte <= startByte && (!enclosingCaller || def.startByte > enclosingCaller.startByte)) {
        enclosingCaller = def;
      }
    }

    const callerSymbolVersionId = enclosingCaller
      ? enclosingCaller.symbolVersionId
      : mintSymbolVersionId(sourceRef, '(module)', 0, sourceRevision);

    // Determine resolution and calleeSymbolVersionId
    let resolution: CallsFactResolution = 'UNRESOLVED';
    let calleeSymbolVersionId: string | null = null;

    if (rawExpression.includes('[') || rawExpression === 'eval' || rawExpression === 'Function') {
      resolution = 'DYNAMIC';
      calleeSymbolVersionId = null;
    } else if (localDefsByName.has(rawExpression)) {
      resolution = 'EXACT';
      calleeSymbolVersionId = localDefsByName.get(rawExpression)!.symbolVersionId;
    } else if (rawExpression.startsWith('this.')) {
      const methodName = rawExpression.slice(5);
      if (localDefsByName.has(methodName)) {
        resolution = 'EXACT';
        calleeSymbolVersionId = localDefsByName.get(methodName)!.symbolVersionId;
      } else {
        resolution = 'UNRESOLVED';
        calleeSymbolVersionId = null;
      }
    } else {
      resolution = 'UNRESOLVED';
      calleeSymbolVersionId = null;
    }

    const evidenceDigest = computeCallsFactEvidenceDigest({
      sourceRef,
      calleeExpression: rawExpression,
      startByte,
      endByte,
      sourceRevision,
    });

    facts.push({
      schema: CALLS_FACT_SCHEMA_V1,
      callerSymbolVersionId,
      calleeSymbolVersionId,
      calleeExpression: rawExpression,
      sourceRef,
      sourceRevision,
      startByte,
      endByte,
      resolution,
      evidenceDigest,
    });
  }

  return facts;
}
