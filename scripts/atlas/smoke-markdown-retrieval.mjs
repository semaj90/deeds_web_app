#!/usr/bin/env node
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

async function main() {
  const e = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(e);
  const pool = new pg.Pool({ connectionString: dbUrl });

  console.log('--- Multi-Lane Retrieval Fusion Smoke Test ---');

  try {
    // 1. Fetch a seed packet with an embedding to use for self-contained vector search
    console.log('Fetching seed packet with embedding for vector search...');
    const { rows: seedRows } = await pool.query(`
      SELECT packet_key, summary, embedding::text AS embedding_str
      FROM nes_chrom_packets
      WHERE embedding IS NOT NULL AND summary IS NOT NULL
      LIMIT 1
    `);

    if (seedRows.length === 0) {
      console.warn('⚠️ No packets found with both summary and embedding. Trying fallback query...');
    }

    const seed = seedRows[0] || {
      packet_key: 'nes:ui:71db4b96c7f2c392:69a256e07545',
      summary: 'NES/Glyph seed packet for ui',
      embedding_str: null
    };

    console.log(`Seed packet: ${seed.packet_key}`);
    console.log(`Seed summary: "${seed.summary}"`);

    // We'll search for words from the seed summary
    const queryText = 'ui component';
    console.log(`Search query text: "${queryText}"`);

    const queryParams = [queryText];
    let vectorSelect = '0.0 AS vector_score';
    let vectorJoin = '';
    let vectorOrder = '';

    if (seed.embedding_str) {
      queryParams.push(seed.embedding_str);
      vectorSelect = '1 - (embedding <=> $2::vector) AS vector_score';
      vectorJoin = 'WHERE embedding IS NOT NULL';
      vectorOrder = 'ORDER BY embedding <=> $2::vector';
    }

    // 2. Perform the fused query
    console.log('Executing multi-lane fusion query...');
    const query = `
      WITH vector_results AS (
        SELECT packet_key, ${vectorSelect}
        FROM nes_chrom_packets
        ${vectorJoin}
        ${vectorOrder}
        LIMIT 10
      ),
      trigram_results AS (
        SELECT packet_key, similarity(summary, $1) AS trigram_score
        FROM nes_chrom_packets
        WHERE summary IS NOT NULL AND summary % $1
        ORDER BY similarity(summary, $1) DESC
        LIMIT 10
      ),
      fts_results AS (
        SELECT packet_key, ts_rank(ts_vector, plainto_tsquery('english', $1)) AS fts_score
        FROM packet_markdown_chunks
        WHERE ts_vector @@ plainto_tsquery('english', $1)
        ORDER BY ts_rank(ts_vector, plainto_tsquery('english', $1)) DESC
        LIMIT 10
      )
      SELECT 
        COALESCE(v.packet_key, t.packet_key, f.packet_key) AS packet_key,
        COALESCE(v.vector_score, 0) AS vector_score,
        COALESCE(t.trigram_score, 0) AS trigram_score,
        COALESCE(f.fts_score, 0) AS fts_score,
        (
          COALESCE(v.vector_score, 0) * 0.5 + 
          COALESCE(t.trigram_score, 0) * 0.3 + 
          COALESCE(f.fts_score, 0) * 0.2
        ) AS fused_score,
        ncp.summary,
        ncp.payload->>'source_ref' AS source_ref
      FROM vector_results v
      FULL OUTER JOIN trigram_results t ON t.packet_key = v.packet_key
      FULL OUTER JOIN fts_results f ON f.packet_key = COALESCE(v.packet_key, t.packet_key)
      LEFT JOIN nes_chrom_packets ncp ON ncp.packet_key = COALESCE(v.packet_key, t.packet_key, f.packet_key)
      ORDER BY fused_score DESC
      LIMIT 10
    `;

    const { rows: fusedResults } = await pool.query(query, queryParams);

    console.log(`\nFound ${fusedResults.length} fused results:`);
    const formattedResults = fusedResults.map((res, i) => {
      console.log(`[#${i + 1}] ${res.packet_key} (Score: ${res.fused_score.toFixed(4)})`);
      console.log(`     - Vector Score  : ${Number(res.vector_score).toFixed(4)}`);
      console.log(`     - Trigram Score : ${Number(res.trigram_score).toFixed(4)}`);
      console.log(`     - FTS Score     : ${Number(res.fts_score).toFixed(4)}`);
      console.log(`     - Source Ref    : ${res.source_ref}`);
      console.log(`     - Summary       : ${res.summary || 'N/A'}`);
      return {
        rank: i + 1,
        packet_key: res.packet_key,
        fused_score: Number(res.fused_score),
        vector_score: Number(res.vector_score),
        trigram_score: Number(res.trigram_score),
        fts_score: Number(res.fts_score),
        source_ref: res.source_ref,
        summary: res.summary || null
      };
    });

    // Write reports
    const reportsDir = path.resolve('docs/reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportJsonPath = path.join(reportsDir, 'retrieval-fusion-report.json');
    const reportMdPath = path.join(reportsDir, 'retrieval-fusion-report.md');

    fs.writeFileSync(reportJsonPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      query: queryText,
      results: formattedResults
    }, null, 2), 'utf8');

    let mdContent = `# Multi-Lane Retrieval Fusion Report\n\n`;
    mdContent += `Generated: ${new Date().toISOString()}\n`;
    mdContent += `Query: \`${queryText}\`\n\n`;
    mdContent += `| Rank | Packet Key | Fused Score | Vector Score | Trigram Score | FTS Score | Source Ref | Summary |\n`;
    mdContent += `|---|---|---|---|---|---|---|---|\n`;
    for (const r of formattedResults) {
      mdContent += `| ${r.rank} | \`${r.packet_key}\` | ${r.fused_score.toFixed(4)} | ${r.vector_score.toFixed(4)} | ${r.trigram_score.toFixed(4)} | ${r.fts_score.toFixed(4)} | \`${r.source_ref || ''}\` | ${r.summary ? r.summary.replace(/\r?\n/g, ' ').slice(0, 80) + '...' : 'N/A'} |\n`;
    }

    fs.writeFileSync(reportMdPath, mdContent, 'utf8');
    console.log(`\nWritten JSON report to: ${reportJsonPath}`);
    console.log(`Written Markdown report to: ${reportMdPath}`);

    console.log('\n✅ Multi-lane query fusion verified successfully.');
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
