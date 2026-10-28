-- Directory remediation rank (read-only, CPU, deterministic). Run from the repo root:
--   ATLAS_WIDE=<kv wide.parquet> duckdb -c ".read scripts/atlas/directory-remediation-rank-v1.sql"
-- Inputs : wide enrichment Parquet (python/atlas_directory_kv_enrichment_v1.py), docs/CODEBASE_DIRECTORY_MAP.md.
-- Outputs: ./.tmp/atlas/directory_remediation_rank.parquet and ./.tmp/atlas/directory_remediation_tickets.jsonl (fixed paths; COPY needs literals).
-- Tickets use the create_ticket shape of /api/admin/atlas/kanban-tickets (+ a sibling _proposal block); nothing is posted, no datastore is written.
-- The directory map is generated 2026-07-01 and covers fewer directories: its flags are STALE INPUT and are labelled as such.
-- Score is a fixed, auditable weighted sum; every term is a column. It is a proposal and carries no identity or retrieval vote.

CREATE OR REPLACE TEMP TABLE wide AS SELECT * FROM read_parquet(getenv('ATLAS_WIDE'));

CREATE OR REPLACE TEMP TABLE dirmap AS
WITH lines AS (
  SELECT unnest(string_split(content, chr(10))) AS line FROM read_text('docs/CODEBASE_DIRECTORY_MAP.md')
), cells AS (
  SELECT string_split(line, '|') AS c FROM lines WHERE line LIKE '| %' AND line LIKE '%`%/`%'
)
SELECT regexp_replace(trim(replace(c[3], '`', '')), '/$', '') AS map_dir,
       try_cast(replace(trim(c[4]), ',', '') AS INT) AS map_files,
       try_cast(trim(c[6]) AS INT) AS map_score,
       trim(c[7]) AS map_issues,
       trim(c[2]) AS map_tier
FROM cells WHERE len(c) >= 8;

CREATE OR REPLACE TEMP TABLE ranked AS
SELECT
  w.directory_path,
  w.file_count, w.bak_count, w.duplicate_content_files, w.svelte_count, w.ts_count, w.depth,
  w.evidence_digest,
  m.map_score, m.map_issues, m.map_tier,
  -- terms (fixed weights; cap each so no single term dominates)
  least(40, 100 - coalesce(m.map_score, 100)) AS t_map_debt,
  least(30, 10 * w.bak_count) AS t_bak,
  least(20, 5 * w.duplicate_content_files) AS t_dup,
  least(10, w.file_count / 10) AS t_size,
  (m.map_dir IS NOT NULL) AS map_matched,
  least(40, 100 - coalesce(m.map_score, 100)) + least(30, 10 * w.bak_count) + least(20, 5 * w.duplicate_content_files) + least(10, w.file_count / 10) AS score,
  CASE WHEN w.bak_count > 0 OR w.duplicate_content_files > 0 THEN 'CLEANUP' ELSE 'RECOMMEND' END AS lane
FROM wide w
LEFT JOIN dirmap m ON m.map_dir = regexp_replace(w.directory_path, '^sveltekit-frontend/src/?', '')
WHERE w.directory_path <> '';

COPY (SELECT *, row_number() OVER (ORDER BY score DESC, directory_path ASC) AS rank FROM ranked ORDER BY rank)
  TO '.tmp/atlas/directory_remediation_rank.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Dry-run tickets, create_ticket shape. validationCommand strings are proposals, not yet executed.
COPY (
  SELECT json_object(
    'action', 'create_ticket',
    'featureId', 'directory:' || directory_path,
    'featureLabel', directory_path,
    'summary', lane || ' score ' || score || ' (map_debt ' || t_map_debt || ', bak ' || t_bak || ', dup ' || t_dup || ', size ' || t_size || ')',
    'priority', CASE WHEN map_tier LIKE '%🔴%' THEN 'critical' WHEN score >= 40 THEN 'high' WHEN score >= 20 THEN 'medium' ELSE 'low' END,
    'sourceRefs', [directory_path],
    'acceptanceCriteria', [CASE WHEN lane = 'CLEANUP' THEN 'Archive (not delete) duplicate/.bak files under the directory' ELSE 'Clear the listed map issues for the directory' END],
    'validationCommand', CASE WHEN lane = 'CLEANUP' THEN 'git ls-files ' || directory_path || ' | rg "\.bak$"' ELSE 'cd sveltekit-frontend && npm run check' END,
    'permissionMode', 'proposal_only',
    'workspaceRevision', NULL, -- the wide input predates revision columns; a promoted ticket needs a real workspace revision
    '_proposal', json_object('status', 'PROPOSED', 'evidence_digest', evidence_digest, 'map_issues', map_issues,
                              'map_input', 'STALE_2026-07-01', 'map_matched', map_matched, 'canonicalAuthority', false, 'writesPerformed', false)
  ) AS ticket
  FROM ranked WHERE score > 0 QUALIFY row_number() OVER (ORDER BY score DESC, directory_path ASC) <= 50
  ORDER BY score DESC, directory_path ASC
) TO '.tmp/atlas/directory_remediation_tickets.jsonl' (FORMAT csv, HEADER false, QUOTE '', ESCAPE '', DELIMITER E'\x01');

SELECT lane, count(*) AS dirs, count(*) FILTER (WHERE map_matched) AS with_map, max(score) AS top FROM ranked GROUP BY lane ORDER BY lane;
