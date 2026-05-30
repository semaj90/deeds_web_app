PRAGMA threads=4;

-- Adjust paths if your repo is in a different location
-- This SQL expects CSVs at .tmp/ingest/csv/nodes.csv and edges.csv

CREATE OR REPLACE TABLE nodes AS
-- Use the minimal nodes CSV (no payload) to avoid long single-line payloads
-- disable parallel scanner to allow null-padding with quoted fields
SELECT * FROM read_csv_auto('.tmp/ingest/csv/nodes_minimal.csv', HEADER=TRUE, DELIM=',', QUOTE='"', ESCAPE='"', NULL_PADDING=TRUE, PARALLEL=FALSE, MAX_LINE_SIZE=30000000);

CREATE OR REPLACE TABLE edges AS
SELECT * FROM read_csv_auto('.tmp/ingest/csv/edges.csv', HEADER=TRUE, DELIM=',', QUOTE='"', ESCAPE='"', NULL_PADDING=TRUE, PARALLEL=FALSE, MAX_LINE_SIZE=30000000);

CREATE OR REPLACE TABLE parent_atlas AS
SELECT
  n.id AS node_id,
  n.title,
  n.type,
  n.sourceRef,
  listagg(e.to, ',') AS neighbors
FROM nodes n
LEFT JOIN edges e ON n.id = e.from
GROUP BY n.id, n.title, n.type, n.sourceRef;

-- Export results to Parquet for downstream ingestion
COPY (SELECT * FROM parent_atlas) TO '.tmp/ingest/parent_atlas.parquet' (FORMAT PARQUET);

.quit
