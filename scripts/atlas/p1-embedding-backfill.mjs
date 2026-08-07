    const final = finalResult.rows[0];
    const improvement = final.canonical_768 - baseline.canonical_768;
    const improvementPct = final.coverage_pct - baseline.coverage_pct;

    console.log('Final Coverage (Canonical 768-dim):');
    console.log('  Total chunks: ' + final.total);
    console.log('  Canonical 768-dim: ' + final.canonical_768 + ' (' + final.coverage_pct + '%)');
    console.log('  Dimension mismatch: ' + final.dimension_mismatch);
    console.log('  All with embedding (any dim): ' + final.all_with_embedding);
    console.log('  Improvement: +' + improvement + ' chunks (+' + improvementPct.toFixed(2) + '%)\\n');
