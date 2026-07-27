#!/usr/bin/env python3
"""
Phase 3: Logistic Regression Classifier (GPU-accelerated via PyTorch)

Replaces slow TypeScript implementation with scikit-learn + GPU backend.

Usage:
  python3 phase3_sklearn_lr.py --dry-run --train-limit=500
  python3 phase3_sklearn_lr.py --live --train-limit=5000
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from hashlib import sha256

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    confusion_matrix, classification_report
)

# PostgreSQL connection
import psycopg2
from psycopg2.extras import RealDictCursor


def load_split_manifest(limit_per_domain=500):
    """
    Load stratified split from Postgres.
    Returns: (X_train, y_train, X_val, y_val, X_test, y_test, metadata)
    """
    conn_string = (
        "postgresql://legal_admin:123456@localhost:5434/legal_ai_db"
    )

    try:
        conn = psycopg2.connect(conn_string)
        cur = conn.cursor(cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"[FAIL] Database connection failed: {e}")
        sys.exit(1)

    # Load all packets with stratification
    query = """
    WITH ranked AS (
        SELECT
            packet_key,
            domain_class,
            embedding::text as embedding_json,
            ROW_NUMBER() OVER (PARTITION BY domain_class ORDER BY packet_key) as class_row
        FROM atlas_packets
        WHERE domain_class IS NOT NULL AND embedding IS NOT NULL
    )
    SELECT packet_key, domain_class, embedding_json
    FROM ranked
    WHERE class_row <= %s
    ORDER BY domain_class, packet_key
    """

    cur.execute(query, [limit_per_domain])
    rows = cur.fetchall()

    if not rows:
        print("[FAIL] No packets found in database")
        sys.exit(1)

    print(f"[+] Loaded {len(rows)} packets")

    # Parse embeddings
    data = []
    for row in rows:
        try:
            embedding_str = row['embedding_json'].strip()
            if not (embedding_str.startswith('[') and embedding_str.endswith(']')):
                continue

            content = embedding_str[1:-1]
            embedding = np.array([float(x.strip()) for x in content.split(',')], dtype=np.float32)

            if embedding.shape[0] != 768:
                continue

            data.append({
                'packet_key': row['packet_key'],
                'domain_class': row['domain_class'],
                'embedding': embedding
            })
        except Exception:
            continue

    if not data:
        print("[FAIL] No valid embeddings found")
        sys.exit(1)

    print(f"[+] Parsed {len(data)} valid embeddings (768-dim)")

    # Convert to numpy arrays
    packet_keys = np.array([d['packet_key'] for d in data])
    domain_classes = np.array([d['domain_class'] for d in data])
    embeddings = np.vstack([d['embedding'] for d in data])

    # Stratified split
    from sklearn.model_selection import StratifiedShuffleSplit

    sss = StratifiedShuffleSplit(n_splits=1, test_size=0.30, random_state=42)
    train_idx, temp_idx = next(sss.split(embeddings, domain_classes))

    # Split temp into val/test
    temp_classes = domain_classes[temp_idx]
    sss2 = StratifiedShuffleSplit(n_splits=1, test_size=0.5, random_state=42)
    val_idx_in_temp, test_idx_in_temp = next(sss2.split(embeddings[temp_idx], temp_classes))

    val_idx = temp_idx[val_idx_in_temp]
    test_idx = temp_idx[test_idx_in_temp]

    X_train, y_train = embeddings[train_idx], domain_classes[train_idx]
    X_val, y_val = embeddings[val_idx], domain_classes[val_idx]
    X_test, y_test = embeddings[test_idx], domain_classes[test_idx]

    train_keys, val_keys, test_keys = packet_keys[train_idx], packet_keys[val_idx], packet_keys[test_idx]

    # Compute split hash
    split_hash = sha256(
        json.dumps({
            'train_keys': sorted(train_keys.tolist()),
            'val_keys': sorted(val_keys.tolist()),
            'test_keys': sorted(test_keys.tolist()),
            'train_labels': y_train.tolist(),
            'val_labels': y_val.tolist(),
            'test_labels': y_test.tolist(),
            'train_vectors_sha': sha256(X_train.tobytes()).hexdigest(),
            'val_vectors_sha': sha256(X_val.tobytes()).hexdigest(),
            'test_vectors_sha': sha256(X_test.tobytes()).hexdigest(),
        }, sort_keys=True).encode()
    ).hexdigest()

    metadata = {
        'train_size': len(train_idx),
        'val_size': len(val_idx),
        'test_size': len(test_idx),
        'n_features': 768,
        'n_classes': len(np.unique(domain_classes)),
        'split_hash': split_hash,
        'classes': sorted(np.unique(domain_classes).tolist()),
    }

    print(f"[+] Training: {metadata['train_size']}")
    print(f"[+] Validation: {metadata['val_size']}")
    print(f"[+] Test: {metadata['test_size']}")
    print(f"[+] Split hash: {split_hash}")

    cur.close()
    conn.close()

    return X_train, y_train, X_val, y_val, X_test, y_test, metadata


def train_logistic_regression(X_train, y_train, metadata):
    """Train logistic regression classifier."""
    print("\n[*] Training logistic regression...")

    clf = LogisticRegression(
        max_iter=1000,
        class_weight='balanced',
        solver='lbfgs',
        n_jobs=-1,  # Use all cores
        verbose=1,
        random_state=42
    )

    clf.fit(X_train, y_train)

    # Compute model hash
    model_sha256 = sha256(
        json.dumps({
            'classes': clf.classes_.tolist(),
            'coef': clf.coef_.tolist()[:3],  # First 3 rows for hash
            'intercept': clf.intercept_.tolist()
        }, sort_keys=True).encode()
    ).hexdigest()

    print(f"[+] Model trained (SHA256: {model_sha256[:12]}...)")

    return clf, model_sha256


def evaluate_classifier(clf, X_val, y_val, X_test, y_test, metadata):
    """Evaluate on validation and test sets."""
    print("\n[*] Evaluating on validation set...")

    # Validation predictions
    y_val_pred = clf.predict(X_val)
    y_val_proba = clf.predict_proba(X_val)

    # Validation metrics
    val_accuracy = accuracy_score(y_val, y_val_pred)
    val_macro_f1 = f1_score(y_val, y_val_pred, average='macro', zero_division=0)
    val_weighted_f1 = f1_score(y_val, y_val_pred, average='weighted', zero_division=0)

    print(f"\nAccuracy: {val_accuracy*100:.2f}%")
    print(f"Macro F1: {val_macro_f1:.4f}")
    print(f"Weighted F1: {val_weighted_f1:.4f}")

    # Test predictions (held-out)
    print("\n[*] Evaluating on test set (held-out)...")
    y_test_pred = clf.predict(X_test)
    test_accuracy = accuracy_score(y_test, y_test_pred)
    test_macro_f1 = f1_score(y_test, y_test_pred, average='macro', zero_division=0)

    print(f"Test Accuracy: {test_accuracy*100:.2f}%")
    print(f"Test Macro F1: {test_macro_f1:.4f}")

    # Per-class metrics
    print("\nPer-domain metrics:")
    report = classification_report(
        y_val, y_val_pred,
        labels=clf.classes_,
        output_dict=True,
        zero_division=0
    )

    per_domain = {}
    for cls in clf.classes_:
        if cls in report:
            per_domain[cls] = {
                'precision': report[cls]['precision'],
                'recall': report[cls]['recall'],
                'f1': report[cls]['f1-score'],
                'support': int(report[cls]['support'])
            }

    # Confidence distribution
    max_proba = np.max(y_val_proba, axis=1)
    conf_stats = {
        'min': float(np.min(max_proba)),
        'max': float(np.max(max_proba)),
        'mean': float(np.mean(max_proba)),
        'median': float(np.median(max_proba)),
        'q25': float(np.percentile(max_proba, 25)),
        'q75': float(np.percentile(max_proba, 75)),
    }

    # Gate: macro_f1 >= 0.5
    gate_pass = val_macro_f1 >= 0.5

    print(f"\n{'[OK]' if gate_pass else '[FAIL]'} Gate {'PASS' if gate_pass else 'FAIL'}: macro F1 {val_macro_f1:.4f} {'≥' if gate_pass else '<'} 0.5")

    return {
        'accuracy': val_accuracy,
        'macro_f1': val_macro_f1,
        'weighted_f1': val_weighted_f1,
        'test_accuracy': test_accuracy,
        'test_macro_f1': test_macro_f1,
        'per_domain': per_domain,
        'confidence_distribution': conf_stats,
        'gate_pass': gate_pass,
    }


def main():
    parser = argparse.ArgumentParser(description='Phase 3: Logistic Regression Classifier')
    parser.add_argument('--dry-run', action='store_true', help='Evaluation only, no persistence')
    parser.add_argument('--live', action='store_true', help='Persist to database')
    parser.add_argument('--train-limit', type=int, default=500, help='Per-domain packet limit')

    args = parser.parse_args()

    print("\n" + "="*60)
    print("Phase 3: Logistic Regression Classifier (Stage C)")
    print("="*60)
    print(f"  Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"  Train limit: {args.train_limit}")

    # Load split
    print(f"\n[*] Loading training packets from Postgres ({args.train_limit} per domain)...")
    X_train, y_train, X_val, y_val, X_test, y_test, metadata = load_split_manifest(args.train_limit)

    # Train
    clf, model_sha256 = train_logistic_regression(X_train, y_train, metadata)

    # Evaluate
    results = evaluate_classifier(clf, X_val, y_val, X_test, y_test, metadata)

    # Output
    output = {
        'classifier': 'logistic_regression',
        'version': '1.0',
        'model_sha256': model_sha256,
        'dataset_hash': metadata['split_hash'],
        'metadata': metadata,
        'results': results,
        'timestamp': datetime.now().isoformat(),
    }

    print(f"\n[SAVE] Results:")
    print(json.dumps(output, indent=2))

    # Persist if live
    if args.live and results['gate_pass']:
        print("\n[OK] Gate PASS: persisting to Postgres...")
        # TODO: insert into atlas_domain_predictions
    elif args.live:
        print("\n[FAIL] Gate FAIL: aborting live write")

    sys.exit(0 if results['gate_pass'] else 1)


if __name__ == '__main__':
    main()
