#!/usr/bin/env node
/**
 * Targeted correction: re-derive `used_concepts` and/or `entities` ONLY for packets whose
 * current value still carries raw AST-symbol prefixes (fn:, var:, export:, class:, method:,
 * interface:, type:, enum:).
 *
 * Root cause (found live 2026-09-13): `lib/lexical-entity-derivation.mjs`'s `tokenizeIdentifier()`
 * only special-cased the `import:` prefix; every other kind of ast_symbols prefix survived
 * tokenization glued to the first word (`fn:determineRequestType` -> `fn:determine`, not
 * `determine`), and the `entities` derivation didn't strip prefixes at all. Both fixed at the
 * source in `lib/lexical-entity-derivation.mjs`; this script re-applies the fixed derivation to
 * only the rows already contaminated by the old bug, one column at a time.
 *
 * `entities` correction deliberately EXCLUDES packets already covered by the real spaCy NER pass
 * (scripts/atlas/extract-lexical-features.mjs, extractor_version='spacy-nlp-v1' in
 * feature_lexical_facts, ~6,886 prose-bearing packets) -- re-running this AST-derived heuristic
 * over those rows would regress real NER data back to a code-symbol-name heuristic. This script
 * only ever touches non-prose (code) packets for `entities`, which never had real NER in the
 * first place (spaCy NER doesn't apply to code text meaningfully).
 *
 * `lexical_features` is explicitly out of scope for both column modes -- it currently holds
 * filename-path-token data from a different writer for many rows; re-deriving it here risks the
 * same cross-writer confusion this whole audit thread has been finding and fixing.
 *
 * Usage:
 *   node scripts/atlas/fix-used-concepts-prefix-contamination.mjs --column=used_concepts --dry-run
 *   node scripts/atlas/fix-used-concepts-prefix-contamination.mjs --column=used_concepts --apply
 *   node scripts/atlas/fix-used-concepts-prefix-contamination.mjs --column=entities --dry-run
 *   node scripts/atlas/fix-used-concepts-prefix-contamination.mjs --column=entities --apply
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { deriveEntityLexicalFeatures } from './lib/lexical-entity-derivation.mjs';

const APPLY = process.argv.includes('--apply');
const COLUMN = process.argv.find((arg) => arg.startsWith('--column='))?.split('=')[1] ?? 'used_concepts';
if (!['used_concepts', 'entities'].includes(COLUMN)) {
  console.error(`Invalid --column=${COLUMN}; must be used_concepts or entities`);
  process.exit(1);
}

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

const PREFIX_PATTERN = '^(fn|var|export|method|class|interface|type|enum):';

async function main() {
  const client = await pool.connect();
  try {
    const excludeSpacyClause = COLUMN === 'entities'
      ? `AND NOT EXISTS (
           SELECT 1 FROM feature_lexical_facts flf
           WHERE flf.packet_key = apf.packet_key AND flf.extractor_version = 'spacy-nlp-v1'
         )`
      : '';

    const { rows } = await client.query(
      `
      SELECT DISTINCT apf.packet_key, apf.ast_symbols
      FROM atlas_packet_features apf, unnest(apf.${COLUMN}) AS c
      WHERE c ~ $1
        AND apf.ast_symbols IS NOT NULL AND array_length(apf.ast_symbols, 1) > 0
        ${excludeSpacyClause}
      `,
      [PREFIX_PATTERN],
    );

    console.log(JSON.stringify({ apply: APPLY, column: COLUMN, contaminatedPacketsFound: rows.length }, null, 2));

    if (rows.length === 0) return;

    let checked = 0;
    let stillContaminatedAfterFix = 0;
    let written = 0;
    for (const row of rows) {
      const derived = deriveEntityLexicalFeatures(row.ast_symbols);
      const newValue = COLUMN === 'entities' ? derived.entities : derived.usedConcepts;
      checked += 1;
      if (newValue.some((c) => new RegExp(PREFIX_PATTERN).test(c))) {
        stillContaminatedAfterFix += 1;
        continue; // shouldn't happen post-fix; skip rather than write something still wrong
      }
      if (APPLY) {
        const result = await client.query(
          `UPDATE atlas_packet_features SET ${COLUMN} = $1::text[], updated_at = NOW() WHERE packet_key = $2`,
          [newValue, row.packet_key],
        );
        written += result.rowCount;
      }
    }

    console.log(JSON.stringify({ status: APPLY ? 'applied' : 'dry-run', column: COLUMN, checked, written, stillContaminatedAfterFix }, null, 2));

    const verify = await client.query(
      `
      SELECT count(DISTINCT apf.packet_key) AS remaining_contaminated
      FROM atlas_packet_features apf, unnest(apf.${COLUMN}) AS c
      WHERE c ~ $1
        ${excludeSpacyClause}
      `,
      [PREFIX_PATTERN],
    );
    console.log(JSON.stringify({ remaining_contaminated_after_run: verify.rows[0].remaining_contaminated }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
