import { describe, expect, it } from 'vitest';
import { reconcileMcpHandlerClassificationV1 } from './mcp-handler-classification-v1.js';

describe('reconcileMcpHandlerClassificationV1', () => {
  it('reclassifies a name confirmed live on TRACE as DEPRECATED_ALIAS', () => {
    const results = reconcileMcpHandlerClassificationV1(new Set(['atlas.packet_search']));
    const entry = results.find((r) => r.name === 'atlas.packet_search');
    expect(entry?.classification).toBe('DEPRECATED_ALIAS');
    expect(entry?.liveOnTrace).toBe(true);
  });

  it('reclassifies a DELEGATED_CANONICAL name confirmed live on TRACE (e.g. phase109a_*) as DEPRECATED_ALIAS', () => {
    const results = reconcileMcpHandlerClassificationV1(new Set(['phase109a_archive_signal']));
    const entry = results.find((r) => r.name === 'phase109a_archive_signal');
    expect(entry?.classification).toBe('DEPRECATED_ALIAS');
    expect(entry?.previousClassification).toBe('DELEGATED_CANONICAL');
  });

  it('fails closed to UNKNOWN when a previously-classified name is absent from live TRACE discovery', () => {
    const results = reconcileMcpHandlerClassificationV1(new Set());
    const entry = results.find((r) => r.name === 'identity:quarantine');
    expect(entry?.classification).toBe('UNKNOWN');
    expect(entry?.liveOnTrace).toBe(false);
  });

  it('never silently defaults to a safe-looking category (INTERNAL_HANDLER/DEAD_ORPHAN) without live confirmation', () => {
    const results = reconcileMcpHandlerClassificationV1(new Set());
    for (const entry of results) {
      if (!entry.liveOnTrace) {
        expect(entry.classification).toBe('UNKNOWN');
      }
    }
  });

  it('covers all 22 previously-unlisted handlers plus all 7 previously-duplicate names (29 total)', () => {
    const results = reconcileMcpHandlerClassificationV1(new Set());
    expect(results).toHaveLength(29);
  });

  it('is deterministic for the same live-tool-name input', () => {
    const live = new Set(['atlas.packet_search', 'wiki.status']);
    const a = reconcileMcpHandlerClassificationV1(live);
    const b = reconcileMcpHandlerClassificationV1(live);
    expect(a).toEqual(b);
  });
});
