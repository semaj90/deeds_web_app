#!/usr/bin/env python3
"""
Offline trainer for the NLP sidecar's domain-classify pass
(openspec/changes/parent-atlas-search-classifier-sidecar).

Real, non-fabricated training pipeline:
  1. Walk a bounded sample of real source files.
  2. For each file, call the canonical TS classifier
     (POST /api/atlas/domain-taxonomy/classify, wrapping
     domain-taxonomy.ts::classifyDomainTaxonomy) to get a weak label — this repo's
     own `DomainClassification.labels[].source: 'weak_label'` taxonomy already
     names this pattern; we are not inventing a new labeling scheme.
  3. Embed each file's text (sentence-chunked) via the canonical embeddinggemma
     path (Ollama :11434) — the SAME embedding path the sidecar's inference-time
     `_fetch_ollama_embedding()` uses, so train/inference stay consistent.
  4. Fit one global KMeans over every chunk embedding in the corpus.
  5. For each file, compute cluster_features (distance-to-centroid stats) via
     the fitted KMeans — the same 4-feature shape
     `_extract_cluster_features()` produces at inference time.
  6. Fit MultinomialNB + LogisticRegression on (cluster_features -> weak_label).
  7. Persist {kmeans, nb, lr, labels, model_revision} via joblib to
     DOMAIN_CLASSIFIER_CHECKPOINT_PATH.

This script does NOT run at request time — it is a standalone CLI, run manually
or via a scheduled job, matching the "training is offline, inference is fast"
split this repo already uses for other classifiers (see design.md D4b re:
okf-fit.ts's live formula-based approximation of this exact contract shape).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any, Optional

try:
    import numpy as np
    from sklearn.cluster import KMeans
    from sklearn.linear_model import LogisticRegression
    from sklearn.naive_bayes import MultinomialNB
except ImportError as exc:
    raise RuntimeError(
        "train_domain_classifier.py requires numpy + scikit-learn "
        "(pip install numpy scikit-learn joblib)"
    ) from exc

try:
    import joblib
except ImportError as exc:
    raise RuntimeError("train_domain_classifier.py requires joblib (pip install joblib)") from exc


DEFAULT_CLASSIFY_API_URL = os.getenv(
    "DOMAIN_TAXONOMY_CLASSIFY_URL", "http://127.0.0.1:5173/api/atlas/domain-taxonomy/classify"
)
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_EMBED_MODEL = os.getenv("DOMAIN_CLASSIFIER_EMBED_MODEL", "embeddinggemma:latest")
DEFAULT_CHECKPOINT_PATH = Path(
    os.getenv("DOMAIN_CLASSIFIER_CHECKPOINT_PATH", "models/domain-classifier/checkpoint.joblib")
)


def fetch_weak_label(
    api_url: str, *, source_ref: str, summary: str, timeout_seconds: float = 10.0
) -> Optional[str]:
    """Calls the canonical classifier via HTTP. Returns primary_domain, or None
    if the classifier abstained (fallback_label) or the call failed."""
    payload = json.dumps({"sourceRef": source_ref, "summary": summary[:4000]}).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        print(f"  [warn] weak-label fetch failed for {source_ref}: {exc}", file=sys.stderr)
        return None
    classification = body.get("classification") or {}
    return classification.get("primary_domain")


def fetch_ollama_embedding(
    text: str, *, ollama_url: str, embed_model: str, timeout_seconds: float = 10.0
) -> Optional[list[float]]:
    if not text.strip():
        return None
    payload = json.dumps({"model": embed_model, "prompt": text[:2000]}).encode("utf-8")
    request = urllib.request.Request(
        f"{ollama_url}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = json.loads(response.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        print(f"  [warn] embedding fetch failed: {exc}", file=sys.stderr)
        return None
    embedding = body.get("embedding")
    return embedding if isinstance(embedding, list) and embedding else None


def chunk_text_for_clustering(text: str, max_chunks: int = 8) -> list[str]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not sentences:
        stripped = text.strip()
        return [stripped[:500]] if stripped else []
    return sentences[:max_chunks]


def walk_corpus(root: Path, *, limit: int, extensions: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if len(files) >= limit:
            break
        if path.is_file() and path.suffix in extensions and "node_modules" not in path.parts:
            files.append(path)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-dir", type=Path, default=Path("sveltekit-frontend/src/lib/server"))
    parser.add_argument("--limit", type=int, default=200, help="Max files to sample (bounded, not the whole repo)")
    parser.add_argument("--extensions", nargs="+", default=[".ts"])
    parser.add_argument("--n-clusters", type=int, default=16)
    parser.add_argument("--api-url", default=DEFAULT_CLASSIFY_API_URL)
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--embed-model", default=DEFAULT_EMBED_MODEL)
    parser.add_argument("--output", type=Path, default=DEFAULT_CHECKPOINT_PATH)
    parser.add_argument("--dry-run", action="store_true", help="Fetch labels/embeddings but do not persist a checkpoint")
    args = parser.parse_args()

    if not args.corpus_dir.exists():
        print(f"ERROR: corpus dir does not exist: {args.corpus_dir}", file=sys.stderr)
        return 1

    files = walk_corpus(args.corpus_dir, limit=args.limit, extensions=tuple(args.extensions))
    if not files:
        print(f"ERROR: no files found under {args.corpus_dir} with extensions {args.extensions}", file=sys.stderr)
        return 1
    print(f"Sampled {len(files)} files from {args.corpus_dir}")

    all_chunk_embeddings: list[list[float]] = []
    per_file_chunk_embeddings: list[list[list[float]]] = []
    weak_labels: list[Optional[str]] = []
    source_refs: list[str] = []

    for index, path in enumerate(files):
        rel = str(path.relative_to(args.corpus_dir.anchor) if path.is_absolute() else path)
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as exc:
            print(f"  [warn] could not read {rel}: {exc}", file=sys.stderr)
            continue

        label = fetch_weak_label(args.api_url, source_ref=rel, summary=text[:4000])
        chunks = chunk_text_for_clustering(text)
        chunk_vecs: list[list[float]] = []
        for chunk in chunks:
            vec = fetch_ollama_embedding(chunk, ollama_url=args.ollama_url, embed_model=args.embed_model)
            if vec:
                chunk_vecs.append(vec)
                all_chunk_embeddings.append(vec)

        source_refs.append(rel)
        weak_labels.append(label)
        per_file_chunk_embeddings.append(chunk_vecs)

        if (index + 1) % 20 == 0:
            print(f"  ... {index + 1}/{len(files)} files processed")

    label_counts = Counter(l for l in weak_labels if l)
    print(f"Weak-label distribution: {dict(label_counts)}")

    if len(all_chunk_embeddings) < args.n_clusters:
        print(
            f"ERROR: only {len(all_chunk_embeddings)} chunk embeddings collected, "
            f"need at least n_clusters={args.n_clusters}. Is Ollama/{args.embed_model} reachable "
            f"at {args.ollama_url}? Is the SvelteKit dev server reachable at {args.api_url}?",
            file=sys.stderr,
        )
        return 1

    print(f"Fitting KMeans(n_clusters={args.n_clusters}) over {len(all_chunk_embeddings)} chunk embeddings...")
    kmeans = KMeans(n_clusters=args.n_clusters, n_init="auto", random_state=42)
    kmeans.fit(np.array(all_chunk_embeddings))

    feature_rows: list[list[float]] = []
    fit_labels: list[str] = []
    for label, chunk_vecs in zip(weak_labels, per_file_chunk_embeddings):
        if not label or not chunk_vecs:
            continue
        matrix = np.array(chunk_vecs)
        distances = kmeans.transform(matrix)
        assignments = kmeans.predict(matrix)
        nearest = distances[np.arange(len(assignments)), assignments]
        feature_rows.append(
            [
                float(np.mean(nearest)),
                float(np.std(nearest)) if len(nearest) > 1 else 0.0,
                float(len(set(assignments.tolist()))) / float(args.n_clusters),
                float(len(chunk_vecs)),
            ]
        )
        fit_labels.append(label)

    if len(set(fit_labels)) < 2:
        print(
            f"ERROR: only {len(set(fit_labels))} distinct weak label(s) collected "
            f"({fit_labels[:1]}) — need at least 2 classes to train NB/LR. "
            "Widen --corpus-dir or raise --limit.",
            file=sys.stderr,
        )
        return 1

    print(f"Training MultinomialNB + LogisticRegression on {len(feature_rows)} labeled rows ({len(set(fit_labels))} classes)...")
    X = np.array(feature_rows)
    labels_sorted = sorted(set(fit_labels))
    y = np.array([labels_sorted.index(label) for label in fit_labels])

    nb = MultinomialNB()
    nb.fit(X, y)
    lr = LogisticRegression(max_iter=1000)
    lr.fit(X, y)

    model_revision = f"domain-classifier-nblr-v1-{int(time.time())}"
    checkpoint: dict[str, Any] = {
        "kmeans": kmeans,
        "nb": nb,
        "lr": lr,
        "labels": labels_sorted,
        "model_revision": model_revision,
        "trained_on_files": len(feature_rows),
        "n_clusters": args.n_clusters,
        "embed_model": args.embed_model,
    }

    if args.dry_run:
        print(f"[dry-run] would persist checkpoint to {args.output} (model_revision={model_revision})")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(checkpoint, args.output)
    print(f"Persisted checkpoint to {args.output} (model_revision={model_revision})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
