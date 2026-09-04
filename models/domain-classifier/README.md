# Domain classifier checkpoint

Trained offline by `python/train_domain_classifier.py` (run from the repo root on the host, not
inside the sidecar container). Produces `checkpoint.joblib` — a persisted `{kmeans, nb, lr, labels,
model_revision, ...}` dict loaded at inference time by the NLP sidecar's `classify` pass
(`_load_domain_classifier_checkpoint()` in `python/miniforge_nlp_sidecar.py`).

Mounted read-only into the sidecar container at `/models/domain-classifier` (see
`docker/miniforge-nlp-sidecar/docker-compose.yml`).

`checkpoint.joblib` itself is gitignored (binary model artifact, regenerable — see
`.gitignore`) — this README is tracked so the directory (and the bind-mount target it provides)
exists deterministically without depending on a first training run.

## Regenerate

```bash
python python/train_domain_classifier.py --corpus-dir sveltekit-frontend/src/lib/server --limit 200
```

Requires the SvelteKit dev server running (for the weak-label endpoint,
`POST /api/atlas/domain-taxonomy/classify`) and Ollama running with `embeddinggemma:latest` pulled.
