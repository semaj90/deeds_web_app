-- Gate A: Stage 1 (AST Coverage)
SELECT 
  (SELECT COUNT(*) FROM atlas_packet_features WHERE ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0) as stage1_ast_extracted,
  
  -- Gate B: Stage 5 (Autoencoder Compression)
  (SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL) as stage5_latent_compressed,
  
  -- Gate E: End-to-End Validation
  (SELECT COUNT(*) FROM atlas_packets) as total_packets,
  (SELECT COUNT(*) FROM atlas_packets WHERE embedding IS NOT NULL) as embedded_packets,
  (SELECT ROUND(100.0 * COUNT(*) FILTER(WHERE embedding IS NOT NULL) / COUNT(*), 1) FROM atlas_packets) as embedding_coverage_pct,
  
  -- Qdrant mirror status
  (SELECT 'codebase_chunks_768' as qdrant_collection) as qdrant_status
;
