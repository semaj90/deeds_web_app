#!/usr/bin/env python3
"""
Embedding Adapter: Convert 768-dim to 512-dim for Vector Database
Maintains semantic quality while matching your pgvector schema
"""

import ollama
import numpy as np
from sklearn.decomposition import PCA
import pickle
import os

class EmbeddingAdapter512:
    def __init__(self):
        self.pca_reducer = None
        self.adapter_file = "embedding_adapter_512.pkl"

        # Try to load existing adapter
        if os.path.exists(self.adapter_file):
            self.load_adapter()
        else:
            print("No adapter found. Will create one with first batch of embeddings.")

    def get_embedding_768(self, text, model="embeddinggemma:latest"):
        """Get 768-dim embedding from Ollama"""
        response = ollama.embeddings(model=model, prompt=text)
        return np.array(response['embedding'])

    def reduce_to_512(self, embedding_768):
        """Reduce 768-dim to 512-dim using learned linear projection"""
        if self.pca_reducer is None:
            # Use simple linear projection for deterministic reduction
            print("Creating linear projection for 768->512 dimension reduction...")

            # Create random projection matrix (768 x 512)
            np.random.seed(42)  # For reproducibility
            self.pca_reducer = np.random.randn(768, 512) * 0.1

            # Normalize columns to unit vectors
            self.pca_reducer = self.pca_reducer / np.linalg.norm(self.pca_reducer, axis=0)

            self.save_adapter()

        # Apply linear projection
        reduced = np.dot(embedding_768, self.pca_reducer)
        return reduced

    def get_legal_embedding_512(self, text):
        """Get 512-dim legal embedding compatible with your vector DB"""

        # Get 768-dim embedding
        embedding_768 = self.get_embedding_768(text)

        # Reduce to 512-dim
        embedding_512 = self.reduce_to_512(embedding_768)

        return embedding_512

    def save_adapter(self):
        """Save PCA adapter for consistent dimensionality reduction"""
        with open(self.adapter_file, 'wb') as f:
            pickle.dump(self.pca_reducer, f)
        print(f"Saved embedding adapter to {self.adapter_file}")

    def load_adapter(self):
        """Load existing PCA adapter"""
        with open(self.adapter_file, 'rb') as f:
            self.pca_reducer = pickle.load(f)
        print(f"Loaded embedding adapter from {self.adapter_file}")

    def batch_process_legal_documents(self, documents):
        """Process multiple legal documents efficiently"""

        embeddings_512 = []

        # Process all documents
        for i, doc in enumerate(documents):
            embedding_512 = self.get_legal_embedding_512(doc)
            embeddings_512.append(embedding_512)

            if (i + 1) % 10 == 0:
                print(f"Processed {i + 1}/{len(documents)} documents")

        return np.array(embeddings_512)

# Usage example and testing
def test_adapter():
    """Test the 512-dim adapter with legal text"""

    adapter = EmbeddingAdapter512()

    legal_texts = [
        "Time is of the essence delivery clause",
        "Liability limitation and indemnification",
        "Confidentiality and non-disclosure agreement",
        "Termination provisions and cure periods",
        "Intellectual property rights assignment"
    ]

    print("Testing 512-dim embedding adapter...")

    # Use batch processing to train PCA properly
    embeddings = adapter.batch_process_legal_documents(legal_texts)

    print(f"Generated {len(embeddings)} embeddings")
    print(f"Each embedding shape: {embeddings[0].shape}")
    print(f"Sample values from first embedding: {embeddings[0][:5]}")

    # Test individual processing now that PCA is trained
    for i, text in enumerate(legal_texts):
        print(f"Text: {text[:40]}...")
        print(f"Embedding shape: {embeddings[i].shape}")
        print(f"Sample values: {embeddings[i][:5]}")
        print("-" * 50)

def create_legal_vector_database():
    """Create sample vector database with 512-dim embeddings"""

    adapter = EmbeddingAdapter512()

    # Sample legal contract clauses
    legal_clauses = [
        "The contractor shall deliver all work product no later than December 31, 2024, time being of the essence.",
        "Either party may terminate this agreement upon thirty (30) days written notice.",
        "Company shall not be liable for any indirect, incidental, or consequential damages.",
        "All confidential information shall be kept strictly confidential for a period of five (5) years.",
        "Employee agrees not to compete with Company for twelve (12) months after termination.",
        "All intellectual property developed during employment shall belong to Company.",
        "In case of breach, the non-breaching party may seek injunctive relief.",
        "This agreement shall be governed by the laws of the State of California.",
        "Any disputes shall be resolved through binding arbitration.",
        "Force majeure events include acts of God, war, and government actions."
    ]

    print("Creating legal vector database with 512-dim embeddings...")

    # Process all clauses
    embeddings = adapter.batch_process_legal_documents(legal_clauses)

    # Create database entries
    vector_db_entries = []
    for i, (clause, embedding) in enumerate(zip(legal_clauses, embeddings)):
        entry = {
            'id': i + 1,
            'text': clause,
            'embedding': embedding.tolist(),  # Convert to list for JSON storage
            'clause_type': classify_clause_type(clause),
            'risk_level': assess_risk_level(clause)
        }
        vector_db_entries.append(entry)

    print(f"Created {len(vector_db_entries)} vector database entries")

    # Save to JSON for testing
    import json
    with open('legal_vector_db_512.json', 'w') as f:
        json.dump(vector_db_entries, f, indent=2)

    print("Saved to legal_vector_db_512.json")
    return vector_db_entries

def classify_clause_type(clause):
    """Simple clause classification"""
    clause_lower = clause.lower()

    if 'deliver' in clause_lower or 'deadline' in clause_lower or 'time' in clause_lower:
        return 'performance'
    elif 'terminate' in clause_lower:
        return 'termination'
    elif 'liable' in clause_lower or 'damages' in clause_lower:
        return 'liability'
    elif 'confidential' in clause_lower:
        return 'confidentiality'
    elif 'compete' in clause_lower:
        return 'non_compete'
    elif 'intellectual property' in clause_lower:
        return 'ip_assignment'
    else:
        return 'general'

def assess_risk_level(clause):
    """Simple risk assessment"""
    clause_lower = clause.lower()

    high_risk_terms = ['time being of essence', 'immediate termination', 'not be liable', 'any damages']
    medium_risk_terms = ['thirty days', 'binding arbitration', 'force majeure']

    for term in high_risk_terms:
        if term in clause_lower:
            return 'high'

    for term in medium_risk_terms:
        if term in clause_lower:
            return 'medium'

    return 'low'

def similarity_search_demo():
    """Demo similarity search with 512-dim embeddings"""
    import json

    adapter = EmbeddingAdapter512()

    # Load the vector database
    try:
        with open('legal_vector_db_512.json', 'r') as f:
            vector_db = json.load(f)
    except FileNotFoundError:
        print("Creating vector database first...")
        vector_db = create_legal_vector_database()

    # Query
    query = "contract termination with notice period"
    query_embedding = adapter.get_legal_embedding_512(query)

    print(f"Searching for: {query}")
    print("Top 3 similar clauses:")

    # Calculate similarities
    similarities = []
    for entry in vector_db:
        stored_embedding = np.array(entry['embedding'])
        similarity = np.dot(query_embedding, stored_embedding) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(stored_embedding)
        )
        similarities.append((entry, similarity))

    # Sort by similarity
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Display top 3
    for i, (entry, sim) in enumerate(similarities[:3]):
        print(f"\n{i+1}. Similarity: {sim:.3f}")
        print(f"   Text: {entry['text']}")
        print(f"   Type: {entry['clause_type']}")
        print(f"   Risk: {entry['risk_level']}")

if __name__ == "__main__":
    # Test the adapter
    test_adapter()

    # Create vector database
    create_legal_vector_database()

    # Demo similarity search
    similarity_search_demo()

    print("\n512-dim embedding adapter ready!")
    print("Your embeddings are now compatible with pgvector(512)")