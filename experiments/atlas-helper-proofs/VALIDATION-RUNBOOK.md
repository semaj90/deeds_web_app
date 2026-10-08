# CPU validation and independent receipt

The proof runner does not apply migrations, index vectors, invoke GPU, start a server, or write canonical stores. Its only output is a **new** `.tmp/` JSON proof report; repeated runs must use fresh filenames.

```sh
cd experiments/atlas-helper-proofs
python -m unittest discover -p 'test_*.py' -v
python validate_cpu_pipeline.py --report ../../.tmp/atlas-cpu-proof-001.json
python validate_cpu_pipeline.py --report ../../.tmp/atlas-cpu-proof-python-001.json \
  --source ../../python/miniforge_nlp_sidecar.py --language python --kind function_definition
```

The report records unit test status, parser invocation status, diagnostic counts, a SHA-256 receipt and independent file readback. The default without `--source` **does not** prove a real parser run. A successful parser invocation is not symbol/packet authority, even when exact AST and chunk boundaries match.

Next proof gates: (1) capture source/workspace revision and upstream-file ownership from PostgreSQL read-only; (2) join exact source span to one symbol version and packet membership; (3) compare C25 output with SvelteKit's canonical TS builder and independent checksums; (4) evaluate grounded typed graph edges using NetworkX; (5) only then consider ContextManifest and DAG receipt consumption.

Upstream APIs: https://github.com/Consiliency/treesitter-chunker ; https://ast-grep.github.io/guide/api-usage/py-api.html
