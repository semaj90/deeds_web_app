# Summary Selection Contract

Canonical summary levels for embedding and envelope materialization:

1. `packet`
2. `gemma4_packet_summary`
3. `file`

Selection rule:

- Prefer `packet` over `gemma4_packet_summary` over `file`
- Ignore `summary_level = NULL` for default canonical embedding runs
- Keep legacy/null-level rows out of new embedding sweeps unless explicitly requested

Observed current distribution in `atlas_summary_layers`:

- `summary_level = null`: 10,659 rows, 32 with text, 32 embedded
- `summary_level = packet`: 3,896 rows, 3,744 with text, 3,744 embedded
- `summary_level = gemma4_packet_summary`: 494 rows, 494 with text, 494 embedded
- `summary_level = file`: 421 rows, 417 with text, 417 embedded

Canonical outcome:

- All summary-bearing rows are embedded
- Canonical summary selection is explicit and shared by:
  - `scripts/atlas/embeddinggemma-batch-worker.mts`
  - `scripts/atlas/phase8-feature-envelope-materialization.mjs`
  - `scripts/atlas/materialize-feature-envelopes.mts`
