-- Extends chk_atlas_ast_nodes_kind (added in 20260716b_atlas_ast_nodes_alter.sql) to admit
-- non-code document-structure node kinds emitted by graphify-symbol-extractor-v1.mts's JSON
-- (json-symbol-extractor.mjs: 'field') and Markdown (markdown-symbol-extractor.mjs: 'heading')
-- routing (SOURCE-TEXT-ENCODING-01). These are structurally distinct from code AST kinds
-- ('module'/'function'/etc.) -- additive only, no existing rows or values removed.

DO $$ BEGIN
  ALTER TABLE atlas_ast_nodes DROP CONSTRAINT chk_atlas_ast_nodes_kind;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE atlas_ast_nodes ADD CONSTRAINT chk_atlas_ast_nodes_kind
    CHECK (node_kind IN ('file','module','class','interface','type','function','method',
                         'constructor','parameter','route','schema','test','call_site',
                         'import','export','heading','field'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
