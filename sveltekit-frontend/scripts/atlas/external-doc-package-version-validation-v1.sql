-- Read-only package-version validation over atlas_external_doc_pages.
-- Classifies each product's version qualifier so a snapshot label is never read as a real release.
-- Run inside a read-only transaction:
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db -v ON_ERROR_STOP=1 < <this file>
BEGIN READ ONLY;

WITH classified AS (
  SELECT
    provider,
    product,
    COALESCE(product_version, '<null>') AS product_version,
    CASE
      WHEN product_version IS NULL THEN 'NO_VERSION'
      WHEN product_version LIKE 'CURRENT_UPSTREAM@%' THEN 'SNAPSHOT_LABEL_NOT_A_RELEASE'
      WHEN product_version LIKE 'UNVERSIONED@%' THEN 'UNVERSIONED'
      WHEN product_version ~ '^[0-9]+([.][0-9]+)*$' THEN 'CONCRETE_VERSION'
      ELSE 'UNRECOGNISED'
    END AS version_status,
    count(*) AS pages
  FROM atlas_external_doc_pages
  GROUP BY 1, 2, 3, 4
)
SELECT provider, product, product_version, version_status, pages
FROM classified
ORDER BY version_status, provider, product;

COMMIT;
