# Gitignored Folder Summary

Generated: 2026-06-01T18:13:53.6148145-07:00

## Source Summaries Used
- `docs/reports/repo-organization-audit-2026-06-01.md`
- `docs/reports/codebase-semantics-neo4j-report.md`
- `docs/reports/stage-2c-500-phase-review.md`

## Gitignored Buckets

| Path | GB | Note |
| --- | ---: | --- |
| models | 9.74 | Contents include large model files; ignore patterns apply to model artifacts such as *.gguf and safetensors-labeled payloads. |
| backups | 8.11 | Archive snapshots and DB exports; treated as backup storage. |
| docker | 6.34 | Container/runtime workspace; nested env and wheel caches dominate size. |
| .venv-py313-backup | 5.31 | Backup Python environment; contents are ignored by nested pattern. |
| node_modules | 1.56 | Dependency tree; fully ignored. |
| .tmp | 1.16 | Scratch/build analysis outputs; fully ignored. |
| .cache | 0.56 | Cache surface; fully ignored. |
| offline-data | 0.63 | Offline backup payloads; ignored storage. |
| artifacts | 0.49 | Archive artifact store; ignored storage. |
| sveltekit-frontend/tmp | 0.59 | Frontend analysis exports; ignored tmp tree. |
| sveltekit-frontend/build | 0.41 | Generated frontend build output; ignored. |
| sveltekit-frontend/.cache | 0.39 | Frontend cache tree; ignored. |
| docs/reports/rg_turbovec.txt | 2.67 | Raw search dump; ignored via *.txt rule but very large. |
| docs/reports/rg_napi.txt | 1.36 | Raw search dump; ignored via *.txt rule but very large. |

## Heavy Non-Ignored Buckets

| Path | GB | Note |
| --- | ---: | --- |
| .git | 5.44 | Not gitignored; repository history and packfiles. Needs separate history hygiene, not ignore cleanup. |
| claude-mem | 1.14 | Not ignored at root by check-ignore; inspect nested files before treating as disposable. |
| turbovec | 0.52 | Not ignored at root by check-ignore; likely tool output or local engine files. |

## Summary
- The largest ignored storage sits in models, backups, Docker/runtime trees, local venv backups, caches, and generated frontend outputs.
- The two raw search dumps in `docs/reports/` are ignored but still materially large.
- `.git` is a separate history problem, not an ignore-pattern problem.
- No files were moved or deleted.
