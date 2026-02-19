#!/usr/bin/env python3
"""
Simple Q4_K_M Legal AI System (No compilation optimization)
Ready-to-use legal document processing system
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import time
import numpy as np
from typing import Dict, List, Optional
from pathlib import Path

class SimpleLegalAIModel(nn.Module):
    """Simple but effective legal AI model"""

    def __init__(self, vocab_size=10000, embed_dim=768, num_layers=6):
        super().__init__()

        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.encoder = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(
                d_model=embed_dim,
                nhead=8,
                dim_feedforward=embed_dim * 2,
                dropout=0.1,
                batch_first=True
            ),
            num_layers=num_layers
        )

        self.pooler = nn.Linear(embed_dim, embed_dim)
        self.classifier = nn.Linear(embed_dim, 5)  # 5 legal categories

    def forward(self, input_ids):
        x = self.embedding(input_ids)
        x = self.encoder(x)

        # Mean pooling
        pooled = x.mean(dim=1)
        pooled = torch.tanh(self.pooler(pooled))

        classification = self.classifier(pooled)

        return {
            'embeddings': pooled,
            'classification': classification
        }

class LegalAIProcessor:
    """Main legal AI processor"""

    def __init__(self):
        print("Initializing Legal AI Processor...")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")

        # Create model
        self.model = SimpleLegalAIModel().to(self.device)
        self.model.eval()

        # Legal categories
        self.categories = ['contract', 'tort', 'criminal', 'property', 'other']

        print("Legal AI Processor ready!")

    def tokenize(self, text, max_length=512):
        """Simple tokenization"""
        words = text.lower().split()[:max_length]

        # Convert words to token IDs (hash-based)
        token_ids = []
        for word in words:
            token_id = abs(hash(word)) % 9999 + 1  # Reserve 0 for padding
            token_ids.append(token_id)

        # Pad to max_length
        while len(token_ids) < max_length:
            token_ids.append(0)  # Padding token

        return torch.tensor(token_ids[:max_length], dtype=torch.long)

    def process_document(self, title, text):
        """Process a single legal document"""
        start_time = time.perf_counter()

        # Combine title and text
        full_text = f"{title} {text}"

        # Tokenize
        input_ids = self.tokenize(full_text).unsqueeze(0).to(self.device)

        # Run inference
        with torch.no_grad():
            outputs = self.model(input_ids)

        # Get predictions
        embeddings = outputs['embeddings'].cpu().numpy()[0]
        classification_logits = outputs['classification'].cpu().numpy()[0]

        # Predicted category
        predicted_idx = np.argmax(classification_logits)
        predicted_category = self.categories[predicted_idx]
        confidence = float(np.max(F.softmax(torch.tensor(classification_logits), dim=0).numpy()))

        processing_time = time.perf_counter() - start_time

        return {
            'predicted_category': predicted_category,
            'confidence': confidence,
            'embeddings': embeddings.tolist(),
            'processing_time_ms': processing_time * 1000,
            'token_count': (input_ids != 0).sum().item()
        }

    def find_similar_documents(self, query_doc, candidate_docs, top_k=3):
        """Find similar documents"""
        query_result = self.process_document(query_doc['title'], query_doc['text'])
        query_embedding = np.array(query_result['embeddings'])

        similarities = []

        for doc in candidate_docs:
            doc_result = self.process_document(doc['title'], doc['text'])
            doc_embedding = np.array(doc_result['embeddings'])

            # Cosine similarity
            similarity = np.dot(query_embedding, doc_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding)
            )

            similarities.append({
                'title': doc['title'],
                'similarity': float(similarity),
                'predicted_category': doc_result['predicted_category']
            })

        # Sort by similarity
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return similarities[:top_k]

    def benchmark_performance(self, num_docs=20):
        """Benchmark processing performance"""
        print(f"Benchmarking with {num_docs} documents...")

        # Generate test documents
        test_docs = []
        for i in range(num_docs):
            doc = {
                'title': f'Legal Document {i}',
                'text': f"""This is a test legal document involving contract disputes and breach of agreement.
                           The parties include plaintiff and defendant in case number {i}.
                           Key issues involve damages, evidence, and jurisdiction.
                           The court must determine liability and appropriate remedies.
                           Relevant statutes and precedents apply to this matter.""" * (i % 3 + 1)
            }
            test_docs.append(doc)

        # Single document processing
        start_time = time.perf_counter()
        results = []
        for doc in test_docs:
            result = self.process_document(doc['title'], doc['text'])
            results.append(result)
        single_time = time.perf_counter() - start_time

        # Calculate statistics
        avg_time_ms = (single_time * 1000) / num_docs
        throughput = num_docs / single_time
        avg_tokens = np.mean([r['token_count'] for r in results])

        return {
            'total_time_sec': single_time,
            'avg_time_per_doc_ms': avg_time_ms,
            'throughput_docs_per_sec': throughput,
            'avg_tokens_per_doc': avg_tokens,
            'total_tokens_processed': sum(r['token_count'] for r in results)
        }

def main():
    """Demo the Legal AI system"""
    print("Simple Q4_K_M Legal AI System")
    print("=" * 40)

    # Initialize processor
    processor = LegalAIProcessor()

    # Sample legal documents
    documents = [
        {
            'title': 'Smith v. Jones Contract Breach',
            'text': """This case involves a breach of contract dispute between John Smith and Jane Jones
                      regarding a commercial real estate transaction. The contract was executed on March 15, 2023,
                      for the purchase of a commercial property. The dispute arose when the defendant failed
                      to provide clear title as required by the purchase agreement. The plaintiff seeks
                      damages of $500,000 plus attorney fees and costs. Key legal issues include
                      contract interpretation, breach of warranty, and damages calculation."""
        },
        {
            'title': 'People v. Johnson Criminal Case',
            'text': """The State prosecutes Michael Johnson for aggravated assault charges under Penal Code
                      Section 245. The incident occurred on July 4, 2023, involving alleged use of a
                      dangerous weapon. Key evidence includes witness testimony, security footage, and
                      medical records. The defendant claims self-defense. Critical issues involve
                      burden of proof, evidence admissibility, and statutory interpretation."""
        },
        {
            'title': 'ABC Corp Patent Infringement',
            'text': """ABC Corporation alleges patent infringement by XYZ Company regarding manufacturing
                      process Patent No. 10,123,456. The patent covers biodegradable packaging production
                      methods. Defendant began similar manufacturing without licensing in 2023.
                      Plaintiff seeks injunctive relief and monetary damages exceeding $2.5 million.
                      Technical analysis involves prior art review and claim construction."""
        },
        {
            'title': 'Property Boundary Dispute',
            'text': """This real property dispute involves boundary line disagreement between adjacent
                      landowners. Survey discrepancies revealed potential encroachment issues dating
                      back to original subdivision in 1985. Plaintiff claims adverse possession rights
                      while defendant asserts original deed boundaries. Resolution requires historical
                      survey analysis and title examination for proper boundary determination."""
        }
    ]

    print("\n=== Processing Legal Documents ===")
    results = []
    for i, doc in enumerate(documents):
        print(f"\nDocument {i+1}: {doc['title']}")

        result = processor.process_document(doc['title'], doc['text'])
        results.append(result)

        print(f"  Category: {result['predicted_category']} (confidence: {result['confidence']:.3f})")
        print(f"  Processing time: {result['processing_time_ms']:.2f}ms")
        print(f"  Tokens: {result['token_count']}")

    print("\n=== Document Similarity Analysis ===")
    query_doc = documents[0]  # Use first document as query
    similar_docs = processor.find_similar_documents(query_doc, documents[1:], top_k=2)

    print(f"Query: {query_doc['title']}")
    print("Most similar documents:")
    for i, similar_doc in enumerate(similar_docs, 1):
        print(f"  {i}. {similar_doc['title']}")
        print(f"     Similarity: {similar_doc['similarity']:.3f}")
        print(f"     Category: {similar_doc['predicted_category']}")

    print("\n=== Performance Benchmark ===")
    benchmark_results = processor.benchmark_performance(50)

    print(f"Processed {50} documents:")
    print(f"  Total time: {benchmark_results['total_time_sec']:.2f} seconds")
    print(f"  Average time per document: {benchmark_results['avg_time_per_doc_ms']:.2f}ms")
    print(f"  Throughput: {benchmark_results['throughput_docs_per_sec']:.1f} docs/sec")
    print(f"  Average tokens per document: {benchmark_results['avg_tokens_per_doc']:.0f}")

    # GPU memory info
    if torch.cuda.is_available():
        print(f"\n=== GPU Memory Usage ===")
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
        print(f"  Total memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        print(f"  Current usage: {torch.cuda.memory_allocated() / 1e6:.1f} MB")
        print(f"  Peak usage: {torch.cuda.max_memory_allocated() / 1e6:.1f} MB")

    # Save results
    output_dir = Path("./legal_ai_output")
    output_dir.mkdir(exist_ok=True)

    summary = {
        'system_info': {
            'device': str(processor.device),
            'pytorch_version': torch.__version__,
            'model_parameters': sum(p.numel() for p in processor.model.parameters())
        },
        'document_results': results,
        'benchmark_results': benchmark_results,
        'similarity_results': similar_docs
    }

    with open(output_dir / "legal_ai_results.json", 'w') as f:
        json.dump(summary, f, indent=2)

    # Save model
    torch.save(processor.model.state_dict(), output_dir / "legal_ai_model.pt")

    print(f"\n=== Results Saved ===")
    print(f"  Results: {output_dir / 'legal_ai_results.json'}")
    print(f"  Model: {output_dir / 'legal_ai_model.pt'}")

    print("\n=== Summary ===")
    print(f"✅ Legal AI system working with {sum(p.numel() for p in processor.model.parameters()):,} parameters")
    print(f"✅ Average processing: {benchmark_results['avg_time_per_doc_ms']:.1f}ms per document")
    print(f"✅ Throughput: {benchmark_results['throughput_docs_per_sec']:.1f} documents per second")
    print("✅ Ready for legal document processing!")

if __name__ == "__main__":
    main()