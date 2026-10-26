DO $$
DECLARE
  repo uuid := '00000000-0000-4000-8000-0000000000aa';
  workspace_rev text := 'sha256:' || repeat('a', 64);
  source_rev text := 'sha256:' || repeat('b', 64);
  other_source_rev text := 'sha256:' || repeat('c', 64);
  extraction_rev text := 'sha256:' || repeat('d', 64);
  span_hash text := 'sha256:' || repeat('e', 64);
  root_id text := repeat('1', 64);
  child_id text := repeat('2', 64);
  other_id text := repeat('3', 64);
  successor_id text := repeat('4', 64);
  v1_before bigint;
BEGIN
  SELECT count(*) INTO v1_before FROM public.atlas_ast_nodes;
  SET CONSTRAINTS ALL IMMEDIATE;

  INSERT INTO public.atlas_ast_nodes_v2
    (tree_node_id, repo_id, workspace_id, workspace_revision, path_namespace, relative_path,
     source_revision, source_byte_length, node_kind, qualified_symbol, occurrence, source_span_sha256,
     extraction_contract_revision, start_byte, end_byte, start_utf16, end_utf16,
     line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
  VALUES
    (root_id, repo, 'ws', workspace_rev, 'FRONTEND_ROOT', 'src/example.ts', source_rev, 100,
     'file', 'example.ts', 0, span_hash, extraction_rev, 0, 100, 0, 100, 1, 8,
     'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9'),
    (child_id, repo, 'ws', workspace_rev, 'FRONTEND_ROOT', 'src/example.ts', source_rev, 100,
     'function', 'run', 0, span_hash, extraction_rev, 10, 40, 10, 40, 2, 4,
     'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');
  RAISE NOTICE 'PASS: qualified root and child accepted';

  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2
      (tree_node_id, repo_id, workspace_id, path_namespace, relative_path, source_revision,
       source_byte_length, node_kind, occurrence, source_span_sha256,
       extraction_contract_revision, start_byte, end_byte, start_utf16, end_utf16, line_start,
       line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (other_id, repo, 'ws', 'REPO_ROOT', 'missing-workspace.ts', source_rev, 10,
      'function', 0, span_hash, extraction_rev, 0, 1, 0, 1, 1, 1,
      'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');
    RAISE EXCEPTION 'CANARY_FAIL null workspace revision accepted';
  EXCEPTION WHEN not_null_violation THEN RAISE NOTICE 'PASS: NULL workspace revision rejected'; END;

  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2
      (tree_node_id, repo_id, workspace_id, workspace_revision, path_namespace, relative_path,
       source_revision, source_byte_length, node_kind, occurrence, source_span_sha256,
       extraction_contract_revision, start_byte, end_byte, start_utf16,
       end_utf16, line_start, line_end, parent_tree_node_id, parser_name, parser_version,
       parser_language, grammar_version)
    VALUES (other_id, repo, 'ws', workspace_rev, 'FRONTEND_ROOT', 'src/example.ts', other_source_rev,
      100, 'function', 0, span_hash, extraction_rev, 10, 40, 10, 40,
      2, 4, root_id, 'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');
    RAISE EXCEPTION 'CANARY_FAIL parent from another source revision accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross-source-revision parent rejected'; END;

  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2
      (tree_node_id, repo_id, workspace_id, workspace_revision, path_namespace, relative_path,
       source_revision, source_byte_length, node_kind, qualified_symbol, occurrence, source_span_sha256,
       extraction_contract_revision, start_byte, end_byte, start_utf16, end_utf16,
       line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES (other_id, repo, 'ws', workspace_rev, 'FRONTEND_ROOT', 'src/example.ts', source_rev, 100,
      'function', 'run', 0, span_hash, extraction_rev, 10, 40, 10, 40, 2, 4,
      'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');
    RAISE EXCEPTION 'CANARY_FAIL duplicate observation accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate observation rejected'; END;

  BEGIN
    INSERT INTO public.atlas_ast_nodes_v2
      (tree_node_id, repo_id, workspace_id, workspace_revision, path_namespace, relative_path,
       source_revision, source_byte_length, node_kind, occurrence, source_span_sha256,
       extraction_contract_revision, start_byte, end_byte, start_utf16, end_utf16, line_start,
       line_end, parser_name, parser_version, parser_language, grammar_version)
    VALUES ('tn_v1_0123456789abcdef0123456789abcdef', repo, 'ws', workspace_rev, 'REPO_ROOT', 'legacy.ts',
      source_rev, 10, 'function', 0, span_hash, extraction_rev, 0, 1, 0, 1, 1, 1,
      'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');
    RAISE EXCEPTION 'CANARY_FAIL legacy V1 ID accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: legacy V1 ID rejected'; END;

  INSERT INTO public.atlas_ast_nodes_v2
    (tree_node_id, repo_id, workspace_id, workspace_revision, path_namespace, relative_path,
     source_revision, source_byte_length, node_kind, qualified_symbol, occurrence, source_span_sha256,
     extraction_contract_revision, start_byte, end_byte, start_utf16, end_utf16,
     line_start, line_end, parser_name, parser_version, parser_language, grammar_version)
  VALUES (successor_id, repo, 'ws', workspace_rev, 'FRONTEND_ROOT', 'src/example.ts', other_source_rev,
    100, 'function', 'run', 0, span_hash, extraction_rev, 10, 45, 10, 45,
    2, 4, 'typescript-language-server', '5.3.0', 'typescript', 'typescript-5.9');

  BEGIN
    UPDATE public.atlas_ast_nodes_v2 SET qualified_symbol = 'tampered' WHERE tree_node_id = child_id;
    RAISE EXCEPTION 'CANARY_FAIL immutable update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_AST_NODES_V2_IMMUTABLE%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: immutable content update rejected';
  END;

  UPDATE public.atlas_ast_nodes_v2 SET superseded_by = successor_id, superseded_at = now()
    WHERE tree_node_id = child_id;
  IF EXISTS (SELECT 1 FROM public.atlas_ast_nodes_v2_current WHERE tree_node_id = child_id) THEN
    RAISE EXCEPTION 'CANARY_FAIL current view retained superseded node';
  END IF;
  IF (SELECT count(*) FROM public.atlas_ast_nodes) <> v1_before THEN
    RAISE EXCEPTION 'CANARY_FAIL legacy table changed';
  END IF;
  RAISE NOTICE 'AST_NODES_V2_CONTRACT_CANARY_ALL_PASS';
END
$$;
