-- Atlas AST Nodes + Structured Source Refs + Ontology Concepts
-- Migration: 20260716_atlas_ast_and_source_ref.sql
-- Apply: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/20260716_atlas_ast_and_source_ref.sql

BEGIN;

-- ── 1. atlas_source_refs: structured source reference objects ─────────────────
-- Replaces flat source_ref strings with a validated structured contract.
-- The sourceRefKey column corresponds to the existing source_ref string format.

CREATE TABLE IF NOT EXISTS atlas_source_refs (
  -- identity
  source_ref_key          text        NOT NULL,          -- "path/file.ts#Symbol"
  repo_id                 text        NOT NULL DEFAULT 'deeds-web-app',
  source_type             text        NOT NULL DEFAULT 'code'
                          CHECK (source_type IN ('code','legal','documentation','git','video','transcript','web')),
  relative_path           text,                           -- "src/lib/server/auth.ts"
  content_hash            text        NOT NULL,           -- sha256 of span content
  -- symbol
  qualified_symbol        text,                           -- "ClassName.methodName"
  symbol_kind             text
                          CHECK (symbol_kind IN
                            ('file','module','class','interface','type','function','method',
                             'constructor','parameter','route','schema','test','call_site',
                             'import','export') OR symbol_kind IS NULL),
  -- span (versioned metadata — NOT identity)
  start_byte              bigint,
  end_byte                bigint,
  start_line              integer,
  start_column            integer,
  end_line                integer,
  end_column              integer,
  -- hierarchy
  parent_source_ref_key   text,                           -- FK → self
  -- fragments (compact JSONB array)
  fragments               jsonb        NOT NULL DEFAULT '[]',
  -- parser
  parser_name             text,
  parser_version          text,
  -- versioning
  commit_sha              text,
  corpus_version          text,
  effective_from          timestamptz,
  effective_to            timestamptz,
  -- meta
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (source_ref_key, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_source_refs_repo_path
  ON atlas_source_refs (repo_id, relative_path);

CREATE INDEX IF NOT EXISTS idx_atlas_source_refs_symbol_kind
  ON atlas_source_refs (symbol_kind) WHERE symbol_kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_source_refs_parent
  ON atlas_source_refs (parent_source_ref_key) WHERE parent_source_ref_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_source_refs_content_hash
  ON atlas_source_refs (content_hash);

-- Self-referential FK (deferred to allow batch inserts before parent exists)
ALTER TABLE atlas_source_refs
  ADD CONSTRAINT fk_atlas_source_refs_parent
  FOREIGN KEY (parent_source_ref_key, repo_id)
  REFERENCES atlas_source_refs (source_ref_key, repo_id)
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

-- ── 2. atlas_ast_nodes: structural AST identity nodes ────────────────────────
-- Distinct from atlas_tree_nodes (hierarchy ledger).
-- tree_node_id = sha256(repo+path+language+kind+symbol+parent_key+signature)

CREATE TABLE IF NOT EXISTS atlas_ast_nodes (
  -- stable identity
  tree_node_id            text        PRIMARY KEY,        -- sha256 hex 64 chars
  structural_key          text        NOT NULL UNIQUE,    -- human-readable identity string
  repo_id                 text        NOT NULL DEFAULT 'deeds-web-app',
  relative_path           text        NOT NULL,
  node_kind               text        NOT NULL
                          CHECK (node_kind IN
                            ('file','module','class','interface','type','function','method',
                             'constructor','parameter','route','schema','test','call_site',
                             'import','export')),
  qualified_symbol        text        NOT NULL DEFAULT '',
  parser_language         text        NOT NULL DEFAULT 'typescript',
  -- normalized signature for overload disambiguation (types only, no param names)
  normalized_signature    text        NOT NULL DEFAULT '',
  -- parent link
  parent_tree_node_id     text        REFERENCES atlas_ast_nodes (tree_node_id) DEFERRABLE INITIALLY DEFERRED,
  -- versioned span metadata (NOT part of identity)
  start_byte              bigint,
  end_byte                bigint,
  line_start              integer     NOT NULL DEFAULT 0,
  line_end                integer     NOT NULL DEFAULT 0,
  -- version hashes
  normalized_node_hash    text        NOT NULL,           -- sha256 of normalized AST subtree JSON
  source_content_hash     text        NOT NULL,           -- sha256 of raw span bytes
  -- parser
  parser_name             text        NOT NULL DEFAULT 'tree-sitter',
  parser_version          text,
  -- supersession
  superseded_by           text        REFERENCES atlas_ast_nodes (tree_node_id),
  -- provenance
  source_ref_key          text,                           -- link to atlas_source_refs
  -- meta
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_relative_path
  ON atlas_ast_nodes (repo_id, relative_path);

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_kind
  ON atlas_ast_nodes (node_kind);

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_symbol
  ON atlas_ast_nodes (qualified_symbol) WHERE qualified_symbol != '';

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_parent
  ON atlas_ast_nodes (parent_tree_node_id) WHERE parent_tree_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_source_content_hash
  ON atlas_ast_nodes (source_content_hash);

-- ── 3. atlas_ontology_concepts: typed concept registry ───────────────────────
-- Stores canonical concepts with typed relations — not just synonym aliases.
-- Replaces uncontrolled string concepts in feature envelopes.

CREATE TABLE IF NOT EXISTS atlas_ontology_concepts (
  concept_id              text        PRIMARY KEY,        -- "concept:retrieval.reranking"
  canonical_label         text        NOT NULL,
  concept_type            text        NOT NULL
                          CHECK (concept_type IN
                            ('concept','alias','instance','category','capability',
                             'operation','storage_system','protocol','artifact',
                             'domain','relationship')),
  description             text,
  aliases                 text[]      NOT NULL DEFAULT '{}',
  namespace               text        NOT NULL DEFAULT 'general',  -- e.g. 'retrieval', 'auth', 'data-transform'
  schema_version          integer     NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_concepts_type
  ON atlas_ontology_concepts (concept_type);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_concepts_namespace
  ON atlas_ontology_concepts (namespace);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_concepts_aliases
  ON atlas_ontology_concepts USING gin(aliases);

-- ── 4. atlas_ontology_relations: typed relations between concepts ─────────────
-- Distinct relation types: alias, taxonomy, semantic relationship.

CREATE TABLE IF NOT EXISTS atlas_ontology_relations (
  relation_id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_concept_id      text        NOT NULL REFERENCES atlas_ontology_concepts (concept_id),
  predicate               text        NOT NULL
                          CHECK (predicate IN
                            ('IS_A','INSTANCE_OF','ALIAS_OF','IMPLEMENTS','USES_SYSTEM',
                             'CALLS','FOLLOWS','IMPROVES','DEPENDS_ON','PART_OF',
                             'PRODUCES','CONSUMES','STORES_IN','READS_FROM')),
  object_concept_id       text        NOT NULL REFERENCES atlas_ontology_concepts (concept_id),
  evidence                text,                           -- "symbol-and-call", "doc-annotation", etc.
  confidence              real        NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  extractor_version       text        NOT NULL DEFAULT 'manual-v1',
  created_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (subject_concept_id, predicate, object_concept_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_relations_subject
  ON atlas_ontology_relations (subject_concept_id);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_relations_object
  ON atlas_ontology_relations (object_concept_id);

-- ── 5. Seed: register schemas in atlas_schema_registry ───────────────────────

INSERT INTO atlas_schema_registry (schema_id, schema_version, schema_kind, status, okf_source, json_schema, schema_hash, activated_at)
VALUES
  ('atlas.source-ref', 1, 'source_ref_contract', 'ACTIVE',
   'schemas/atlas/source-ref/atlas-source-ref.v1.okf',
   '{}',
   md5('atlas-source-ref-v1-' || now()::text),
   now()),
  ('atlas.ast-node', 1, 'ast_node_contract', 'ACTIVE',
   'schemas/atlas/ast-nodes/atlas-ast-node.v1.okf',
   '{}',
   md5('atlas-ast-node-v1-' || now()::text),
   now()),
  ('atlas.ontology-concept', 1, 'ontology_concept_contract', 'ACTIVE',
   'schemas/atlas/ontology/atlas-ontology-concept.v1.okf',
   '{}',
   md5('atlas-ontology-concept-v1-' || now()::text),
   now())
ON CONFLICT (schema_id, schema_version) DO NOTHING;

COMMIT;
