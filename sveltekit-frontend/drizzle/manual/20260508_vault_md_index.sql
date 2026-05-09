-- vault_md_index: unified index of every markdown surface in the project.
--
-- Sources merged into one queryable store:
--   • docs/obsidian-vault/Files/*.md       (3504 per-file docs, frontmatter joins source path → cluster → embedding_id)
--   • docs/obsidian-vault/Clusters/*.md    (100 cluster dossiers)
--   • docs/obsidian-vault/Indexes/*.md     (Top-PageRank, High-Risk, etc.)
--   • docs/obsidian-vault/index.md         (root codebase map)
--   • src/**/AGENTS.md                     (274 directory governance docs)
--   • memory/**/*.md                       (105 run reports, atlas, KAG notes)
--
-- Closes the wiring gap: vault md is currently generated FROM codebase-graph.json
-- and consumed by Obsidian only. This table makes it queryable from the agent
-- and joinable to agent_context_files / hypergraph_edges / qdrant_cluster_members.

CREATE TABLE IF NOT EXISTS vault_md_index (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vault_path      TEXT         NOT NULL,                  -- relative path of the md file itself
  md_kind         TEXT         NOT NULL,                  -- 'file' | 'cluster' | 'agents_md' | 'index' | 'memory' | 'cluster_index'
  source_path     TEXT,                                   -- what this md documents (e.g. src/lib/foo.ts) — null for index/memory kinds
  cluster_id      INTEGER,                                -- gpu:N cluster id when joinable
  embedding_id    TEXT,                                   -- qdrant://codebase_chunks_768/<path> when present in frontmatter
  agents_md_key   TEXT,                                   -- agents:<dir>/AGENTS.md scope key when md_kind='agents_md'
  title           TEXT,
  summary         TEXT,
  frontmatter     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  links_out       TEXT[]       NOT NULL DEFAULT '{}',     -- parsed [[wiki-links]] from body
  body_hash       TEXT         NOT NULL,                  -- sha256 of body — idempotent re-ingest
  body_size       INTEGER      NOT NULL DEFAULT 0,
  last_indexed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT vault_md_index_path_uq UNIQUE (vault_path)
);

CREATE INDEX IF NOT EXISTS vault_md_index_kind_idx        ON vault_md_index(md_kind);
CREATE INDEX IF NOT EXISTS vault_md_index_source_idx      ON vault_md_index(source_path);
CREATE INDEX IF NOT EXISTS vault_md_index_cluster_idx     ON vault_md_index(cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vault_md_index_agents_idx      ON vault_md_index(agents_md_key) WHERE agents_md_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS vault_md_index_embed_idx       ON vault_md_index(embedding_id) WHERE embedding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vault_md_index_frontmatter_gin ON vault_md_index USING gin(frontmatter);
CREATE INDEX IF NOT EXISTS vault_md_index_links_gin       ON vault_md_index USING gin(links_out);

-- Cross-store join view: vault md → source file → AGENTS.md scope → cluster centroid
CREATE OR REPLACE VIEW vault_md_join AS
SELECT v.id              AS vault_md_id,
       v.vault_path,
       v.md_kind,
       v.source_path,
       v.cluster_id,
       v.embedding_id,
       a.id              AS agents_md_id,
       a.file_path       AS agents_md_path,
       he.id             AS cluster_edge_id,
       he.label          AS cluster_label,
       he.grade_label    AS cluster_grade
  FROM vault_md_index v
  LEFT JOIN agent_context_files a ON a.file_path = v.agents_md_key
  LEFT JOIN hypergraph_edges    he ON he.edge_type = 'cluster_context'
                                  AND he.gpu_cluster = v.cluster_id;
