ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_raw double precision;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_percentile double precision;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS authority_band text;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_run_id uuid;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_contract_version text;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS graph_snapshot_hash text;

ALTER TABLE public.atlas_topology_index
  ADD COLUMN IF NOT EXISTS pagerank_computed_at timestamptz;
