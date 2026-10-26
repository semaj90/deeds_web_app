-- Rollback-only canary for AST-NODES-V2-01. Run inside BEGIN ... ROLLBACK after the DRAFT; all rows are throwaway.
-- Run: { echo "BEGIN;"; cat sveltekit-frontend/drizzle/manual/20261017_atlas_ast_nodes_v2_DRAFT.sql scripts/atlas/sql/prove-atlas-ast-nodes-v2-canary-v1.sql; echo "ROLLBACK;"; } | docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db -v ON_ERROR_STOP=1
DO $$
DECLARE
  repo uuid := '00000000-0000-4000-8000-0000000000aa';
  rev1 text := 'sha256:' || repeat('a', 64);
  rev2 text := 'sha256:' || repeat('b', 64);
  id1 text := repeat('1', 64); id2 text := repeat('2', 64); id3 text := repeat('3', 64); id4 text := repeat('4', 64);
  v1_before bigint;
BEGIN
  SELECT count(*) INTO v1_before FROM public.atlas_ast_nodes;
  SET CONSTRAINTS ALL IMMEDIATE;

  -- 1. a whole-file node and a route node with exact spans are accepted
  INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
     node_kind, qualified_symbol, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end,
     parser_name, parser_version, parser_language, grammar_version)
  VALUES (id1, repo, 'ws', 'FRONTEND_ROOT', 'src/routes/api/x/+server.ts', rev1, 500, 'file', '+server.ts', 'k1', 'h1', 0, 500, 0, 480, 1, 30,
     'tree-sitter', '0.25', 'typescript', 'g1'),
    (id2, repo, 'ws', 'FRONTEND_ROOT', 'src/routes/api/x/+server.ts', rev1, 500, 'route', 'POST', 'k2', 'h2', 100, 400, 100, 380, 5, 25,
     'tree-sitter', '0.25', 'typescript', 'g1');
  RAISE NOTICE 'PASS 1 file + route nodes with exact spans accepted';

  -- 2. generated canonical repo path honours the namespace
  IF (SELECT canonical_repo_path FROM public.atlas_ast_nodes_v2 WHERE tree_node_id = id1) <> 'sveltekit-frontend/src/routes/api/x/+server.ts' THEN
    RAISE EXCEPTION 'CANARY_FAIL canonical_repo_path'; END IF;
  RAISE NOTICE 'PASS 2 canonical_repo_path generated from the explicit namespace';

  -- 3. NULL span rejected (the v1 route/file gap)
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', 'a.ts', rev1, 10, 'function', 'k3', 'h3', NULL, NULL, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL null span accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS 3 NULL span rejected'; END;

  -- 4. missing / non-sha256 source revision rejected
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', 'a.ts', 'git:0084288f26', 10, 'function', 'k3', 'h3', 0, 1, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL commit label accepted as revision';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 4 non-sha256 source_revision rejected'; END;

  -- 5. span past the end of the source, reversed span, bad namespace, traversal path, bad id, unknown kind
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', 'a.ts', rev1, 10, 'function', 'k3', 'h3', 0, 11, 0, 11, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL span past source accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5a span past end of source rejected'; END;
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', 'a.ts', rev1, 10, 'function', 'k3', 'h3', 5, 2, 5, 2, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL reversed span accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5b reversed span rejected'; END;
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'MONOREPO', 'a.ts', rev1, 10, 'function', 'k3', 'h3', 0, 1, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL unknown namespace accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5c unknown path namespace rejected'; END;
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', '../etc/x.ts', rev1, 10, 'function', 'k3', 'h3', 0, 1, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL traversal path accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5d traversal path rejected'; END;
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES ('abc', repo, 'ws', 'REPO_ROOT', 'a.ts', rev1, 10, 'function', 'k3', 'h3', 0, 1, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL malformed tree_node_id accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5e malformed tree_node_id rejected'; END;
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id3, repo, 'ws', 'REPO_ROOT', 'a.ts', rev1, 10, 'banana', 'k3', 'h3', 0, 1, 0, 1, 1, 1, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL unknown node_kind accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 5f unknown node_kind rejected'; END;

  -- 6. auth_guard is a first-class kind; the same symbol at the same span exists once per revision
  INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
     node_kind, qualified_symbol, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end,
     parent_tree_node_id, parser_name, parser_version, parser_language, grammar_version)
  VALUES (id3, repo, 'ws', 'FRONTEND_ROOT', 'src/routes/api/x/+server.ts', rev1, 500, 'auth_guard', 'requireAdmin', 'k4', 'h4', 120, 140, 120, 140, 6, 6,
     id2, 'tree-sitter', '0.25', 'typescript', 'g1');
  RAISE NOTICE 'PASS 6a auth_guard node accepted with a parent';
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, qualified_symbol, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (id4, repo, 'ws', 'FRONTEND_ROOT', 'src/routes/api/x/+server.ts', rev1, 500, 'route', 'POST', 'k5', 'h5', 100, 400, 100, 380, 5, 25, 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL duplicate natural key at the same revision accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 6b duplicate natural key at the same revision rejected'; END;
  INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
     node_kind, qualified_symbol, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
  VALUES (id4, repo, 'ws', 'FRONTEND_ROOT', 'src/routes/api/x/+server.ts', rev2, 520, 'route', 'POST', 'k5', 'h5', 100, 400, 100, 380, 5, 25, 'p', '1', 'typescript', 'g');
  RAISE NOTICE 'PASS 6c the same symbol and span at a NEW revision coexists';

  -- 7. missing parent rejected (constraints made immediate for the test)
  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2 (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision, source_byte_length,
       node_kind, structural_key, normalized_node_hash, start_byte, end_byte, start_utf16, end_utf16, line_start, line_end, parent_tree_node_id, parser_name, parser_version, parser_language, grammar_version)
    VALUES (repeat('5', 64), repo, 'ws', 'REPO_ROOT', 'b.ts', rev1, 10, 'function', 'k6', 'h6', 0, 1, 0, 1, 1, 1, repeat('9', 64), 'p', '1', 'typescript', 'g');
    RAISE EXCEPTION 'CANARY_FAIL dangling parent accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 7 dangling parent rejected'; END;

  -- 8. immutability: updates and deletes blocked; supersession allowed once and is final
  BEGIN
    UPDATE public.atlas_ast_nodes_v2 SET qualified_symbol = 'tampered' WHERE tree_node_id = id2;
    RAISE EXCEPTION 'CANARY_FAIL immutable column updated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_AST_NODES_V2_IMMUTABLE%' THEN RAISE; END IF; RAISE NOTICE 'PASS 8a content update blocked'; END;
  BEGIN
    DELETE FROM public.atlas_ast_nodes_v2 WHERE tree_node_id = id2;
    RAISE EXCEPTION 'CANARY_FAIL delete accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_AST_NODES_V2_NO_DELETE%' THEN RAISE; END IF; RAISE NOTICE 'PASS 8b delete blocked'; END;
  BEGIN
    UPDATE public.atlas_ast_nodes_v2 SET superseded_by = id4 WHERE tree_node_id = id2;
    RAISE EXCEPTION 'CANARY_FAIL half supersession accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 8c superseded_by without superseded_at rejected'; END;
  UPDATE public.atlas_ast_nodes_v2 SET superseded_by = id4, superseded_at = now() WHERE tree_node_id = id2;
  RAISE NOTICE 'PASS 8d supersession accepted';
  BEGIN
    UPDATE public.atlas_ast_nodes_v2 SET superseded_by = id3, superseded_at = now() WHERE tree_node_id = id2;
    RAISE EXCEPTION 'CANARY_FAIL supersession changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_AST_NODES_V2_SUPERSESSION_IS_FINAL%' THEN RAISE; END IF; RAISE NOTICE 'PASS 8e supersession is final'; END;

  -- 9. the current view hides superseded rows; v1 is untouched
  IF (SELECT count(*) FROM public.atlas_ast_nodes_v2_current WHERE tree_node_id = id2) <> 0
     OR (SELECT count(*) FROM public.atlas_ast_nodes_v2_current WHERE tree_node_id = id1) <> 1 THEN
    RAISE EXCEPTION 'CANARY_FAIL current view'; END IF;
  RAISE NOTICE 'PASS 9a current view hides superseded rows';
  IF (SELECT count(*) FROM public.atlas_ast_nodes) <> v1_before THEN RAISE EXCEPTION 'CANARY_FAIL v1 changed'; END IF;
  RAISE NOTICE 'PASS 9b legacy atlas_ast_nodes untouched (% rows)', v1_before;
  RAISE NOTICE 'CANARY_ALL_PASS';
END
$$;
