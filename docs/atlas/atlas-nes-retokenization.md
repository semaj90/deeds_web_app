# Atlas NES Retokenization

To prevent context bloat and minimize inference costs when feeding retrieval paths and codebase topology to Gemma4, Atlas uses an offline compression lane called **NES Retokenization**.

## Core Concept

Rather than injecting hundreds of lines of raw source code, dependency logs, or database schemas directly into the prompt, Atlas maps these structures into compact, short identifiers called **Atlas Tokens** (following a scheme inspired by NES cartridge bank swapping).

```
Long code/doc/trace (1,000+ tokens)
       ↓ (Retokenization Map)
CHR97:retrieval:semantic-cache:4_12 (approx. 8 tokens)
```

Gemma4 reads these tokens in the compact system prompt, mapping intentions to specific tools or contexts without parsing the raw lines.

## Token Format Specification

Every retokenized memory token conforms to this pattern:
```
CHR97:{domain}:{feature}:{som_x}_{som_y}
```

- **`CHR97`**: Prefix designating the NES cartridge format family.
- **`domain`**: The high-level architectural block (e.g., `retrieval`, `database`, `mcp`, `error`, `legal`).
- **`feature`**: The specific functional feature area (e.g., `semantic-cache`, `schema-topology`, `atlas-tools`).
- **`som_x` / `som_y`**: The coordinates of the cluster projection on the 12x12 SOM (Self-Organizing Map) topological grid.

## Memory Cache Banks

Retokenized cards are categorized into five swap banks:

| Bank | Scope | Key Contents |
|------|-------|--------------|
| **Bank 0** | Retrieval Infrastructure | Redis, Valkey, Bifrost, semantic caching states |
| **Bank 1** | DB / Schema Topology | PostgreSQL tables, Drizzle relationships, migrations |
| **Bank 2** | MCP Tools | registered tools, stdio schemas, execution logs |
| **Bank 3** | Error Repair Traces | prior logs, stack trace patterns, auto-fix outcomes |
| **Bank 4** | Legal / Evidence Docs | case details, OCR summaries, citations |

---

## Token Map Schema (`atlas_token_map`)

Each entry in the mapping table contains:

- `atlasToken`: The canonical token string (`CHR97:domain:feature:x_y`).
- `sourceRef`: Clickable codebase reference (e.g. `scripts/mcp/atlas-tools-mcp.mjs#L1-L120`).
- `kind`: Category of resource (`file`, `table`, `tool`, `cluster`).
- `domain`: Domain tag.
- `feature`: Feature tag.
- `vector64`: Compressed 64-dimensional float array (projected from 768d).
- `som_x` / `som_y`: Coordinates on the SOM topological grid.
- `reward_score`: Reinforcement learning reward (0.0 to 1.0) derived from outcome performance.
- `graphVersion`: Snapshot version of the AST/behavior graph.
- `validFrom` / `validUntil`: Validity range bound timestamps.
- `schemaMask`: Field masks for structural serialization.
