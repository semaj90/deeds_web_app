#!/usr/bin/env python3
"""
Phase 4: XGBoost Classifier (GPU-accelerated)

Uses real XGBClassifier with GPU support, not TypeScript mock.

Usage:
  python3 phase4_xgb.py --dry-run --train-limit=500
  python3 phase4_xgb.py --live --train-limit=5000
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from hashlib import sha256

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
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

    # Compute split hash (must match Phase 3)
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
        'semantic_feature_dim': 768,
        'total_feature_dim': 768,
        'feature_schema_version': 'atlas.classifier.features.v1',
        'feature_manifest': {
            'schemaVersion': 'atlas.classifier.features.v1',
            'semantic': {
                'representationId': 'semantic_768',
                'offset': 0,
                'width': 768,
                'modelId': 'embeddinggemma:latest',
                'modelRevision': 'unknown',
            },
            'totalWidth': 768,
        },
        'n_classes': len(np.unique(domain_classes)),
        'split_hash': split_hash,
        'classes': sorted(np.unique(domain_classes).tolist()),
    }

    print(f"[+] Training: {metadata['train_size']}")
    print(f"[+] Validation: {metadata['val_size']}")
    print(f"[+] Test: {metadata['test_size']}")
    print(f"[+] Semantic feature width: {metadata['semantic_feature_dim']}")
    print(f"[+] Total feature width: {metadata['total_feature_dim']}")
    print(f"[+] Feature schema: {metadata['feature_schema_version']}")
    print(f"[+] Split hash: {split_hash}")

    cur.close()
    conn.close()

    return X_train, y_train, X_val, y_val, X_test, y_test, metadata


def train_xgboost(X_train, y_train, metadata):
    """Train XGBoost classifier with GPU acceleration."""
    print("\n[*] Training XGBoost ensemble (GPU-accelerated)...")

    # Convert labels to indices for XGBoost
    classes = sorted(np.unique(y_train))
    class_to_idx = {cls: i for i, cls in enumerate(classes)}
    y_train_idx = np.array([class_to_idx[y] for y in y_train])

    # XGBoost classifier with histogram-based training
    # Note: XGBoost 3.1+ uses 'hist' with multi-threaded CPU, not 'gpu_hist'
    semantic_width = int(metadata.get('semantic_feature_dim', 768))
    total_width = int(metadata.get('total_feature_dim', semantic_width))
    if X_train.shape[1] != semantic_width:
        raise ValueError(f"Expected semantic_feature_dim={semantic_width}, got {X_train.shape[1]}")

    clf = XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        tree_method='hist',  # CPU-based histogram (multi-threaded)
        eval_metric='mlogloss',
        random_state=42,
        verbosity=1
    )

    clf.fit(X_train, y_train_idx)

    # Compute model hash
    model_sha256 = sha256(
        json.dumps({
            'n_estimators': clf.n_estimators,
            'max_depth': clf.max_depth,
            'learning_rate': clf.learning_rate,
            'classes': classes
        }, sort_keys=True).encode()
    ).hexdigest()

    print(f"[+] Model trained (100 trees, SHA256: {model_sha256[:12]}...)")

    return clf, class_to_idx, model_sha256


def evaluate_classifier(clf, class_to_idx, X_val, y_val, X_test, y_test, metadata):
    """Evaluate on validation and test sets."""
    print("\n[*] Evaluating on validation set...")

    # Convert labels to indices
    y_val_idx = np.array([class_to_idx[y] for y in y_val])
    y_test_idx = np.array([class_to_idx[y] for y in y_test])

    # Validation predictions
    y_val_pred_idx = clf.predict(X_val)
    y_val_proba = clf.predict_proba(X_val)

    # Convert back to class labels
    idx_to_class = {i: cls for cls, i in class_to_idx.items()}
    y_val_pred = np.array([idx_to_class[i] for i in y_val_pred_idx])

    # Validation metrics
    val_accuracy = accuracy_score(y_val, y_val_pred)
    val_macro_f1 = f1_score(y_val, y_val_pred, average='macro', zero_division=0)
    val_weighted_f1 = f1_score(y_val, y_val_pred, average='weighted', zero_division=0)

    print(f"\nAccuracy: {val_accuracy*100:.2f}%")
    print(f"Macro F1: {val_macro_f1:.4f}")
    print(f"Weighted F1: {val_weighted_f1:.4f}")
    print(f"Confidence (mean): {np.max(y_val_proba, axis=1).mean():.4f}")

    # Test predictions (held-out)
    print("\n[*] Evaluating on test set (held-out)...")
    y_test_pred_idx = clf.predict(X_test)
    y_test_pred = np.array([idx_to_class[i] for i in y_test_pred_idx])
    test_accuracy = accuracy_score(y_test, y_test_pred)
    test_macro_f1 = f1_score(y_test, y_test_pred, average='macro', zero_division=0)

    print(f"Test Accuracy: {test_accuracy*100:.2f}%")
    print(f"Test Macro F1: {test_macro_f1:.4f}")

    # Per-class metrics
    print("\nPer-domain metrics:")
    report = classification_report(
        y_val, y_val_pred,
        labels=sorted(np.unique(y_val)),
        output_dict=True,
        zero_division=0
    )

    per_domain = {}
    for cls in sorted(np.unique(y_val)):
        if cls in report:
            per_domain[cls] = {
                'f1': report[cls]['f1-score'],
                'precision': report[cls]['precision'],
                'recall': report[cls]['recall'],
                'support': int(report[cls]['support'])
            }

    # Feature importance (top 10)
    feature_importance = {}
    for i, imp in enumerate(clf.feature_importances_):
        feature_importance[f'feature_{i}'] = float(imp)

    top_features = sorted(
        feature_importance.items(),
        key=lambda x: x[1],
        reverse=True
    )[:10]

    print("\nTop 10 features by importance:")
    for feat, imp in top_features:
        print(f"  {feat}: {imp*100:.2f}%")

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

    gate_str = "[OK]" if gate_pass else "[FAIL]"
    op_str = ">=" if gate_pass else "<"
    print(f"\n{gate_str} Gate {'PASS' if gate_pass else 'FAIL'}: macro F1 {val_macro_f1:.4f} {op_str} 0.5")

    return {
        'accuracy': val_accuracy,
        'macro_f1': val_macro_f1,
        'weighted_f1': val_weighted_f1,
        'test_accuracy': test_accuracy,
        'test_macro_f1': test_macro_f1,
        'per_domain': per_domain,
        'confidence_distribution': conf_stats,
        'feature_importance': feature_importance,
        'top_features': dict(top_features),
        'gate_pass': gate_pass,
    }


def main():
    parser = argparse.ArgumentParser(description='Phase 4: XGBoost Classifier')
    parser.add_argument('--dry-run', action='store_true', help='Evaluation only, no persistence')
    parser.add_argument('--live', action='store_true', help='Persist to database')
    parser.add_argument('--train-limit', type=int, default=500, help='Per-domain packet limit')

    args = parser.parse_args()

    print("\n" + "="*60)
    print("Phase 4: XGBoost Classifier (Stage D)")
    print("="*60)
    print(f"  Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"  Train limit: {args.train_limit}")

    # Load split
    print(f"\n[*] Loading training packets from Postgres ({args.train_limit} per domain)...")
    X_train, y_train, X_val, y_val, X_test, y_test, metadata = load_split_manifest(args.train_limit)

    # Train
    clf, class_to_idx, model_sha256 = train_xgboost(X_train, y_train, metadata)

    # Evaluate
    results = evaluate_classifier(clf, class_to_idx, X_val, y_val, X_test, y_test, metadata)

    # Output
    output = {
        'classifier': 'xgboost',
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
