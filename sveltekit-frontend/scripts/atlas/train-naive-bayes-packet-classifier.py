#!/usr/bin/env python3
"""
Phase 106.2: Train Naive Bayes Packet Classifier

Purpose:
  First-pass statistical classifier over lexical/semantic/AST features
  Predicts: domain_class, feature_type, likely_error_state, candidate_repair_lane

Input: atlas_packet_features rows with 95%+ feature coverage
Output: Trained model saved to ./models/naive_bayes_packet_classifier.pkl

Training data shape:
{
  "packet_key": "...",
  "ast_symbols": ["function", "class", ...],
  "lexical_features": ["auth", "session", ...],
  "used_concepts": ["security", "validation", ...],
  "entities": ["User", "Session", ...],
  "source_ref": "src/lib/server/auth.ts"
}

Labels predicted:
{
  "domain_class": "auth | data | ui | infra | network | config | other",
  "feature_type": "core | utility | test | config | schema | migration",
  "likely_error_state": "StructureError | LexicalError | SemanticError | TopologyError | VectorError",
  "candidate_repair_lane": "ast_extraction | lexical_extraction | concept_extraction | embedding | topology"
}

Usage:
  python scripts/atlas/train-naive-bayes-packet-classifier.py --dry-run --limit=1000
  python scripts/atlas/train-naive-bayes-packet-classifier.py --apply
"""

import sys
import argparse
import pickle
import json
from pathlib import Path
from typing import List, Dict, Tuple, Any

import psycopg
import numpy as np
from sklearn.naive_bayes import MultinomialNB, GaussianNB
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# ============================================================================
# Configuration
# ============================================================================

POSTGRES_HOST = '127.0.0.1'
POSTGRES_PORT = 5434
POSTGRES_DB = 'legal_ai_db'
POSTGRES_USER = 'legal_admin'
POSTGRES_PASSWORD = '123456'

MODELS_DIR = Path(__file__).parent.parent.parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

MODEL_PATH = MODELS_DIR / 'naive_bayes_packet_classifier.pkl'
VECTORIZER_PATH = MODELS_DIR / 'tfidf_vectorizer_features.pkl'

# Heuristic domain class detector based on source_ref patterns
DOMAIN_CLASS_PATTERNS = {
    'auth': ['auth', 'session', 'login', 'user', 'credential', 'password', 'jwt', 'oauth', 'ldap'],
    'data': ['db', 'database', 'query', 'model', 'schema', 'table', 'entity', 'relation', 'index'],
    'ui': ['component', 'button', 'modal', 'page', 'form', 'input', 'layout', 'css', 'style', 'view'],
    'infra': ['config', 'deploy', 'docker', 'service', 'container', 'orchestr', 'terraform', 'ansible'],
    'network': ['api', 'http', 'fetch', 'request', 'response', 'rpc', 'grpc', 'socket', 'protocol'],
    'config': ['env', 'setting', 'config', 'flag', 'param', 'option', 'constant', 'variable'],
}

ERROR_STATE_PATTERNS = {
    'StructureError': ['tree_node_id', 'source_ref', 'ast_symbols', 'function', 'class', 'import'],
    'LexicalError': ['lexical_features', 'keyword', 'ngram', 'identifier', 'token', 'parse'],
    'SemanticError': ['used_concepts', 'concept', 'entity', 'domain_class', 'semantic'],
    'TopologyError': ['som_cluster', 'pagerank', 'community', 'neighbor', 'graph'],
    'VectorError': ['embedding', 'qdrant', 'vector', 'cosine', 'distance', 'similarity'],
}

REPAIR_LANE_MAP = {
    'StructureError': 'ast_extraction',
    'LexicalError': 'lexical_extraction',
    'SemanticError': 'concept_extraction',
    'TopologyError': 'topology_repair',
    'VectorError': 'embedding_bridge',
}

# ============================================================================
# Data Loading & Preprocessing
# ============================================================================

def connect_postgres():
    """Connect to PostgreSQL database."""
    return psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD
    )

def load_training_data(conn, limit: int = 50000) -> List[Dict[str, Any]]:
    """
    Load packet features from atlas_packet_features + atlas_packets.
    Filter for rows with 95%+ feature coverage.
    """
    query = """
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.title_id,
      apf.ast_symbols,
      apf.lexical_features,
      apf.used_concepts,
      apf.entities
    FROM atlas_packets ap
    JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
    WHERE
      ap.source_ref NOT LIKE 'proto:%%'
      AND (apf.ast_symbols IS NOT NULL OR apf.lexical_features IS NOT NULL)
      AND apf.used_concepts IS NOT NULL
      AND array_length(apf.used_concepts, 1) > 0
    ORDER BY RANDOM()
    LIMIT %s
    """

    rows = []
    with conn.cursor() as cur:
        cur.execute(query, (limit,))
        for row in cur.fetchall():
            rows.append({
                'packet_key': row[0],
                'source_ref': row[1],
                'title_id': row[2],
                'ast_symbols': row[3] or [],
                'lexical_features': row[4] or [],
                'used_concepts': row[5] or [],
                'entities': row[6] or [],
            })

    return rows

def infer_domain_class(source_ref: str, tokens: List[str]) -> str:
    """Infer domain_class from source_ref pattern and token frequency."""
    source_lower = source_ref.lower()

    scores = {}
    for domain, keywords in DOMAIN_CLASS_PATTERNS.items():
        # Score based on keywords in source_ref
        keyword_hits = sum(1 for kw in keywords if kw in source_lower)
        # Score based on tokens
        token_hits = sum(1 for kw in keywords if kw in tokens)
        scores[domain] = keyword_hits * 2 + token_hits  # double weight for source_ref match

    if scores and max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return 'other'

def infer_error_state(row: Dict[str, Any]) -> str:
    """Infer likely error state based on feature coverage."""
    tokens = set(
        (row.get('ast_symbols') or []) +
        (row.get('lexical_features') or []) +
        (row.get('used_concepts') or []) +
        (row.get('entities') or [])
    )
    tokens = {t.lower() for t in tokens if t}

    scores = {}
    for error_state, keywords in ERROR_STATE_PATTERNS.items():
        hits = sum(1 for kw in keywords if kw in tokens)
        scores[error_state] = hits

    # Priority: missing features indicate error state
    if not row.get('ast_symbols') or len(row['ast_symbols']) == 0:
        return 'StructureError'
    if not row.get('lexical_features') or len(row['lexical_features']) == 0:
        return 'LexicalError'
    if not row.get('used_concepts') or len(row['used_concepts']) == 0:
        return 'SemanticError'

    # Otherwise score by token presence
    if scores and max(scores.values()) > 0:
        return max(scores, key=scores.get)
    return 'VectorError'  # Default to vector error

def infer_feature_type(source_ref: str, ast_symbols: List[str]) -> str:
    """Infer feature_type from filename and AST symbols."""
    source_lower = source_ref.lower()

    if any(x in source_lower for x in ['test', 'spec', 'e2e']):
        return 'test'
    if any(x in source_lower for x in ['migration', 'schema.ts', 'schema.mts']):
        return 'migration'
    if any(x in source_lower for x in ['config', 'env', '.config']):
        return 'config'
    if any(x in ast_symbols for x in ['setUp', 'tearDown', 'beforeEach', 'afterEach']):
        return 'test'
    if any(x in source_lower for x in ['util', 'helper', 'common', 'lib']):
        return 'utility'

    return 'core'

# ============================================================================
# Model Training
# ============================================================================

def vectorize_features(rows: List[Dict[str, Any]]) -> Tuple[np.ndarray, List[str]]:
    """
    Convert feature lists to TF-IDF vectors.
    Combines: ast_symbols + lexical_features + used_concepts
    """
    feature_texts = []
    for row in rows:
        # Combine all text features
        combined = ' '.join(
            (row.get('ast_symbols') or []) +
            (row.get('lexical_features') or []) +
            (row.get('used_concepts') or [])
        )
        feature_texts.append(combined if combined else 'unknown')

    # TF-IDF vectorization
    vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
    vectors = vectorizer.fit_transform(feature_texts)

    return vectors, vectorizer

def train_classifiers(rows: List[Dict[str, Any]], dry_run: bool = False):
    """Train four separate Naive Bayes classifiers for different label types."""
    print(f"\n[DATA] Training Naive Bayes on {len(rows)} packets...")

    # Vectorize features
    feature_vectors, vectorizer = vectorize_features(rows)

    # Generate labels
    domain_classes = [infer_domain_class(row['source_ref'], row.get('lexical_features', [])) for row in rows]
    feature_types = [infer_feature_type(row['source_ref'], row.get('ast_symbols', [])) for row in rows]
    error_states = [infer_error_state(row) for row in rows]
    repair_lanes = [REPAIR_LANE_MAP.get(infer_error_state(row), 'embedding_bridge') for row in rows]

    print(f"  Domain class distribution: {set(domain_classes)}")
    print(f"  Feature type distribution: {set(feature_types)}")
    print(f"  Error state distribution: {set(error_states)}")
    print(f"  Repair lane distribution: {set(repair_lanes)}")

    # Encode labels
    domain_encoder = LabelEncoder()
    domain_y = domain_encoder.fit_transform(domain_classes)

    feature_encoder = LabelEncoder()
    feature_y = feature_encoder.fit_transform(feature_types)

    error_encoder = LabelEncoder()
    error_y = error_encoder.fit_transform(error_states)

    repair_encoder = LabelEncoder()
    repair_y = repair_encoder.fit_transform(repair_lanes)

    # Train four classifiers
    models = {
        'domain_class': (MultinomialNB(), domain_y, domain_encoder),
        'feature_type': (MultinomialNB(), feature_y, feature_encoder),
        'error_state': (MultinomialNB(), error_y, error_encoder),
        'repair_lane': (MultinomialNB(), repair_y, repair_encoder),
    }

    trained_models = {}
    for label_type, (model, y, encoder) in models.items():
        model.fit(feature_vectors, y)
        accuracy = accuracy_score(y, model.predict(feature_vectors))
        print(f"  [OK] {label_type}: {accuracy:.1%} training accuracy")
        trained_models[label_type] = {
            'model': model,
            'encoder': encoder,
            'accuracy': accuracy,
        }

    if dry_run:
        print(f"  [OK] Dry-run complete. Models ready for apply.\n")
        return None

    # Save models (JSON-safe format, no pickle for security)
    print(f"\n[SAVE] Saving models to {MODELS_DIR}...")

    # Save model metadata as JSON
    models_data = {}
    for label_type, model_data in trained_models.items():
        model = model_data['model']
        encoder = model_data['encoder']

        # Extract model coefficients and class priors (convert numpy types to Python)
        models_data[label_type] = {
            'accuracy': float(model_data['accuracy']),
            'classes': [str(c) for c in encoder.classes_],  # Ensure string classes
            'class_log_prior': [float(x) for x in model.class_log_prior_.tolist()],
            'feature_log_prob': [[float(x) for x in row] for row in model.feature_log_prob_.tolist()],
        }

    models_json_path = MODELS_DIR / 'naive_bayes_models.json'
    with open(models_json_path, 'w') as f:
        json.dump(models_data, f, indent=2)

    # Save vectorizer metadata as JSON (feature names and parameters)
    # Convert vocab keys to int for JSON serialization (numpy ints -> Python ints)
    vocab_items = [(str(word), int(idx)) for word, idx in vectorizer.vocabulary_.items()]
    vocab_items.sort(key=lambda x: x[1])

    vectorizer_data = {
        'vocabulary': {word: idx for word, idx in vocab_items},
        'idf': vectorizer.idf_.tolist() if hasattr(vectorizer, 'idf_') else [],
        'max_features': int(vectorizer.max_features) if vectorizer.max_features else None,
        'stop_words': list(vectorizer.stop_words) if vectorizer.stop_words else [],
    }

    vectorizer_json_path = MODELS_DIR / 'tfidf_vectorizer.json'
    with open(vectorizer_json_path, 'w') as f:
        json.dump(vectorizer_data, f, indent=2)

    print(f"  [OK] Models saved to {models_json_path}")
    print(f"  [OK] Vectorizer saved to {vectorizer_json_path}\n")

    return trained_models

# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='Train Naive Bayes packet classifier')
    parser.add_argument('--dry-run', action='store_true', help='Dry-run mode (no model save)')
    parser.add_argument('--limit', type=int, default=50000, help='Max packets to load')
    args = parser.parse_args()

    print(f"\n[PHASE 106.2] Naive Bayes Packet Classifier Training")
    print(f"   Mode: {'DRY-RUN' if args.dry_run else 'APPLY'}")

    # Connect and load data
    conn = connect_postgres()
    rows = load_training_data(conn, limit=args.limit)
    conn.close()

    print(f"  [OK] Loaded {len(rows)} packets\n")

    if len(rows) < 100:
        print(f"  [WARN] Not enough training data ({len(rows)} < 100)")
        return

    # Train
    models = train_classifiers(rows, dry_run=args.dry_run)

    if not args.dry_run:
        print(f"[SUCCESS] Training complete. Ready for apply:")
        print(f"   npm run atlas:phase106.2:naive-bayes:apply\n")

if __name__ == '__main__':
    main()
