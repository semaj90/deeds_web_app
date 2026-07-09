#!/usr/bin/env python3
"""
Train XGBoost classifier on packet feature matrix + convert to ONNX

Multiclass prediction:
  - Target: best_retrieval_lane (qdrant-dense, neo4j-authority, som-topology, bm25-fallback)
  - Features: pagerank, vectors, community, SOM, graph degree, freshness

GPU acceleration: uses CPU hist (gpu_hist not available in this build)

Usage:
  python scripts/atlas/train-xgboost-classifier.py --dry-run
  python scripts/atlas/train-xgboost-classifier.py --train
  python scripts/atlas/train-xgboost-classifier.py --train --onnx
  python scripts/atlas/train-xgboost-classifier.py --evaluate
"""

import sys
import argparse
import pandas as pd
import numpy as np
from pathlib import Path
import json
import pickle

import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import LabelEncoder

# Paths
SCRIPT_DIR = Path(__file__).parent
CSV_PATH = SCRIPT_DIR.parent.parent / 'sveltekit-frontend' / 'classifier-datasets' / 'classifier-features-2026-07-09.csv'
MODEL_DIR = SCRIPT_DIR.parent.parent / 'sveltekit-frontend' / 'classifier-models'
MODEL_PATH = MODEL_DIR / 'xgboost-lane-classifier.pkl'
LABEL_ENCODER_PATH = MODEL_DIR / 'label-encoder-lanes.pkl'
METRICS_PATH = MODEL_DIR / 'xgboost-metrics.json'
ONNX_PATH = MODEL_DIR / 'xgboost-lane-classifier.onnx'

def ensure_dirs():
    """Create output directories"""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

def load_data():
    """Load and preprocess CSV"""
    print(f"\n[*] Loading {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH)
    print(f"   Loaded {len(df)} rows, {len(df.columns)} columns\n")

    # Features: numeric signals (fill NaN with 0)
    feature_cols = [
        'pagerank', 'som_row', 'som_col', 'community_id', 'days_old',
        'has_content_vec', 'has_summary_vec', 'has_keyword_vec',
        'graph_degree', 'bm25_score'
    ]

    X = df[feature_cols].fillna(0).astype('float32')

    # Target: best_retrieval_lane
    y = df['best_retrieval_lane']

    print(f"  Feature matrix: {X.shape}")
    print(f"  Target distribution:\n{y.value_counts()}\n")

    return X, y, df

def encode_labels(y, encoder=None):
    """Encode lane names to integers"""
    if encoder is None:
        encoder = LabelEncoder()
        y_encoded = encoder.fit_transform(y)
    else:
        y_encoded = encoder.transform(y)
    return y_encoded, encoder

def train_classifier(X_train, y_train, X_test, y_test, encoder):
    """Train XGBoost with CPU histogram"""
    print("[>>] Training XGBoost with CPU acceleration...")
    print(f"   Train: {X_train.shape[0]} rows | Test: {X_test.shape[0]} rows\n")

    # DMatrix
    dtrain = xgb.DMatrix(X_train, label=y_train)
    dtest = xgb.DMatrix(X_test, label=y_test)

    # Parameters for training (CPU hist)
    params = {
        'max_depth': 6,
        'learning_rate': 0.1,
        'objective': 'multi:softmax',
        'num_class': len(encoder.classes_),
        'tree_method': 'hist',  # CPU histogram
        'eval_metric': 'mlogloss',
        'random_state': 42
    }

    # Train with early stopping
    evals = [(dtrain, 'train'), (dtest, 'test')]
    evals_result = {}

    model = xgb.train(
        params,
        dtrain,
        num_boost_round=200,
        evals=evals,
        evals_result=evals_result,
        early_stopping_rounds=20,
        verbose_eval=20
    )

    print(f"\n[OK] Training complete")
    print(f"   Best iteration: {model.best_iteration}")
    print(f"   Best score: {model.best_score:.4f}\n")

    return model, evals_result

def evaluate_classifier(model, X_test, y_test, encoder):
    """Evaluate on test set"""
    print("[==] Evaluating classifier...\n")

    dtest = xgb.DMatrix(X_test, label=y_test)
    y_pred_encoded = model.predict(dtest)
    y_pred = encoder.inverse_transform(y_pred_encoded.astype(int))
    y_test_labels = encoder.inverse_transform(y_test)

    # Metrics
    accuracy = accuracy_score(y_test_labels, y_pred)
    print(f"  Accuracy: {accuracy:.4f}\n")

    print("  Classification Report:\n")
    print(classification_report(y_test_labels, y_pred))

    print("\n  Confusion Matrix:\n")
    cm = confusion_matrix(y_test_labels, y_pred, labels=encoder.classes_)
    print(f"  {encoder.classes_}")
    for i, row in enumerate(cm):
        print(f"  {encoder.classes_[i]}: {row}")

    metrics = {
        'accuracy': float(accuracy),
        'num_classes': len(encoder.classes_),
        'test_samples': len(y_test),
        'classes': list(encoder.classes_),
        'confusion_matrix': cm.tolist()
    }

    return metrics

def save_model(model, encoder, metrics):
    """Save trained model and encoder"""
    print(f"\n[*] Saving model to {MODEL_DIR}...\n")

    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
    print(f"  [OK] Model: {MODEL_PATH}")

    with open(LABEL_ENCODER_PATH, 'wb') as f:
        pickle.dump(encoder, f)
    print(f"  [OK] Label encoder: {LABEL_ENCODER_PATH}")

    with open(METRICS_PATH, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"  [OK] Metrics: {METRICS_PATH}\n")

def convert_to_onnx(model, encoder):
    """Convert XGBoost model to ONNX format"""
    print(f"\n[*] Converting to ONNX...\n")

    try:
        import onnxmltools
        from onnxmltools.convert.common.data_types import FloatTensorType
        import onnx
        import numpy as np

        # Create initial types for input (10 features, variable batch size)
        initial_types = [FloatTensorType([None, 10])]

        # Convert XGBoost Booster to ONNX
        onnx_model = onnxmltools.convert_xgboost(model, initial_types=initial_types, target_opset=12)
        onnx.checker.check_model(onnx_model)
        onnx.save(onnx_model, str(ONNX_PATH))

        print(f"  [OK] ONNX model: {ONNX_PATH}")
        print(f"  [OK] ONNX opset version: 12")
        print(f"  [OK] Classes: {list(encoder.classes_)}")
        print(f"  [OK] Input shape: (batch_size, 10 features)\n")

        # Verify with ONNX Runtime
        try:
            import onnxruntime as rt
            sess = rt.InferenceSession(str(ONNX_PATH))

            # Test inference
            test_input = np.random.randn(1, 10).astype(np.float32)
            input_name = sess.get_inputs()[0].name
            pred_onx = sess.run(None, {input_name: test_input})

            print(f"  [OK] ONNX inference verified")
            print(f"  [OK] Prediction output shape: {[p.shape for p in pred_onx]}")
            print(f"  [OK] Output names: {[o.name for o in sess.get_outputs()]}\n")
        except ImportError:
            print(f"  [!] onnxruntime not available, skipping inference test\n")
        except Exception as e:
            print(f"  [!] ONNX inference test failed: {e}\n")

    except ImportError as e:
        print(f"  [!] ONNX conversion skipped: {e}")
        print(f"  [!] Install: pip install onnxmltools onnx onnxruntime\n")
    except Exception as e:
        print(f"  [!] ONNX conversion error: {e}\n")

def main():
    parser = argparse.ArgumentParser(description='Train XGBoost lane classifier')
    parser.add_argument('--dry-run', action='store_true', help='Preview only')
    parser.add_argument('--train', action='store_true', help='Train model')
    parser.add_argument('--onnx', action='store_true', help='Convert to ONNX')
    parser.add_argument('--evaluate', action='store_true', help='Load and evaluate existing model')
    args = parser.parse_args()

    ensure_dirs()

    print('\n=================================================================')
    print('  Train XGBoost Classifier')
    print('  Target: best_retrieval_lane (4 classes)')
    print('  Method: CPU histogram (tree_method=hist)')
    print('='*65)

    # Load data
    X, y, df = load_data()

    if args.dry_run:
        print("DRY-RUN: Dataset ready for training")
        print(f"  Features: {X.shape[1]} signals")
        print(f"  Samples: {len(X)}")
        print(f"  Classes: {len(y.unique())}")
        print("\nRun with --train to start training\n")
        return

    if args.evaluate:
        print("Loading saved model...")
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(LABEL_ENCODER_PATH, 'rb') as f:
            encoder = pickle.load(f)

        # Use full dataset for evaluation
        y_encoded, _ = encode_labels(y, encoder)
        metrics = evaluate_classifier(model, X, y_encoded, encoder)

        print("\n[OK] Evaluation complete")
        print(f"  Accuracy: {metrics['accuracy']:.4f}\n")
        return

    if args.train:
        # Train/test split
        y_encoded, encoder = encode_labels(y)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )

        # Train
        model, evals_result = train_classifier(X_train, y_train, X_test, y_test, encoder)

        # Evaluate
        metrics = evaluate_classifier(model, X_test, y_test, encoder)

        # Save
        save_model(model, encoder, metrics)

        # Convert to ONNX if requested
        if args.onnx:
            convert_to_onnx(model, encoder)

        print("[DONE] Pipeline complete!\n")
        print("Next steps:")
        print("  1. Review classifier-models/ outputs")
        print("  2. Deploy Go sidecar with ONNX model")
        print("  3. Integrate with retrieval service\n")
        return

    # Default: train if no args
    y_encoded, encoder = encode_labels(y)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )

    model, evals_result = train_classifier(X_train, y_train, X_test, y_test, encoder)
    metrics = evaluate_classifier(model, X_test, y_test, encoder)
    save_model(model, encoder, metrics)

    print("[DONE] Pipeline complete!\n")

if __name__ == '__main__':
    main()
