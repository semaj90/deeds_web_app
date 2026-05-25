import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildVarianceRecoveryContext } from '../../src/lib/server/ace/variance-recovery.js';

async function run() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: node scripts/ace/build-packet.mjs \"<query>\"");
    process.exit(1);
  }

  console.log(`[build-packet] Query: "${query}"`);

  const aceTmpDir = path.join(process.cwd(), '.tmp', 'ace');
  const lokiPath = path.join(aceTmpDir, 'loki-atlas.json');
  
  let lokiData = null;
  let fuseFallbackUsed = false;
  let degraded = false;

  // 1. Load loki-atlas.json
  if (fs.existsSync(lokiPath)) {
    try {
      lokiData = JSON.parse(fs.readFileSync(lokiPath, 'utf8'));
      console.log(`[build-packet] Successfully loaded ${lokiPath}`);
    } catch (e) {
      console.warn(`[build-packet] WARN: Failed to parse loki-atlas.json: ${e.message}`);
    }
  } else {
    console.warn(`[build-packet] WARN: Missing browser cache (${lokiPath}). Falling back to enrichers.`);
    fuseFallbackUsed = true;
    degraded = true; // No browser cache means weak sourceRefs initially
  }

  // 2. Fuse fuzzy search (simulated)
  let rankedCards = [];
  if (lokiData && lokiData.collections) {
    console.log(`[build-packet] Simulating Fuse.js fuzzy search against local cards...`);
  }

  // 3. Redis ACE cache check (simulated)
  console.log(`[build-packet] Checking Redis ACE cache for previous reasoning...`);
  const queryHash = crypto.createHash('sha256').update(query).digest('hex');
  const promptCacheKey = `ace:prompt:${queryHash}`;

  // 4. Qdrant / Postgres + semantic variance recovery
  console.log(`[build-packet] Enriching via Qdrant/Postgres + variance recovery...`);
  let sourceRefs = [];
  let varianceRecovery = {
    exactMatchFailed: true,
    fuzzySearchCandidates: [],
    didYouMean: [],
    semanticSearchHits: [],
    qdrantTags: [],
    clusterTagRecall: [],
    langextractEntities: [],
    semanticCacheHits: [],
    acePacket: promptCacheKey,
    nextSteps: ['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet']
  };

  try {
    const recovery = await buildVarianceRecoveryContext({
      query,
      lokiData,
      promptCacheKey,
      degraded,
      sourceRefs,
      rankedCards,
    });
    sourceRefs = recovery.sourceRefs;
    rankedCards = recovery.rankedCards;
    varianceRecovery = recovery.varianceRecovery;
    degraded = Boolean(varianceRecovery.exactMatchFailed);
  } catch (err) {
    console.warn(`[build-packet] WARN: Variance recovery failed: ${err.message}`);
    degraded = true;
  }

  if (sourceRefs.length === 0) {
    sourceRefs = ['doc:local_cache'];
    degraded = true;
  }

  // 5. Build compact ACE packet
  const packet = {
    query,
    cacheSources: ["redis", "loki", "fuse", "qdrant", "postgres", "langextract"],
    sourceRefs,
    rankedCards,
    failureHints: degraded ? ["Missing strong local sourceRefs"] : [],
    nextActions: varianceRecovery.nextSteps?.length ? varianceRecovery.nextSteps : ["synthesis"],
    promptCacheKey,
    degraded,
    varianceRecovery
  };

  if (!fs.existsSync(aceTmpDir)) {
    fs.mkdirSync(aceTmpDir, { recursive: true });
  }

  const outPath = path.join(aceTmpDir, `packet-${queryHash}.json`);
  fs.writeFileSync(outPath, JSON.stringify(packet, null, 2));

  console.log(`[build-packet] ACE Packet built successfully: ${outPath}`);
  console.log(JSON.stringify(packet, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
