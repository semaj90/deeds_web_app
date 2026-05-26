INSERT INTO llm_context_cache (cache_key, model_name, model_quant, backend, tokenizer_hash, system_prompt_hash, tool_definitions_hash, context_pack_json, summary, chunk_ids, graph_paths)
VALUES ('ace:context:smoke-context-pack:v1','test','n/a','ace-context-pack','n/a','n/a','n/a', '{"id":"smoke-context-pack","authority":{"score":0.42,"source":"gpu"}}'::jsonb, 'smoke pack', '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (cache_key) DO UPDATE SET context_pack_json = EXCLUDED.context_pack_json, last_used_at = now();
