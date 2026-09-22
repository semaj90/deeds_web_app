-- S01-08H rollback: dependency order, additive-only reversal. Safe at any point before S01-08M
-- (no existing table's FK ever points INTO these 4 tables until S01-08M wires upstream_file_id).
DROP TABLE IF EXISTS atlas_stable_file_alias;
DROP TABLE IF EXISTS atlas_stable_file_revision_binding;
DROP TABLE IF EXISTS atlas_stable_file_identity;
DROP TABLE IF EXISTS atlas_repository_identity;
