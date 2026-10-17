-- DRAFT ONLY -- DO NOT APPLY.  AST-NODES-V2-01 (openspec: parent-atlas-ontology-kernel).
-- Not validated against a live server. Needs migration-owner review, then a rollback-only canary:
--   BEGIN; <this file>; <scripts/atlas/sql/prove-atlas-ast-nodes-v2-canary-v1.sql>; ROLLBACK;
--
-- Why a NEW table instead of altering atlas_ast_nodes (523,271 rows, PK tree_node_id, kept as the legacy owner):
--   * v1 allows NULL spans/revisions (route+file nodes: 238 files / 260 route nodes have none), and its
--     unique key (repo_id, relative_path, node_kind, qualified_symbol, normalized_node_hash) is NOT revision-scoped.
--   * v1 mixes path namespaces (206,706 rows `sveltekit-frontend/...`, 7,615 `src/...`, rest repo-root).
--   * v1 has no `auth_guard` kind, so a route's auth requirement cannot be a participant.
--   Tightening v1 in place would fail on existing rows; v2 enforces the contract for NEW, revision-qualified rows only.
-- v1 is untouched. Backfill/dual-write is a separate, separately-authorized step (nothing here writes data).
-- Rows are immutable evidence: only superseded_by/superseded_at may change; DELETE is blocked (archive, never delete).

CREATE TABLE IF NOT EXISTS public.atlas_ast_nodes_v2 (
  tree_node_id text PRIMARY KEY
    CHECK (tree_node_id ~ '^([0-9a-f]{64}|tn_v1_[0-9a-f]{32})$'),
  v1_tree_node_id text,                       -- provenance only; v1 identity is never reused as v2 identity
  repo_id uuid NOT NULL,
  workspace_id text NOT NULL,
  workspace_revision text CHECK (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[0-9a-f]{64}$'),
  -- explicit path namespace; no fuzzy path matching. relative_path is relative to the namespace root.
  path_namespace text NOT NULL CHECK (path_namespace IN ('REPO_ROOT', 'FRONTEND_ROOT')),
  relative_path text NOT NULL CHECK (relative_path <> '' AND relative_path !~ '^/' AND relative_path !~ '\.\.'),
  canonical_repo_path text GENERATED ALWAYS AS (
    CASE path_namespace WHEN 'FRONTEND_ROOT' THEN 'sveltekit-frontend/' || relative_path ELSE relative_path END
  ) STORED,
  -- whole-source digest of the exact bytes the parser consumed
  source_revision text NOT NULL CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  source_byte_length bigint NOT NULL CHECK (source_byte_length >= 0),
  node_kind text NOT NULL CHECK (node_kind IN (
    'file', 'module', 'class', 'interface', 'type', 'function', 'method', 'constructor', 'parameter',
    'route', 'schema', 'auth_guard', 'test', 'call_site', 'import', 'export', 'heading', 'field'
  )),
  qualified_symbol text NOT NULL DEFAULT '',
  structural_key text NOT NULL,
  normalized_node_hash text NOT NULL,         -- node-grain hash; NOT a source revision (see audit-ast-hash-grain-classification)
  normalized_signature text NOT NULL DEFAULT '',
  -- exact coordinates: UTF-8 bytes are authoritative; UTF-16 code units are for JS/Svelte consumers
  offset_encoding text NOT NULL DEFAULT 'utf-8' CHECK (offset_encoding = 'utf-8'),
  start_byte bigint NOT NULL CHECK (start_byte >= 0),
  end_byte bigint NOT NULL,
  start_utf16 integer NOT NULL CHECK (start_utf16 >= 0),
  end_utf16 integer NOT NULL,
  line_start integer NOT NULL CHECK (line_start >= 1),
  line_end integer NOT NULL,
  parent_tree_node_id text,
  packet_key text,                            -- exact join key to atlas_packets; NULL = unresolved diagnostic, never guessed
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  parser_language text NOT NULL,
  grammar_version text NOT NULL,
  superseded_by text,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_ast_nodes_v2_span_order CHECK (end_byte >= start_byte AND end_utf16 >= start_utf16 AND line_end >= line_start),
  CONSTRAINT atlas_ast_nodes_v2_span_in_source CHECK (end_byte <= source_byte_length),
  CONSTRAINT atlas_ast_nodes_v2_not_self_parent CHECK (parent_tree_node_id IS NULL OR parent_tree_node_id <> tree_node_id),
  CONSTRAINT atlas_ast_nodes_v2_supersede_pair CHECK ((superseded_by IS NULL) = (superseded_at IS NULL)),
  CONSTRAINT atlas_ast_nodes_v2_parent_fkey FOREIGN KEY (parent_tree_node_id)
    REFERENCES public.atlas_ast_nodes_v2 (tree_node_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT atlas_ast_nodes_v2_superseded_by_fkey FOREIGN KEY (superseded_by)
    REFERENCES public.atlas_ast_nodes_v2 (tree_node_id) DEFERRABLE INITIALLY DEFERRED
);

-- Revision-scoped natural key: the same symbol at the same span can exist once per source revision.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_ast_nodes_v2_natural_uidx
  ON public.atlas_ast_nodes_v2 (repo_id, path_namespace, relative_path, source_revision, node_kind, qualified_symbol, start_byte, end_byte);
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_file_rev_idx
  ON public.atlas_ast_nodes_v2 (repo_id, path_namespace, relative_path, source_revision);
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_canonical_path_idx ON public.atlas_ast_nodes_v2 (canonical_repo_path);
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_symbol_idx ON public.atlas_ast_nodes_v2 (node_kind, qualified_symbol) WHERE qualified_symbol <> '';
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_parent_idx ON public.atlas_ast_nodes_v2 (parent_tree_node_id) WHERE parent_tree_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_packet_idx ON public.atlas_ast_nodes_v2 (packet_key) WHERE packet_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_ast_nodes_v2_revision_idx ON public.atlas_ast_nodes_v2 (source_revision);

-- Immutability: only supersession may change; deletes are blocked (archive, never delete).
CREATE OR REPLACE FUNCTION public.atlas_ast_nodes_v2_guard_v1()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ATLAS_AST_NODES_V2_NO_DELETE';
  END IF;
  -- canonical_repo_path is a STORED generated column: it is not yet computed in NEW during a BEFORE trigger,
  -- so it must be excluded or every update (including legitimate supersession) would look like a content change.
  IF (to_jsonb(NEW) - 'superseded_by' - 'superseded_at' - 'canonical_repo_path')
     IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by' - 'superseded_at' - 'canonical_repo_path') THEN
    RAISE EXCEPTION 'ATLAS_AST_NODES_V2_IMMUTABLE: only superseded_by/superseded_at may change';
  END IF;
  IF OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN
    RAISE EXCEPTION 'ATLAS_AST_NODES_V2_SUPERSESSION_IS_FINAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atlas_ast_nodes_v2_guard_v1 ON public.atlas_ast_nodes_v2;
CREATE TRIGGER atlas_ast_nodes_v2_guard_v1
  BEFORE UPDATE OR DELETE ON public.atlas_ast_nodes_v2
  FOR EACH ROW EXECUTE FUNCTION public.atlas_ast_nodes_v2_guard_v1();

-- Current (non-superseded) nodes; consumers read this, never the raw table.
CREATE OR REPLACE VIEW public.atlas_ast_nodes_v2_current AS
  SELECT * FROM public.atlas_ast_nodes_v2 WHERE superseded_by IS NULL;

-- Rollback (new objects only; v1 and all existing data untouched):
--   DROP VIEW IF EXISTS public.atlas_ast_nodes_v2_current;
--   DROP TABLE IF EXISTS public.atlas_ast_nodes_v2;
--   DROP FUNCTION IF EXISTS public.atlas_ast_nodes_v2_guard_v1();
