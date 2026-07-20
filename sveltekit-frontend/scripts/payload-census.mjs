import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://127.0.0.1:6333', checkCompatibility: false });

async function payloadCensus() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Qdrant Payload Shape Census                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // List all collections
  const collections = await qdrant.getCollections();
  const canonicalCollections = collections.collections
    .filter(c => c.name.includes('768') || c.name.includes('384') || c.name.includes('hybrid'))
    .map(c => c.name)
    .sort();

  console.log(`📦 Collections found (vector-related):\n${canonicalCollections.map(c => `  - ${c}`).join('\n')}\n`);

  for (const collectionName of canonicalCollections) {
    console.log(`\n🔍 Analyzing: ${collectionName}`);
    
    const collection = await qdrant.getCollection(collectionName);
    const pointCount = collection.points_count;
    console.log(`   Points: ${pointCount}`);

    // Scroll all points to inspect payload shape
    const payloadShapes = new Map(); // signature -> count
    const samplesByShape = new Map(); // signature -> example point
    
    let scrollOffset = 0;
    let pointsProcessed = 0;
    const limit = 100;

    while (pointsProcessed < Math.min(pointCount, 5000)) {
      try {
        const result = await qdrant.scroll(collectionName, {
          limit,
          offset: scrollOffset,
          with_payload: true,
          with_vectors: false,
        });

        for (const point of result.points) {
          const payload = point.payload || {};
          const keys = Object.keys(payload).sort();
          const signature = keys.join('|') || 'EMPTY';
          
          payloadShapes.set(signature, (payloadShapes.get(signature) || 0) + 1);
          
          if (!samplesByShape.has(signature)) {
            samplesByShape.set(signature, point);
          }
        }

        pointsProcessed += result.points.length;
        scrollOffset += limit;

        if (result.points.length < limit) break;
      } catch (err) {
        console.error(`   Error scrolling: ${err.message}`);
        break;
      }
    }

    // Classify shapes
    let atlasCount = 0, legacyCount = 0, partialCount = 0, otherCount = 0;

    console.log(`\n   📊 Payload Shapes (first ${pointsProcessed} points):`);
    for (const [sig, count] of Array.from(payloadShapes.entries()).sort((a, b) => b[1] - a[1])) {
      const percentage = ((count / pointsProcessed) * 100).toFixed(1);
      const keys = sig === 'EMPTY' ? '(no payload)' : sig.split('|');
      
      // Classify
      if (sig.includes('packet_key') && sig.includes('feature_id')) {
        atlasCount += count;
        console.log(`   ✅ ATLAS (${count} / ${percentage}%): ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
      } else if (sig.includes('file') && sig.includes('chunk')) {
        legacyCount += count;
        console.log(`   🗂️  LEGACY (${count} / ${percentage}%): ${keys.join(', ')}`);
      } else if (sig.includes('source_ref') || sig.includes('summary')) {
        partialCount += count;
        console.log(`   ⚠️  PARTIAL (${count} / ${percentage}%): ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
      } else {
        otherCount += count;
        console.log(`   ❓ OTHER (${count} / ${percentage}%): ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
      }

      // Show sample values
      const sample = samplesByShape.get(sig);
      if (sample && sample.payload) {
        const sampleKeys = Object.keys(sample.payload).slice(0, 2);
        const sampleVals = sampleKeys.map(k => {
          const v = sample.payload[k];
          const str = typeof v === 'string' ? `"${v.slice(0, 20)}"` : String(v).slice(0, 20);
          return `${k}:${str}`;
        }).join(', ');
        console.log(`      Sample: {${sampleVals}}`);
      }
    }

    // Summary
    console.log(`\n   📈 Summary (${pointsProcessed} sampled):`);
    console.log(`      Atlas payload:   ${atlasCount} (${((atlasCount/pointsProcessed)*100).toFixed(1)}%)`);
    console.log(`      Legacy payload:  ${legacyCount} (${((legacyCount/pointsProcessed)*100).toFixed(1)}%)`);
    console.log(`      Partial payload: ${partialCount} (${((partialCount/pointsProcessed)*100).toFixed(1)}%)`);
    console.log(`      Other/empty:     ${otherCount} (${((otherCount/pointsProcessed)*100).toFixed(1)}%)`);

    // Extrapolate to full collection
    if (pointsProcessed < pointCount) {
      console.log(`\n   📊 Extrapolated to ${pointCount} total points:`);
      console.log(`      Atlas:   ~${Math.round((atlasCount/pointsProcessed) * pointCount)}`);
      console.log(`      Legacy:  ~${Math.round((legacyCount/pointsProcessed) * pointCount)}`);
      console.log(`      Partial: ~${Math.round((partialCount/pointsProcessed) * pointCount)}`);
    }
  }
}

payloadCensus().catch(console.error);
