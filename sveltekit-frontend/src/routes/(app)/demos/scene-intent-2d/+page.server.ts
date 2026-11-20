/**
 * Phase 1 / 2D timeline demo. Loads the hand-written SceneIntent fixture
 * from scripts/reconstruction/demo-scene-intent.json and validates it
 * against the canonical schema before handing it to the page. If parsing
 * fails (someone hand-edited the fixture into something invalid) the
 * page falls back to the degraded fixture so the route never 500s — same
 * Degraded Response Contract as the API.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SceneIntentSchema,
  type SceneIntent,
} from '$lib/server/reconstruction/crime-scene-schema.js';
import { buildDegradedFixture } from '$lib/server/reconstruction/scene-intent-extractor.js';
import { fictionalBankCaseSeedV1 } from '$lib/server/reconstruction/fixtures/fictional-bank-case-seed-v1.js';
import { assertEastQuayFixtureReadOnlyV1, type EastQuayCaseFixtureV1 } from '$lib/scene/procedural/parent-atlas-east-quay-case-v1/case-fixture-v1.js';
import type { PageServerLoad } from './$types';

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo-relative path: src/routes/(app)/demos/scene-intent-2d → repo root is 5 up
const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../..',
  'scripts/reconstruction/demo-scene-intent.json',
);

export const load: PageServerLoad = async () => {
  let sceneIntent: SceneIntent;
  let loadError: string | null = null;
  let source: 'fixture' | 'degraded' = 'fixture';
  let eastQuayFixture: EastQuayCaseFixtureV1 | null = null;

  try {
    const raw = await readFile(FIXTURE_PATH, 'utf8');
    const parsed = SceneIntentSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      sceneIntent = parsed.data;
    } else {
      loadError = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      sceneIntent = buildDegradedFixture({
        narrative: 'Fixture failed Zod validation — see loadError.',
      });
      source = 'degraded';
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    sceneIntent = buildDegradedFixture({
      narrative: 'Fixture file unreadable — see loadError.',
    });
    source = 'degraded';
  }

  try {
    const eastQuayRoot = resolve(__dirname, '../../../../..', 'static/demos/east-quay-bank-case-v1');
    const eastQuayPath = resolve(eastQuayRoot, 'data/case.json');
    const candidate: unknown = JSON.parse(await readFile(eastQuayPath, 'utf8'));
    eastQuayFixture = assertEastQuayFixtureReadOnlyV1({
      fixture: candidate,
      caseId: 'PA-DEMO-ROBBERY-001',
      sceneId: 'SC-01',
      operation: 'READ'
    });
    for (const person of eastQuayFixture.people) {
      const portraitBytes = await readFile(resolve(eastQuayRoot, person.portraitAsset.path));
      const portraitSha256 = createHash('sha256').update(portraitBytes).digest('hex');
      if (portraitSha256 !== person.portraitAsset.sha256) throw new Error(`Synthetic portrait checksum mismatch: ${person.personId}`);
    }
  } catch (err) {
    loadError = [loadError, `East Quay demo fixture unavailable: ${err instanceof Error ? err.message : String(err)}`].filter(Boolean).join('; ');
  }

  return { sceneIntent, source, loadError, fictionalCase: fictionalBankCaseSeedV1, eastQuayFixture };
};
