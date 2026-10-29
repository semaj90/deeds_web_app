-- Directory remediation rank (read-only, CPU, deterministic). Run from the repo root:
--   ATLAS_WIDE=<kv wide.parquet> [ATLAS_MAP=<directory map .md>] [ATLAS_PR=<directory pagerank csv>] [ATLAS_INV=<inventory.parquet> ATLAS_WSB=<bindings csv: workspace_revision,canonical_source_ref,content_digest>] duckdb -c ".read scripts/atlas/directory-remediation-rank-v1.sql"
-- Inputs : wide enrichment Parquet (python/atlas_directory_kv_enrichment_v1.py), docs/CODEBASE_DIRECTORY_MAP.md.
-- PageRank (optional): CSV of directory_path,pr_max,pr_run_id,graph_revision,algorithm_revision from the latest graph_node_metrics run joined through atlas_packets.
--   Packet directories are frontend-relative (src/...); one EXPLICIT namespace rule maps them: 'sveltekit-frontend/' || directory_path when it starts with src/. No fuzzy matching.
-- Revision binding (optional, needs ATLAS_INV + ATLAS_WSB): a ticket carries workspaceRevision ONLY when every inventory file in the directory matches the admitted
--   binding by exact path + digest; otherwise it stays null and _proposal records exact/files counts. Never inferred from git.
-- AST alternative (optional, ATLAS_AST=<file_ast_summary.jsonl from scripts/atlas/file-ast-facts-v1.mjs>): per-file review signals replace the map debt in a SECOND score (score_ast / rank_ast);
--   the ticket selection still uses `score` so the two can be compared before anything switches.
-- Outputs: ./.tmp/atlas/directory_remediation_rank.parquet and ./.tmp/atlas/directory_remediation_tickets.jsonl (fixed paths; COPY needs literals).
-- Tickets use the create_ticket shape of /api/admin/atlas/kanban-tickets (+ a sibling _proposal block); nothing is posted, no datastore is written.
-- The map's own 'Generated:' date is carried into every ticket as map_input, so a stale map is visible, not assumed.
-- Score is a fixed, auditable weighted sum; every term is a column. It is a proposal and carries no identity or retrieval vote.

CREATE OR REPLACE TEMP TABLE wide AS SELECT * FROM read_parquet(getenv('ATLAS_WIDE'));

CREATE OR REPLACE TEMP TABLE dirmap AS
WITH src AS (
  SELECT content, regexp_extract(content, 'Generated: ([0-9-]+)', 1) AS generated FROM read_text(coalesce(nullif(getenv('ATLAS_MAP'), ''), 'docs/CODEBASE_DIRECTORY_MAP.md'))
), lines AS (
  SELECT unnest(string_split(content, chr(10))) AS line, generated FROM src
), cells AS (
  SELECT string_split(line, '|') AS c, generated FROM lines WHERE line LIKE '| %' AND line LIKE '%`%/`%'
)
SELECT regexp_replace(trim(replace(c[3], '`', '')), '/$', '') AS map_dir,
       try_cast(replace(trim(c[4]), ',', '') AS INT) AS map_files,
       try_cast(trim(c[6]) AS INT) AS map_score,
       trim(c[7]) AS map_issues,
       trim(c[2]) AS map_tier,
       generated AS map_generated
FROM cells WHERE len(c) >= 8;

CREATE OR REPLACE TEMP TABLE pr AS
SELECT 'sveltekit-frontend/' || directory_path AS repo_dir, pr_max, pr_run_id, graph_revision, algorithm_revision,
       percent_rank() OVER (ORDER BY pr_max) AS pr_pct
FROM read_csv(coalesce(nullif(getenv('ATLAS_PR'), ''), 'NO_PAGERANK_INPUT.csv'), ignore_errors = true)
WHERE directory_path = 'src' OR directory_path LIKE 'src/%';

CREATE OR REPLACE TEMP TABLE bind AS
SELECT regexp_replace(i.source_ref, '/[^/]*$', '') AS directory_path, count(*) AS bind_files,
       count(*) FILTER (WHERE replace(i.source_digest, 'sha256:', '') = replace(b.content_digest, 'sha256:', '')) AS bind_exact,
       any_value(b.workspace_revision) AS bind_revision
FROM read_parquet(coalesce(nullif(getenv('ATLAS_INV'), ''), 'NO_INVENTORY.parquet')) i
LEFT JOIN read_csv(coalesce(nullif(getenv('ATLAS_WSB'), ''), 'NO_BINDINGS.csv')) b ON b.canonical_source_ref = i.source_ref
GROUP BY 1;

CREATE OR REPLACE TEMP TABLE astd AS
SELECT regexp_replace(source_ref, '/[^/]*$', '') AS directory_path,
       sum(review_required_request_json) AS ast_review_required_request_json,
       sum(CASE WHEN NOT is_test THEN URL_LITERAL ELSE 0 END) AS ast_url_literals,
       sum(TODO_COMMENT) AS ast_todo_comments,
       sum(LEGACY_SVELTE_SYNTAX) AS ast_legacy_svelte_syntax,
       sum(PARSE_ERROR) AS ast_parse_errors
FROM read_json_auto(coalesce(nullif(getenv('ATLAS_AST'), ''), 'NO_AST.jsonl'), format = 'newline_delimited')
WHERE analysis_status = 'ANALYZED'
GROUP BY 1;

CREATE OR REPLACE TEMP TABLE ranked AS
SELECT
  w.directory_path,
  w.file_count, w.bak_count, w.duplicate_content_files, w.svelte_count, w.ts_count, w.depth,
  w.evidence_digest,
  m.map_score, m.map_issues, m.map_tier, m.map_generated,
  -- terms (fixed weights; cap each so no single term dominates)
  least(40, 100 - coalesce(m.map_score, 100)) AS t_map_debt,
  least(30, 10 * w.bak_count) AS t_bak,
  least(20, 5 * w.duplicate_content_files) AS t_dup,
  least(10, w.file_count / 10) AS t_size,
  (m.map_dir IS NOT NULL) AS map_matched,
  a.ast_review_required_request_json, a.ast_url_literals, a.ast_todo_comments, a.ast_legacy_svelte_syntax, a.ast_parse_errors,
  least(40, 15 * coalesce(a.ast_review_required_request_json, 0) + least(15, coalesce(a.ast_url_literals, 0)) + least(10, coalesce(a.ast_todo_comments, 0)) + least(10, 2 * coalesce(a.ast_legacy_svelte_syntax, 0))) AS t_ast_debt,
  bd.bind_files, bd.bind_exact, CASE WHEN bd.bind_files > 0 AND bd.bind_exact = bd.bind_files THEN bd.bind_revision END AS bound_revision,
  coalesce(round(20 * r.pr_pct, 1), 0) AS t_centrality,
  r.pr_run_id, r.graph_revision AS pr_graph_revision,
  least(40, 100 - coalesce(m.map_score, 100)) + least(30, 10 * w.bak_count) + least(20, 5 * w.duplicate_content_files) + least(10, w.file_count / 10) + coalesce(round(20 * r.pr_pct, 1), 0) AS score,
  CASE WHEN w.bak_count > 0 OR w.duplicate_content_files > 0 THEN 'CLEANUP' ELSE 'RECOMMEND' END AS lane
FROM wide w
LEFT JOIN dirmap m ON m.map_dir = regexp_replace(w.directory_path, '^sveltekit-frontend/src/?', '')
LEFT JOIN pr r ON r.repo_dir = w.directory_path
LEFT JOIN bind bd ON bd.directory_path = w.directory_path
LEFT JOIN astd a ON a.directory_path = w.directory_path
WHERE w.directory_path <> '';

COPY (SELECT *, t_ast_debt + t_bak + t_dup + t_size + t_centrality AS score_ast,
             row_number() OVER (ORDER BY t_ast_debt + t_bak + t_dup + t_size + t_centrality DESC, directory_path ASC) AS rank_ast,
             row_number() OVER (ORDER BY score DESC, directory_path ASC) AS rank FROM ranked ORDER BY rank)
  TO '.tmp/atlas/directory_remediation_rank.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Dry-run tickets, create_ticket shape. validationCommand strings are proposals, not yet executed.
COPY (
  SELECT json_object(
    'action', 'create_ticket',
    'featureId', 'directory:' || directory_path,
    'featureLabel', directory_path,
    'summary', lane || ' score ' || score || ' (map_debt ' || t_map_debt || ', bak ' || t_bak || ', dup ' || t_dup || ', size ' || t_size || ', centrality ' || t_centrality || ')',
    'priority', CASE WHEN map_tier LIKE '%🔴%' THEN 'critical' WHEN score >= 40 THEN 'high' WHEN score >= 20 THEN 'medium' ELSE 'low' END,
    'sourceRefs', [directory_path],
    'acceptanceCriteria', [CASE WHEN lane = 'CLEANUP' THEN 'Archive (not delete) duplicate/.bak files under the directory' ELSE 'Clear the listed map issues for the directory' END],
    'validationCommand', CASE WHEN lane = 'CLEANUP' THEN 'git ls-files ' || directory_path || ' | rg "\.bak$"' ELSE 'cd sveltekit-frontend && npm run check' END,
    'permissionMode', 'proposal_only',
    'workspaceRevision', bound_revision, -- set only when every file in the directory matches the admitted binding exactly
    '_proposal', json_object('status', 'PROPOSED', 'evidence_digest', evidence_digest, 'map_issues', map_issues,
                              'map_input', 'directory-map generated ' || coalesce(map_generated, 'UNMATCHED'), 'map_matched', map_matched, 'binding_files', bind_files, 'binding_exact', bind_exact, 'pagerank_run_id', pr_run_id, 'pagerank_graph_revision', pr_graph_revision, 'canonicalAuthority', false, 'writesPerformed', false)
  ) AS ticket
  FROM ranked WHERE score > 0 QUALIFY row_number() OVER (ORDER BY score DESC, directory_path ASC) <= 50
  ORDER BY score DESC, directory_path ASC
) TO '.tmp/atlas/directory_remediation_tickets.jsonl' (FORMAT csv, HEADER false, QUOTE '', ESCAPE '', DELIMITER E'\x01');

SELECT lane, count(*) AS dirs, count(*) FILTER (WHERE map_matched) AS with_map, max(score) AS top FROM ranked GROUP BY lane ORDER BY lane;
