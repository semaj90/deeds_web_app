-- Alter existing atlas_ast_nodes to match v1 contract
-- Does NOT drop/recreate — only adds missing columns and indexes
-- Apply: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/20260716b_atlas_ast_nodes_alter.sql

BEGIN;

-- Add missing columns (all IF NOT EXISTS via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='parser_language') THEN
    ALTER TABLE atlas_ast_nodes ADD COLUMN parser_language text NOT NULL DEFAULT 'typescript';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='normalized_signature') THEN
    ALTER TABLE atlas_ast_nodes ADD COLUMN normalized_signature text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='parent_tree_node_id') THEN
    ALTER TABLE atlas_ast_nodes ADD COLUMN parent_tree_node_id text REFERENCES atlas_ast_nodes(tree_node_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='source_ref_key') THEN
    ALTER TABLE atlas_ast_nodes ADD COLUMN source_ref_key text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='updated_at') THEN
    ALTER TABLE atlas_ast_nodes ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Fix start_byte / end_byte to bigint if still integer
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='atlas_ast_nodes' AND column_name='start_byte') = 'integer' THEN
    ALTER TABLE atlas_ast_nodes ALTER COLUMN start_byte TYPE bigint;
    ALTER TABLE atlas_ast_nodes ALTER COLUMN end_byte TYPE bigint;
  END IF;
END $$;

-- Add qualified_symbol NOT NULL default (was nullable)
DO $$ BEGIN
  UPDATE atlas_ast_nodes SET qualified_symbol = '' WHERE qualified_symbol IS NULL;
  ALTER TABLE atlas_ast_nodes ALTER COLUMN qualified_symbol SET DEFAULT '';
  ALTER TABLE atlas_ast_nodes ALTER COLUMN qualified_symbol SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- already not null
END $$;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_parent
  ON atlas_ast_nodes (parent_tree_node_id) WHERE parent_tree_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_source_content_hash
  ON atlas_ast_nodes (source_content_hash);

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_language
  ON atlas_ast_nodes (parser_language);

-- Add node_kind CHECK constraint (lenient — skip if already exists)
DO $$ BEGIN
  ALTER TABLE atlas_ast_nodes ADD CONSTRAINT chk_atlas_ast_nodes_kind
    CHECK (node_kind IN ('file','module','class','interface','type','function','method',
                         'constructor','parameter','route','schema','test','call_site',
                         'import','export'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── atlas_source_refs (new table — only if it does not exist yet) ─────────────
CREATE TABLE IF NOT EXISTS atlas_source_refs (
  source_ref_key          text        NOT NULL,
  repo_id                 text        NOT NULL DEFAULT 'deeds-web-app',
  source_type             text        NOT NULL DEFAULT 'code'
                          CHECK (source_type IN ('code','legal','documentation','git','video','transcript','web')),
  relative_path           text,
  content_hash            text        NOT NULL,
  qualified_symbol        text,
  symbol_kind             text
                          CHECK (symbol_kind IN
                            ('file','module','class','interface','type','function','method',
                             'constructor','parameter','route','schema','test','call_site',
                             'import','export') OR symbol_kind IS NULL),
  start_byte              bigint,
  end_byte                bigint,
  start_line              integer,
  start_column            integer,
  end_line                integer,
  end_column              integer,
  parent_source_ref_key   text,
  fragments               jsonb        NOT NULL DEFAULT '[]',
  parser_name             text,
  parser_version          text,
  commit_sha              text,
  corpus_version          text,
  effective_from          timestamptz,
  effective_to            timestamptz,
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

-- ── atlas_ontology_concepts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_ontology_concepts (
  concept_id              text        PRIMARY KEY,
  canonical_label         text        NOT NULL,
  concept_type            text        NOT NULL
                          CHECK (concept_type IN
                            ('concept','alias','instance','category','capability',
                             'operation','storage_system','protocol','artifact',
                             'domain','relationship')),
  description             text,
  aliases                 text[]      NOT NULL DEFAULT '{}',
  namespace               text        NOT NULL DEFAULT 'general',
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

-- ── atlas_ontology_relations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_ontology_relations (
  relation_id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_concept_id      text        NOT NULL REFERENCES atlas_ontology_concepts (concept_id),
  predicate               text        NOT NULL
                          CHECK (predicate IN
                            ('IS_A','INSTANCE_OF','ALIAS_OF','IMPLEMENTS','USES_SYSTEM',
                             'CALLS','FOLLOWS','IMPROVES','DEPENDS_ON','PART_OF',
                             'PRODUCES','CONSUMES','STORES_IN','READS_FROM')),
  object_concept_id       text        NOT NULL REFERENCES atlas_ontology_concepts (concept_id),
  evidence                text,
  confidence              real        NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  extractor_version       text        NOT NULL DEFAULT 'manual-v1',
  created_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (subject_concept_id, predicate, object_concept_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_relations_subject
  ON atlas_ontology_relations (subject_concept_id);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_relations_object
  ON atlas_ontology_relations (object_concept_id);

-- ── Extend schema_kind CHECK constraint to include new contract kinds ─────────
ALTER TABLE atlas_schema_registry DROP CONSTRAINT IF EXISTS atlas_schema_registry_schema_kind_check;
ALTER TABLE atlas_schema_registry ADD CONSTRAINT atlas_schema_registry_schema_kind_check
  CHECK (schema_kind = ANY (ARRAY[
    'packet', 'feature_envelope', 'graph_fact', 'embedding_contract',
    'qdrant_projection', 'workflow_state',
    'source_ref_contract', 'ast_node_contract', 'ontology_concept_contract'
  ]));

-- ── Schema registry entries ───────────────────────────────────────────────────
INSERT INTO atlas_schema_registry (schema_id, schema_version, schema_kind, status, okf_source, json_schema, schema_hash, activated_at)
VALUES
  ('atlas.source-ref', 1, 'source_ref_contract', 'ACTIVE',
   'schemas/atlas/source-ref/atlas-source-ref.v1.okf', '{}',
   md5('atlas-source-ref-v1'), now()),
  ('atlas.ast-node', 1, 'ast_node_contract', 'ACTIVE',
   'schemas/atlas/ast-nodes/atlas-ast-node.v1.okf', '{}',
   md5('atlas-ast-node-v1'), now()),
  ('atlas.ontology-concept', 1, 'ontology_concept_contract', 'ACTIVE',
   'schemas/atlas/ontology/atlas-ontology-concept.v1.okf', '{}',
   md5('atlas-ontology-concept-v1'), now())
ON CONFLICT (schema_id, schema_version) DO NOTHING;

COMMIT;
