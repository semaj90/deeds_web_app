#!/usr/bin/env python3
"""
Naive Bayes Inference Script (JSON-safe, no pickle)

Loads trained models from JSON, runs inference on packets,
returns JSON predictions to stdout for Node.js consumption.

Input: JSON array from stdin (packet data with features)
Output: JSON array to stdout (predictions with confidence scores)
"""

import sys
import json
import math
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

# Load model and vectorizer paths
MODELS_DIR = Path(__file__).parent.parent.parent / 'models'
MODELS_JSON_PATH = MODELS_DIR / 'naive_bayes_models.json'
VECTORIZER_JSON_PATH = MODELS_DIR / 'tfidf_vectorizer.json'

def load_models_from_json():
    """Load trained models and vectorizer from JSON files."""
    if not MODELS_JSON_PATH.exists():
        raise FileNotFoundError(f"Models not found: {MODELS_JSON_PATH}")
    if not VECTORIZER_JSON_PATH.exists():
        raise FileNotFoundError(f"Vectorizer not found: {VECTORIZER_JSON_PATH}")

    with open(MODELS_JSON_PATH, 'r') as f:
        models_data = json.load(f)
    with open(VECTORIZER_JSON_PATH, 'r') as f:
        vectorizer_data = json.load(f)

    return models_data, vectorizer_data

def vectorize_packet(packet: Dict[str, Any], vectorizer_data: Dict) -> List[float]:
    """Convert packet features to TF-IDF vector using JSON vectorizer data."""
    combined = ' '.join(
        (packet.get('ast_symbols') or []) +
        (packet.get('lexical_features') or []) +
        (packet.get('used_concepts') or [])
    )
    text = combined if combined else 'unknown'

    # Simple word splitting and TF calculation
    words = text.lower().split()
    vocab = vectorizer_data['vocabulary']
    idf_values = vectorizer_data['idf']
    max_features = vectorizer_data['max_features'] or 1000

    # Initialize sparse vector
    vector = [0.0] * len(vocab)

    # Count word frequencies
    word_counts = {}
    for word in words:
        # Only consider words in vocabulary
        if word in vocab:
            word_counts[word] = word_counts.get(word, 0) + 1

    # Compute TF-IDF values
    total_words = len(words)
    if total_words > 0:
        for word, count in word_counts.items():
            idx = vocab[word]
            if idx < len(idf_values):
                tf = count / total_words
                idf = idf_values[idx]
                vector[idx] = tf * idf

    # Normalize (L2 norm)
    norm = math.sqrt(sum(x**2 for x in vector))
    if norm > 0:
        vector = [x / norm for x in vector]

    return vector

def multinomial_nb_predict(vector: List[float], model_data: Dict) -> tuple:
    """
    Naive Bayes prediction using log probabilities.
    Returns (predicted_class, confidence).
    """
    classes = model_data['classes']
    class_log_prior = model_data['class_log_prior']
    feature_log_prob = model_data['feature_log_prob']

    # Compute log posterior for each class
    posteriors = []
    for class_idx, prior in enumerate(class_log_prior):
        posterior = prior
        feature_probs = feature_log_prob[class_idx]

        # Add log likelihoods
        for feature_idx, feature_val in enumerate(vector):
            if feature_idx < len(feature_probs) and feature_val > 0:
                posterior += feature_val * feature_probs[feature_idx]

        posteriors.append(posterior)

    # Convert log posteriors to probabilities for confidence
    max_posterior = max(posteriors)
    posteriors = [p - max_posterior for p in posteriors]  # Numerical stability
    exp_posteriors = [math.exp(p) for p in posteriors]
    sum_exp = sum(exp_posteriors)
    probs = [p / sum_exp for p in exp_posteriors]

    # Get best class
    best_idx = int(np.argmax(probs))
    best_class = classes[best_idx]
    confidence = probs[best_idx]

    return best_class, confidence

def predict_packet(packet: Dict[str, Any], models_data: Dict, vectorizer_data: Dict) -> Dict[str, Any]:
    """Run inference for single packet, return predictions."""
    try:
        vector = vectorize_packet(packet, vectorizer_data)

        predictions = {}
        confidences = {}

        for label_type in ['domain_class', 'feature_type', 'error_state', 'repair_lane']:
            if label_type in models_data:
                model_data = models_data[label_type]
                pred_label, confidence = multinomial_nb_predict(vector, model_data)
                predictions[label_type] = pred_label
                confidences[f'{label_type}_confidence'] = confidence

        return {
            'packet_key': packet['packet_key'],
            'naive_bayes_predictions': {
                'domain_class': predictions.get('domain_class', 'other'),
                'domain_class_confidence': confidences.get('domain_class_confidence', 0.0),
                'feature_type': predictions.get('feature_type', 'core'),
                'likely_error_state': predictions.get('error_state', 'VectorError'),
                'error_state_confidence': confidences.get('error_state_confidence', 0.0),
                'candidate_repair_lane': predictions.get('repair_lane', 'embedding_bridge'),
                'repair_lane_confidence': confidences.get('repair_lane_confidence', 0.0),
            }
        }
    except Exception as e:
        # Graceful fallback for packets that fail vectorization
        return {
            'packet_key': packet['packet_key'],
            'naive_bayes_predictions': {
                'domain_class': 'other',
                'domain_class_confidence': 0.0,
                'feature_type': 'core',
                'likely_error_state': 'VectorError',
                'error_state_confidence': 0.0,
                'candidate_repair_lane': 'embedding_bridge',
                'repair_lane_confidence': 0.0,
                'inference_error': str(e),
            }
        }

def main():
    """Read packets from stdin, predict, write JSON to stdout."""
    try:
        # Load models
        models_data, vectorizer_data = load_models_from_json()

        # Read input packets
        packets_json = sys.stdin.read()
        packets = json.loads(packets_json)

        # Run inference
        predictions = []
        for packet in packets:
            pred = predict_packet(packet, models_data, vectorizer_data)
            predictions.append(pred)

        # Write output
        sys.stdout.write(json.dumps(predictions))
        sys.stdout.flush()

    except Exception as e:
        # Error output goes to stderr, predictions go to stdout
        print(json.dumps([]), file=sys.stdout)  # Empty array on error
        print(f'ERROR: {str(e)}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
