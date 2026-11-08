# Parent Atlas NES LUT v2 — cross-language parity handoff

**Status:** `CANDIDATE_NOT_APPLIED`, `NODE_PYTHON_PARITY_PASS` on bundled fixtures only.

## Verified in the isolated package

- Node 22-compatible built-in tests: **17/17 PASS** (executed in the current container's Node runtime).
- Python 3.13 tests: **7/7 PASS** with both `unittest discover` and `PYTHONPATH=python python -m unittest atlas_compute...` invocations.
- Node + Python independent compact-object SHA-256: `nes-domain-palette-v2.candidate.json` equals `sha256:9aa054b012ff29a5a9a050533b25db86b8dfafca0a469569c043b466b42a1334`.
- Crosswalk: **17 source group IDs**, palette: **14 domains**. `general=10`, `UNRESOLVED=0`, v1 bytes and colors unmodified.
- Negative tests: checksum corruption, YAML drift, unauthorized changed rollup with valid recomputed checksum, competing candidate files, and unsafe SQL render coexistence all rejected.
- The packaged Python test module import error was fixed for module-style and discover-style invocation.
- No database connections, writes, cache changes, training runs, or live inference interactions were made.

## Independently confirmed source conflicts

The branch `session/2026-11-08-kanban-prefill-hardening` has a separate file
`scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json`. Its four new domain color bytes are:

| Domain | This candidate | Branch proposal |
|---|---:|---:|
| compiler | `0x17` | `0x19` |
| devops | `0x28` | `0x28` |
| error-handling | `0x26` | `0x06` |
| test | `0x2B` | `0x2B` |

The competing revision names, labels, weights, source digests and checksums also differ. The added preflight rejects a checkout containing **both** candidate files. **Do not rename/delete a file to bypass this gate; decide on the single reviewed v2 spec, then regenerate/checksum the accepted artifact and SQL.** Numerically close NES color indices are not a reliable proxy for visually similar RGB colors; review actual rendered swatches.

## Remain blocked

1. The reported live `atlas_nes_lut_v1` v1 `general=0` row conflicts with the current source JSON `general=10`. Existing v1 history requires a separate pre-image-backed, explicitly approved correction. A rehearsal against an empty scratch table did not prove preservation of those existing ten v1 rows.
2. The v2 candidate still needs real checkout source binding, ACE/SvelteKit/browser/WebGPU consumer parity and 14-class labeled evaluation. A 30-per-class threshold means 420 accepted human-reviewed labels.
3. The workstation's C: drive was last reported with roughly **0.6 GB free**. This should block optional installs, Docker cleanup, build-cache changes and migrations until read-only inventory identifies safe capacity recovery. The current sandbox test does not confirm the latest workstation disk state.

## Safe commands (actual checkout, after copying compatible patch files)

```powershell
# Read-only space and Docker inventory (no deletion):
Get-PSDrive C | Select-Object Name, Used, Free
docker system df

# Check competing variants and uncommitted work before copying anything:
git status --short
Get-Item scripts/atlas/data/nes-domain-palette-v2*.json -ErrorAction SilentlyContinue | Select-Object FullName, Length

# Only after a single v2 candidate is selected/generated:
node scripts/atlas/verify-nes-lut-v2-cross-language.mjs --python py --python-arg -3.13
node --test scripts/atlas/tests/test-nes-lut-v2-cross-language.mjs scripts/atlas/tests/test-nes-lut-palette-v2.mjs scripts/atlas/tests/test-nes-lut-v2-migration.mjs
py -3.13 -m unittest discover -s python/atlas_compute -p "test_nes*.py" -v
```

**Not run:** Windows workstation, production DB, disposable PostgreSQL DB with real v1 rows, live `:8095`, Ornith `:8090`, GPU renderer, GitHub CI.

## Separate database-schema choice

The hardening branch's draft SQL adds a nullable `derived_uuid` and unique index,
whereas this package's candidate migration uses the existing `atlas_nes_lut_v1`
columns without that optional field. Do **not** merge or run both migration
candidates. The derived UUID is only a derived lookup identifier (not a
canonical ontology or task key). Its need, deterministic namespace and index
must be reviewed before a single migration candidate is selected. Neither
SQL approach has been tested against a scratch clone containing the ten live
v1 rows.
