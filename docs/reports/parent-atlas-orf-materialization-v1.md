# Parent Atlas ORF Materialization v1

The active packet-key ORF materializer was exercised against the deterministic
174-row packet plan.

- dry run: 174 attempted, 0 validation errors
- bounded apply: 50 rows
- identical repeat apply: 50 rows, 0 table-growth delta
- live table count after repeat: 1,808
- database writes: bounded additive upserts only

The ORF projection remains separate from the symbol-level callable enrichment
projection. Semantic vectors are not written here; they remain owned by the
canonical semantic vector lane.
