# Atlas Lane Health — 2026-05-29T00:24:54.044Z

## C++ / CUDA Build (simd-bridge)
| Check | Status |
|-------|--------|
| CMake configured | ✅ yes |
| Build dir exists | ✅ yes |
| .node addon built | ✅ yes |
| CUDA arch | sm_86 |
| LibTorch detected | ✅ yes |
| simdjson vendor | ✅ yes |

## Atlas Files
| File | Status |
|------|--------|
| codesbaseAtlas | ✅ 1818KB |
| featureRegistry | ✅ 2618KB |
| featureRegistryTmp | ✅ 6KB |
| cartridgeSeeds | ✅ 2729KB |
| aceContext | ✅ 356KB |
| startupStatus | ✅ 0KB |

## Cartridge Seeds
✅ 4173 seeds, age 598min

Regen: `node scripts/atlas/atlas-to-cartridge-seed.mjs`

## Startup Service Status
```json
{
  "bifrost": "green",
  "retrievalGo": "green",
  "turboquant": "green",
  "topologySearch": "green",
  "traceMcp": "green",
  "sveltekit": "yellow",
  "backgroundJobs": {
    "graphifySom": "skipped",
    "graphSynthesize": "skipped"
  },
  "timestamp": "2026-05-28T15:32:16.475Z"
}
```
