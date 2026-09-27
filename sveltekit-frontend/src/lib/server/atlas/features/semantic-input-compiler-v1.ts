import path from 'node:path';
import {
  SEMANTIC_INPUT_ARTIFACT_SCHEMA,
  SELECTION_POLICY_REVISIONS,
  semanticInputArtifactV1Schema,
  sha256HexPrefixed,
  type SemanticInputArtifactV1,
  type SemanticInputSegmentV1,
} from './semantic-input-artifact-v1.js';

/**
 * SEM-INPUT-01 compiler. Deterministic, offline, in-process (@ast-grep/napi,
 * a compiled N-API addon -- no live structural-search service, no network
 * call except the eventual embedding executor which is the CALLER's job, not
 * this compiler's). This module selects WHICH bytes to embed; it never
 * embeds anything itself.
 *
 * Supported grammars today: TypeScript/JavaScript (`.ts`/`.tsx`/`.js`/`.mjs`)
 * via @ast-grep/napi's compiled-in `ts`/`js` languages, and Markdown via a
 * plain heading-section split (no AST -- ast-grep/napi has no markdown
 * grammar compiled in, confirmed live: `Object.keys(require('@ast-grep/napi'))`
 * = kind/parse/pattern/parseAsync/findInFiles/registerDynamicLanguage/
 * parseFiles/Lang/tsx/jsx/html/css/ts/js/SgNode/SgRoot -- no markdown/python/sql).
 * Everything else falls back to WHOLE_FILE_FALLBACK, an explicit, named
 * UNKNOWN policy -- never a silent arbitrary truncation.
 */

function segment(kind: SemanticInputSegmentV1['kind'], buf: Buffer, startByte: number, endByte: number): SemanticInputSegmentV1 {
  return {
    kind,
    startByte,
    endByte,
    checksum: sha256HexPrefixed(buf.subarray(startByte, endByte)),
  };
}

/** TS/JS: select every top-level function/class/const-arrow declaration's signature line + its full body. */
async function compileTsJs(buf: Buffer, lang: 'ts' | 'js'): Promise<{ segments: SemanticInputSegmentV1[]; policy: string }> {
  const ag = await import('@ast-grep/napi');
  const text = buf.toString('utf8');
  const root = (ag as any)[lang].parse(text).root();

  const patterns = [
    'function $NAME($$$ARGS) { $$$BODY }',
    'export function $NAME($$$ARGS) { $$$BODY }',
    'class $NAME { $$$BODY }',
    'export class $NAME { $$$BODY }',
  ];

  // Candidate byte ranges from every pattern first, THEN dedupe/de-overlap.
  // `function $NAME(...)` and `export function $NAME(...)` both match an
  // exported function (the bare pattern matches the inner node, the
  // "export "-prefixed pattern matches the wrapping export statement) --
  // without de-overlapping, both ranges get kept and their bytes get
  // double-counted in the rendered output (found live: a real candidate's
  // renderedBytes exceeded its originalBytes, which is only possible when
  // segments overlap since they're all subsets of the same buffer).
  const rawRanges: Array<{ startByte: number; endByte: number }> = [];
  const seenRanges = new Set<string>();
  for (const pattern of patterns) {
    const matches = root.findAll(pattern);
    for (const m of matches) {
      const range = m.range();
      const startByte = Buffer.byteLength(text.slice(0, range.start.index), 'utf8');
      const endByte = Buffer.byteLength(text.slice(0, range.end.index), 'utf8');
      const key = `${startByte}:${endByte}`;
      if (seenRanges.has(key)) continue;
      seenRanges.add(key);
      rawRanges.push({ startByte, endByte });
    }
  }

  // Greedy widest-first: sort by start asc, then length desc, and only
  // accept a range that does not overlap any already-accepted range. This
  // guarantees sum(segment lengths) can never exceed buf.length for this
  // branch -- the invariant the earlier double-counting bug violated.
  rawRanges.sort((a, b) => a.startByte - b.startByte || (b.endByte - b.startByte) - (a.endByte - a.startByte));
  const accepted: Array<{ startByte: number; endByte: number }> = [];
  for (const r of rawRanges) {
    const overlaps = accepted.some((a) => r.startByte < a.endByte && r.endByte > a.startByte);
    if (!overlaps) accepted.push(r);
  }

  const segments: SemanticInputSegmentV1[] = accepted
    .sort((a, b) => a.startByte - b.startByte)
    .map((r) => segment('DECLARATION', buf, r.startByte, r.endByte));

  if (segments.length === 0) {
    // No top-level function/class declarations found (e.g. a pure-constants
    // file) -- fall back to the whole file rather than emitting zero segments.
    return { segments: [segment('WHOLE_FILE_FALLBACK', buf, 0, buf.length)], policy: SELECTION_POLICY_REVISIONS.WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR };
  }

  return { segments, policy: SELECTION_POLICY_REVISIONS.TS_JS_TOP_LEVEL_DECLARATIONS };
}

/** Markdown: the first H1/H2 section (heading line through the byte before the next heading, or EOF). */
function compileMarkdown(buf: Buffer): { segments: SemanticInputSegmentV1[]; policy: string } {
  const text = buf.toString('utf8');
  const headingRe = /^#{1,2}\s+.+$/gm;
  const matches = [...text.matchAll(headingRe)];
  if (matches.length === 0) {
    return { segments: [segment('WHOLE_FILE_FALLBACK', buf, 0, buf.length)], policy: SELECTION_POLICY_REVISIONS.WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR };
  }
  const first = matches[0];
  const firstStart = first.index ?? 0;
  const secondStart = matches.length > 1 ? (matches[1].index ?? text.length) : text.length;

  const startByte = Buffer.byteLength(text.slice(0, firstStart), 'utf8');
  const endByte = Buffer.byteLength(text.slice(0, secondStart), 'utf8');
  return {
    segments: [segment('HEADING', buf, startByte, endByte)],
    policy: SELECTION_POLICY_REVISIONS.MARKDOWN_FIRST_HEADING_SECTION,
  };
}

export interface CompileSemanticInputInput {
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string;
  sourceRevision: string;
  fileBuffer: Buffer;
}

export async function compileSemanticInputArtifactV1(input: CompileSemanticInputInput): Promise<SemanticInputArtifactV1> {
  const ext = path.extname(input.sourceRef).toLowerCase();
  let compiled: { segments: SemanticInputSegmentV1[]; policy: string };

  if (ext === '.ts' || ext === '.tsx' || ext === '.mts') {
    compiled = await compileTsJs(input.fileBuffer, 'ts');
  } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.jsx') {
    compiled = await compileTsJs(input.fileBuffer, 'js');
  } else if (ext === '.md' || ext === '.mdx') {
    compiled = compileMarkdown(input.fileBuffer);
  } else {
    // Explicit, named UNKNOWN policy -- not a guess, not a silent truncation.
    compiled = { segments: [segment('WHOLE_FILE_FALLBACK', input.fileBuffer, 0, input.fileBuffer.length)], policy: SELECTION_POLICY_REVISIONS.WHOLE_FILE_FALLBACK_UNSUPPORTED_GRAMMAR };
  }

  const renderedBuf = Buffer.concat(compiled.segments.map((s) => input.fileBuffer.subarray(s.startByte, s.endByte)));
  const renderedTextChecksum = sha256HexPrefixed(renderedBuf);

  const artifact: SemanticInputArtifactV1 = {
    schema: SEMANTIC_INPUT_ARTIFACT_SCHEMA,
    canonicalId: input.canonicalId,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    selectionPolicyRevision: compiled.policy,
    segments: compiled.segments,
    renderedTextChecksum,
    tokenCount: null, // filled by the caller if/when it tokenizes against the real executor
  };

  return semanticInputArtifactV1Schema.parse(artifact);
}

export function renderSemanticInputText(artifact: SemanticInputArtifactV1, fileBuffer: Buffer): string {
  return Buffer.concat(artifact.segments.map((s) => fileBuffer.subarray(s.startByte, s.endByte))).toString('utf8');
}
