# Repair Missing NPM Script

Use this command when an npm command fails with:

- `npm error Missing script`
- `Missing script: "feature:atlas"`
- documented command exists but package.json alias is missing

## Rules

- Do not ask the user to confirm script paths.
- Use `rg` first.
- Use PowerShell, not awk.
- Do not read full files first.
- Do not create or edit files unless explicitly asked.
- Report exact package.json scripts to add.

## Step 1 — Set workspace

```powershell
Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
```

## Step 2 — Find candidate scripts

```powershell
rg --files | rg "mapreduce|feature|atlas|qdrant|reduce|index"
```

## Step 3 — Search package scripts

```powershell
rg -n "feature:atlas|map:features|reduce:features|index-features|mapreduce" package.json ..\package.json
```

## Step 4 — Search implementation references

```powershell
rg -n -C 2 "feature_registry|featureKey|sourceRefs|qdrant|mapreduce|summary-card|codebase-summary" scripts src docs .opencode
```

## Step 5 — Sidecar migration search if relevant

```powershell
rg --files drizzle | rg "0013_codeintel_indexes|0016_codeintel_schema|0016_courtroom_3d_animation|0018_output_meta_manifold4|0019_llm_context_cache"

rg -n -C 3 "CREATE TABLE|ALTER TABLE|CREATE INDEX|DROP TABLE|DROP INDEX|INSERT INTO|UPDATE " drizzle
```

## Step 6 — Report

Return:

```json
{
  "diagnosis": "feature:atlas is documented but not wired in package.json",
  "existingScripts": [],
  "candidateFiles": [],
  "missingAliases": [],
  "packageJsonScriptsToAdd": {},
  "doNotEditYet": true
}
```

## Required conclusion

If a script is missing, say:

`The next step is to add package.json aliases or create the missing scripts. I will not edit until approved.`

Then run inside OpenCode:

/repair-missing-npm-script

You can also add this to AGENTS.md:

## Missing Script Rule

If an npm command fails with `Missing script`, do not ask the user for paths.

Use:
1. `rg --files`
2. `rg -n` against package.json files
3. `rg -n -C 2` against scripts/src/docs/.opencode
4. Return exact aliases to add
5. Do not edit unless approved