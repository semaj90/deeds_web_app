-- .opencode/command/extract-top100-pagerank.sql
-- Force auto-discovery from the nested workspace path
CREATE TABLE IF NOT EXISTS codebase_nodes AS 
SELECT * FROM read_json_auto('sveltekit-frontend/docs/graph/codebase-graph.json');

-- Materialize the Top-100 Directory Attention Slice
COPY (
    SELECT 
        id,
        path,
        eigenvector_centrality AS structural_rank,
        md5(CONCAT(path, CAST(eigenvector_centrality AS VARCHAR))) AS artifact_hash,
        CURRENT_TIMESTAMP AS promotion_timestamp
    FROM codebase_nodes
    ORDER BY structural_rank DESC
    LIMIT 100
) TO 'sveltekit-frontend/docs/graph/codebase-pagerank-top100.json' (FORMAT JSON);