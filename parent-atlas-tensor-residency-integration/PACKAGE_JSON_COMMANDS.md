# Suggested package.json commands

Add only after reconciling existing script names:

```json
{
  "atlas:tensor:verify": "npx tsx scripts/atlas/verify-tensor-residency.mts",
  "atlas:tensor:index": "npx tsx scripts/atlas/index-arrow-artifacts.mts",
  "atlas:tensor:python": "python -m parent_atlas_tensor.cli",
  "atlas:tensor:smoke": "python -m parent_atlas_tensor.cli smoke"
}
```

Do not blindly overwrite `package.json`; merge these into the existing script registry if names are free.
