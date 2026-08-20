import { describe, expect, it } from 'vitest';
import {
  canonicalizeAtlasToolId,
  getToolImplementationProfile,
  isImplementationRoutable,
} from './tool-implementation-profile.js';

describe('Atlas tool implementation profiles', () => {
  it('normalizes legacy FSM aliases to canonical registry tools', () => {
    expect(canonicalizeAtlasToolId('atlas.retrieve')).toBe('atlas.search');
    expect(canonicalizeAtlasToolId('atlas.graph_traversal')).toBe('atlas.graph.expand');
    expect(canonicalizeAtlasToolId('atlas.apply_change')).toBe('atlas.patch.apply');
  });

  it('fails closed for the current search stub', () => {
    const profile = getToolImplementationProfile('atlas.search');
    expect(profile?.implementationStatus).toBe('STUB');
    expect(profile && isImplementationRoutable({ profile, mode: 'default' }).eligible).toBe(false);
  });

  it('allows only the wired graph expansion modes', () => {
    const profile = getToolImplementationProfile('atlas.graph.expand');
    expect(profile).toBeDefined();
    expect(isImplementationRoutable({ profile: profile!, mode: 'bfs' }).eligible).toBe(true);
    expect(isImplementationRoutable({ profile: profile!, mode: 'reverse_bfs' }).eligible).toBe(true);
    expect(isImplementationRoutable({ profile: profile!, mode: 'sssp' }).eligible).toBe(false);
    expect(isImplementationRoutable({ profile: profile!, mode: 'yen' }).eligible).toBe(false);
  });

  it('does not make patch apply routable merely because it requires approval', () => {
    const profile = getToolImplementationProfile('atlas.patch.apply');
    expect(profile?.humanApprovalRequired).toBe(true);
    expect(profile?.routingEligible).toBe(false);
  });
});
