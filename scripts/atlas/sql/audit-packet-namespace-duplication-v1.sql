-- Packet path-namespace duplication gate (PACKET-NAMESPACE-AUDIT-01). Reads only; it creates session-TEMP tables inside
-- a transaction that is always rolled back (PostgreSQL refuses temp tables in READ ONLY transactions), so nothing persists.
-- Run (PostgreSQL 18 container; fails with a non-zero exit when a RATCHET is breached):
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db -v ON_ERROR_STOP=1 < scripts/atlas/sql/audit-packet-namespace-duplication-v1.sql
-- RATCHET = a count that must never grow past its recorded baseline (new duplicates fail the gate).
-- DEBT    = known existing problem with a target of 0; reported, not failing, until the crosswalk work is approved.
-- Baselines recorded 2026-10-17 on legal_ai_db (PG 18.4).
BEGIN;

CREATE TEMP TABLE gate_results (kind text, name text, actual bigint, baseline_or_target bigint, status text) ON COMMIT DROP;

-- 0. engine
INSERT INTO gate_results SELECT 'REQUIRE', 'postgres_major_version_is_18_or_newer', current_setting('server_version_num')::int / 10000, 18,
  CASE WHEN current_setting('server_version_num')::int >= 180000 THEN 'PASS' ELSE 'FAIL' END;

-- 1. identity basics (target 0, must hold)
INSERT INTO gate_results SELECT 'REQUIRE', 'packets_with_null_source_ref', count(*), 0, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM atlas_packets WHERE source_ref IS NULL;
INSERT INTO gate_results SELECT 'REQUIRE', 'duplicate_source_ref_values', count(*), 0, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM (SELECT source_ref FROM atlas_packets GROUP BY 1 HAVING count(*) > 1) t;
INSERT INTO gate_results SELECT 'REQUIRE', 'duplicate_packet_key_values', count(*), 0, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM (SELECT packet_key FROM atlas_packets GROUP BY 1 HAVING count(*) > 1) t;

-- 2. path-namespace pairs: the same file under 'sveltekit-frontend/<p>' and '<p>'
CREATE TEMP TABLE ns_pairs ON COMMIT DROP AS
  SELECT a.packet_key AS prefixed_key, b.packet_key AS plain_key, a.tree_node_id AS prefixed_tree, b.tree_node_id AS plain_tree
    FROM atlas_packets a JOIN atlas_packets b ON a.source_ref = 'sveltekit-frontend/' || b.source_ref;
INSERT INTO gate_results SELECT 'RATCHET', 'files_under_both_path_namespaces', count(*), 3117, CASE WHEN count(*) <= 3117 THEN 'PASS' ELSE 'FAIL' END FROM ns_pairs;
INSERT INTO gate_results SELECT 'RATCHET', 'namespace_pairs_with_differing_tree_node_id', count(*) FILTER (WHERE prefixed_tree IS DISTINCT FROM plain_tree), 3117,
  CASE WHEN count(*) FILTER (WHERE prefixed_tree IS DISTINCT FROM plain_tree) <= 3117 THEN 'PASS' ELSE 'FAIL' END FROM ns_pairs;
INSERT INTO gate_results SELECT 'DEBT', 'namespace_pairs_not_covered_by_alias', count(*), 0, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'DEBT' END
  FROM ns_pairs p WHERE NOT EXISTS (SELECT 1 FROM atlas_packet_identity_aliases x
    WHERE (x.alias_key = p.prefixed_key AND x.canonical_packet_key = p.plain_key) OR (x.alias_key = p.plain_key AND x.canonical_packet_key = p.prefixed_key));

-- 3. canonical_source_ref is lowercased and prefix-stripped: it must not be used as an identity/join key
INSERT INTO gate_results SELECT 'RATCHET', 'canonical_source_ref_values_mapping_to_multiple_source_refs', count(*), 263, CASE WHEN count(*) <= 263 THEN 'PASS' ELSE 'FAIL' END
  FROM (SELECT canonical_source_ref FROM atlas_packets WHERE canonical_source_ref IS NOT NULL GROUP BY 1 HAVING count(DISTINCT source_ref) > 1) t;

SELECT format('%-8s %-6s %-70s actual=%s baseline_or_target=%s', kind, status, name, actual, baseline_or_target)
  FROM gate_results ORDER BY CASE kind WHEN 'REQUIRE' THEN 1 WHEN 'RATCHET' THEN 2 ELSE 3 END, name;

-- Fail the run (non-zero exit under ON_ERROR_STOP) if any REQUIRE/RATCHET check failed.
DO $$
DECLARE failed int;
BEGIN
  SELECT count(*) INTO failed FROM gate_results WHERE status = 'FAIL';
  IF failed > 0 THEN RAISE EXCEPTION 'PACKET_NAMESPACE_GATE_FAILED: % check(s) breached a required value or ratchet', failed; END IF;
  RAISE NOTICE 'PACKET_NAMESPACE_GATE_OK (DEBT lines are known existing problems, not regressions)';
END
$$;
ROLLBACK;
