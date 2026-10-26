import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_FEATURE_LABELS,
  FEATURE_TAXONOMY_V1,
  matchFeatureLabel,
  isCanonicalFeatureLabel,
  resolveFeatureLabel,
  proposeCanonicalFeatureLabelForSourceRefV1,
} from './feature-taxonomy-v1.js';

describe('FeatureTaxonomyV1 Contract', () => {
  it('defines exactly 21 canonical product feature labels', () => {
    expect(CANONICAL_FEATURE_LABELS).toHaveLength(21);
    for (const label of CANONICAL_FEATURE_LABELS) {
      expect(FEATURE_TAXONOMY_V1[label]).toBeDefined();
      expect(FEATURE_TAXONOMY_V1[label].sveltekitRoutes.length).toBeGreaterThan(0);
      expect(FEATURE_TAXONOMY_V1[label].tokenBudget).toBeGreaterThan(0);
      expect(FEATURE_TAXONOMY_V1[label].nesFsmState).toMatch(/^NES_STATE_/);
    }
  });

  it('keeps every SvelteKit example anchored to an existing source file', () => {
    const missing = CANONICAL_FEATURE_LABELS.flatMap((label) =>
      FEATURE_TAXONOMY_V1[label].coreComponents
        .filter((sourceRef) => !existsSync(resolve(process.cwd(), sourceRef)))
        .map((sourceRef) => `${label}: ${sourceRef}`),
    );

    expect(missing).toEqual([]);
  });

  it('correctly matches direct labels and route paths', () => {
    expect(matchFeatureLabel('auth')).toBe('auth');
    expect(matchFeatureLabel('/login')).toBe('auth');
    expect(matchFeatureLabel('/chat')).toBe('chat');
    expect(matchFeatureLabel('/demos/bento-dashboard')).toBe('html5_visual_playground');
    expect(matchFeatureLabel('/codebase-wiki')).toBe('wiki');
    expect(matchFeatureLabel('/admin')).toBe('admin_ops');
    expect(matchFeatureLabel('/demos/collab-canvas')).toBe('canvas');
    expect(matchFeatureLabel('/cases')).toBe('cases');
    expect(matchFeatureLabel('/evidence')).toBe('evidence');
    expect(matchFeatureLabel('/terminal')).toBe('terminal');
  });

  it('correctly matches query keywords to feature labels', () => {
    expect(matchFeatureLabel('how do I reset user permission and jwt?')).toBe('auth');
    expect(matchFeatureLabel('run whisper audio transcribe')).toBe('media_transcribe');
    expect(matchFeatureLabel('search global vector rag search')).toBe('search_rag');
    expect(matchFeatureLabel('run crime reconstruction courtroom simulation')).toBe('reconstruction_sim');
    expect(matchFeatureLabel('export charging memo pdf report')).toBe('reports');
  });

  it('validates canonical feature labels safely', () => {
    expect(isCanonicalFeatureLabel('auth')).toBe(true);
    expect(isCanonicalFeatureLabel('chat')).toBe(true);
    expect(isCanonicalFeatureLabel('not_a_feature')).toBe(false);
  });

  it('keeps unsupported product names as aliases, not canonical labels', () => {
    expect(resolveFeatureLabel('forum')).toBe('chat');
    expect(resolveFeatureLabel('photo_editor')).toBe('image_creator');
    expect(resolveFeatureLabel('video_editor')).toBe('media_transcribe');
    expect(isCanonicalFeatureLabel('forum')).toBe(false);
    expect(isCanonicalFeatureLabel('photo_editor')).toBe(false);
    expect(isCanonicalFeatureLabel('video_editor')).toBe(false);
  });

  it('maps exact packet source references to existing catalog labels as proposals', () => {
    const examples = [
      ['sveltekit-frontend/src/routes/(app)/chat/+page.svelte', 'chat'],
      ['sveltekit-frontend/src/lib/components/AIChatAssistant.svelte', 'ai_chat'],
      ['sveltekit-frontend/src/routes/login/+page.svelte', 'auth'],
      ['sveltekit-frontend/src/lib/features/evidence-command-center/EvidenceGraphPane.svelte', 'canvas'],
      ['sveltekit-frontend/src/lib/server/ai/whisper.ts', 'media_transcribe'],
      ['sveltekit-frontend/src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts', 'code_intel'],
    ] as const;

    for (const [sourceRef, featureLabel] of examples) {
      expect(proposeCanonicalFeatureLabelForSourceRefV1(sourceRef)).toMatchObject({
        status: 'EXACT',
        authority: 'CATALOG_ANCHOR_PROPOSAL',
        sourceRef,
        featureLabel,
      });
    }
  });

  it('normalizes Windows separators and rejects fuzzy or traversal-based source matches', () => {
    expect(proposeCanonicalFeatureLabelForSourceRefV1('sveltekit-frontend\\src\\routes\\login\\+page.svelte')).toMatchObject({
      status: 'EXACT',
      featureLabel: 'auth',
    });
    expect(proposeCanonicalFeatureLabelForSourceRefV1('src/unknown/chat-auth.ts')).toMatchObject({
      status: 'UNMAPPED',
    });
    expect(proposeCanonicalFeatureLabelForSourceRefV1('sveltekit-frontend/../src/routes/login/+page.svelte')).toMatchObject({
      status: 'UNMAPPED',
    });
  });
});
