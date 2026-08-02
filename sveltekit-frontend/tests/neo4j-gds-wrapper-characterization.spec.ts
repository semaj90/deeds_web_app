// @vitest-environment node
/**
 * GDS_2: characterization tests for the 4 live neo4j-gds.ts wrappers.
 *
 * These lock in the exact public signature + return-field shape each of the
 * 4 real consumers (karpathy-persistence.ts, hyperrag-fusion-service.ts, and
 * two +server.ts routes) depends on, so a future refactor can't silently
 * rename/drop a field. Static-audit part (GDS_static_no_embedded_query)
 * guards against a migrated wrapper regaining an embedded session.run/CALL/
 * MATCH body — the exact defect class flagged in the PARENT_ATLAS_GDS_
 * CANONICALIZATION review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = readFileSync(
  path.resolve(__dirname, '../src/lib/server/graph/neo4j-gds.ts'),
  'utf-8',
);

function extractFunctionBody(fnSignatureStart: string): string {
  const idx = SOURCE.indexOf(fnSignatureStart);
  expect(idx, `function "${fnSignatureStart}" not found in neo4j-gds.ts`).toBeGreaterThan(-1);
  // Find the body-opening brace: the first "{" that starts a new line (own body
  // block), not one embedded in an inline return-type object literal on the
  // signature line itself.
  const afterSig = SOURCE.slice(idx);
  const bodyOpenMatch = afterSig.match(/\{\s*\n/);
  expect(bodyOpenMatch, `could not find body-opening brace for "${fnSignatureStart}"`).not.toBeNull();
  const bodyStart = idx + bodyOpenMatch!.index!;
  let depth = 0;
  for (let i = bodyStart; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}') {
      depth--;
      if (depth === 0) return SOURCE.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`Unbalanced braces reading body of "${fnSignatureStart}"`);
}

describe('neo4j-gds.ts wrapper signatures (locked for 4 live callers)', () => {
  it('ensureGdsProjection keeps its exact signature', () => {
    expect(SOURCE).toContain(
      'export async function ensureGdsProjection(force = false): Promise<{ created: boolean; nodeCount: number; relationshipCount: number }>',
    );
  });

  it('runPageRankMutate keeps its exact signature', () => {
    expect(SOURCE).toContain('export async function runPageRankMutate(): Promise<PageRankResult>');
  });

  it('getTopAuthorityNodes keeps its exact signature', () => {
    expect(SOURCE).toContain(
      'export async function getTopAuthorityNodes(limit = 25): Promise<AuthorityNode[]>',
    );
  });

  it('getImpactNeighborhood keeps its exact signature', () => {
    expect(SOURCE).toMatch(
      /export async function getImpactNeighborhood\(\s*stableKey: string,\s*maxDepth = 3,\s*limit = 100,\s*\): Promise<ImpactResult>/,
    );
  });

  it('PageRankResult still carries nodesUpdated/durationMs (no silent rename)', () => {
    expect(SOURCE).toMatch(/export interface PageRankResult \{\s*nodesUpdated: number;\s*durationMs: number;\s*\}/);
  });

  it('AuthorityNode still carries stableKey/labels/path/graphPageRank/louvainCommunity', () => {
    expect(SOURCE).toMatch(
      /export interface AuthorityNode \{\s*stableKey: string;\s*labels: string\[\];\s*path\?: string;\s*graphPageRank: number;\s*louvainCommunity\?: number;\s*\}/,
    );
  });

  it('ImpactResult still carries stableKey/affected/totalCount/durationMs', () => {
    expect(SOURCE).toMatch(
      /export interface ImpactResult \{\s*stableKey: string;\s*affected: ImpactNode\[\];\s*totalCount: number;\s*durationMs: number;\s*\}/,
    );
  });
});

describe('GDS static audit: migrated wrappers contain no embedded query bodies', () => {
  const WRAPPER_SIGNATURES = [
    'export async function ensureGdsProjection(force = false)',
    'export async function runPageRankMutate()',
    'export async function getTopAuthorityNodes(limit = 25)',
    'export async function getImpactNeighborhood(',
  ];

  for (const sig of WRAPPER_SIGNATURES) {
    it(`"${sig}" has no session.run/CALL/MATCH in its body (delegates only)`, () => {
      const body = extractFunctionBody(sig);
      expect(body).not.toMatch(/session\.run\(/);
      expect(body).not.toMatch(/CALL\s+(gds|apoc)\./);
      expect(body).not.toMatch(/MATCH\s*\(/);
    });

    it(`"${sig}" has exactly one JSDoc block immediately above it (no duplicate)`, () => {
      const idx = SOURCE.indexOf(sig);
      const before = SOURCE.slice(0, idx);
      // Count consecutive */ closes with only whitespace/comment-open between them
      // immediately preceding the function — two adjacent JSDoc blocks would show
      // as "*/\n\n/**" right before the signature with no code line between.
      const tail = before.slice(-400);
      const duplicatePattern = /\*\/\s*\n\s*\/\*\*[\s\S]*?\*\/\s*\n\s*\/\*\*/;
      expect(duplicatePattern.test(tail)).toBe(false);
    });
  }

  it('ensureGdsProjection body is a single-line delegation', () => {
    const body = extractFunctionBody('export async function ensureGdsProjection(force = false)');
    expect(body).toContain('getGraphAnalyticsService().ensureProjection(');
  });

  it('runPageRankMutate body is a single-line delegation', () => {
    const body = extractFunctionBody('export async function runPageRankMutate()');
    expect(body).toContain('getGraphAnalyticsService().runPageRank(');
  });

  it('getTopAuthorityNodes body is a single-line delegation', () => {
    const body = extractFunctionBody('export async function getTopAuthorityNodes(limit = 25)');
    expect(body).toContain('getTopPageRankBounded(');
  });

  it('getImpactNeighborhood body delegates to expandGraphBounded, not a raw query', () => {
    const body = extractFunctionBody('export async function getImpactNeighborhood(');
    expect(body).toContain('expandGraphBounded(');
    expect(body).toContain('Date.now()');
  });
});
