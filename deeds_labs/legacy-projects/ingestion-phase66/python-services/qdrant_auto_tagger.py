#!/usr/bin/env python3
"""
Phase 66 Qdrant Auto-Tagging Pipeline
Automatic document categorization and tagging using vector similarity
"""

import os
import sys
import json
import logging
from typing import Dict, List, Optional, Any, Tuple
import time
import asyncio
from pathlib import Path

# Vector database
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# AI/ML libraries
import torch
import numpy as np
from transformers import AutoTokenizer, AutoModel
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
import re

# Message queue
import pika
import aio_pika

# Configuration
from dotenv import load_dotenv
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class QdrantAutoTagger:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")

        # Initialize embedding model
        self.model_name = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModel.from_pretrained(self.model_name).to(self.device)
        self.model.eval()

        # Initialize Qdrant client
        self.qdrant_client = QdrantClient(
            host=os.getenv('QDRANT_HOST', 'localhost'),
            port=int(os.getenv('QDRANT_PORT', 6333))
        )

        # Legal document categories and their representative examples
        self.category_templates = {
            'employment': [
                "This employment agreement is entered into between the employer and employee for the provision of services.",
                "The employee agrees to perform duties as specified in their job description and follow company policies.",
                "Compensation includes salary, benefits, and performance bonuses as outlined in the agreement."
            ],
            'nda': [
                "This non-disclosure agreement protects confidential information shared between the parties.",
                "The receiving party agrees not to disclose proprietary information to third parties.",
                "Confidential information includes trade secrets, business plans, and technical data."
            ],
            'service_contract': [
                "This service agreement outlines the terms for professional services to be provided.",
                "The service provider agrees to deliver specified services according to project milestones.",
                "Payment terms include invoicing schedule and conditions for service delivery."
            ],
            'license_agreement': [
                "This license agreement grants rights to use intellectual property under specified terms.",
                "The licensee receives non-exclusive rights to use the licensed technology.",
                "Royalty payments and usage restrictions are defined in the license terms."
            ],
            'lease': [
                "This lease agreement establishes the terms for property rental between landlord and tenant.",
                "The tenant agrees to pay rent and maintain the property according to lease terms.",
                "Lease duration, rent amount, and termination conditions are specified."
            ],
            'purchase_agreement': [
                "This purchase agreement outlines the terms for the sale of goods or services.",
                "The buyer agrees to purchase and the seller agrees to deliver specified items.",
                "Price, delivery terms, and warranty conditions are detailed in the agreement."
            ],
            'partnership': [
                "This partnership agreement establishes the terms of business partnership between parties.",
                "Partners agree to share profits, losses, and management responsibilities.",
                "Decision-making authority and dispute resolution procedures are defined."
            ],
            'loan_agreement': [
                "This loan agreement establishes the terms for lending money between parties.",
                "The borrower agrees to repay the principal plus interest according to the schedule.",
                "Collateral requirements and default conditions are specified in the agreement."
            ],
            'settlement': [
                "This settlement agreement resolves disputes between the involved parties.",
                "The parties agree to dismiss claims and release each other from liability.",
                "Settlement terms include payment amounts and confidentiality requirements."
            ],
            'power_of_attorney': [
                "This power of attorney document grants authority to act on behalf of the principal.",
                "The agent is authorized to make decisions and handle affairs as specified.",
                "The duration and scope of authority are clearly defined in the document."
            ]
        }

        # Initialize category embeddings
        self.category_embeddings = {}
        self.initialize_category_embeddings()

        # Clustering parameters
        self.n_clusters = 15  # Number of clusters for automatic categorization
        self.kmeans_model = None

    def initialize_category_embeddings(self):
        """Pre-compute embeddings for category templates"""
        logger.info("Initializing category embeddings...")

        for category, templates in self.category_templates.items():
            embeddings = []
            for template in templates:
                embedding = self.generate_embedding(template)
                embeddings.append(embedding)

            # Average embeddings for the category
            self.category_embeddings[category] = np.mean(embeddings, axis=0)

        logger.info(f"Initialized embeddings for {len(self.category_embeddings)} categories")

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generate embedding for text"""
        inputs = self.tokenizer(
            text,
            return_tensors='pt',
            padding=True,
            truncation=True,
            max_length=512
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model(**inputs)
            embedding = outputs.last_hidden_state.mean(dim=1).cpu().numpy().flatten()

        # Normalize
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding

    async def process_tagging_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a document tagging job"""
        job_id = job_data['job_id']
        document_id = job_data['document_id']
        text_chunks = job_data['text_chunks']
        metadata = job_data.get('metadata', {})

        logger.info(f"Processing tagging job {job_id} for document {document_id}")

        try:
            # Update job status
            self.update_job_status(job_id, "processing", "analyzing_content")

            # Generate embeddings for all chunks
            chunk_embeddings = []
            for chunk in text_chunks:
                embedding = self.generate_embedding(chunk)
                chunk_embeddings.append(embedding)

            # Document-level embedding (average of chunks)
            doc_embedding = np.mean(chunk_embeddings, axis=0)

            # Categorize document
            categories = self.categorize_document(doc_embedding, text_chunks)

            # Generate tags
            tags = self.generate_tags(text_chunks, categories)

            # Cluster similar chunks
            clusters = self.cluster_chunks(chunk_embeddings, text_chunks)

            # Store tagging results
            self.store_tagging_results(document_id, categories, tags, clusters, metadata)

            # Update final status
            self.update_job_status(job_id, "completed")

            logger.info(f"Successfully processed tagging job {job_id}")
            return {
                "status": "success",
                "categories": categories,
                "tags": tags,
                "clusters": len(clusters)
            }

        except Exception as e:
            logger.error(f"Error processing tagging job {job_id}: {str(e)}")
            self.update_job_status(job_id, "failed", error=str(e))
            raise

    def categorize_document(self, doc_embedding: np.ndarray, text_chunks: List[str]) -> List[Dict[str, Any]]:
        """Categorize document using template similarity"""
        categories = []

        # Calculate similarity to each category
        for category, category_embedding in self.category_embeddings.items():
            similarity = cosine_similarity(
                doc_embedding.reshape(1, -1),
                category_embedding.reshape(1, -1)
            )[0][0]

            categories.append({
                'category': category,
                'confidence': float(similarity),
                'description': self.get_category_description(category)
            })

        # Sort by confidence and return top categories
        categories.sort(key=lambda x: x['confidence'], reverse=True)

        # Filter categories above threshold
        threshold = 0.3
        filtered_categories = [cat for cat in categories if cat['confidence'] > threshold]

        return filtered_categories[:5]  # Return top 5 categories

    def get_category_description(self, category: str) -> str:
        """Get human-readable description for category"""
        descriptions = {
            'employment': 'Employment and HR agreements',
            'nda': 'Non-disclosure and confidentiality agreements',
            'service_contract': 'Service provision and consulting agreements',
            'license_agreement': 'IP licensing and technology transfer',
            'lease': 'Property and equipment leasing',
            'purchase_agreement': 'Sales and purchase of goods/services',
            'partnership': 'Business partnership formations',
            'loan_agreement': 'Lending and borrowing arrangements',
            'settlement': 'Dispute resolution and settlements',
            'power_of_attorney': 'Authority delegation documents'
        }
        return descriptions.get(category, category.replace('_', ' ').title())

    def generate_tags(self, text_chunks: List[str], categories: List[Dict[str, Any]]) -> List[str]:
        """Generate relevant tags for the document"""
        tags = set()

        # Add category-based tags
        for category_info in categories:
            category = category_info['category']
            tags.add(category.replace('_', '-'))

            # Add related tags
            related_tags = self.get_related_tags(category)
            tags.update(related_tags)

        # Extract keyword-based tags from content
        content_tags = self.extract_content_tags(text_chunks)
        tags.update(content_tags)

        # Extract legal entity tags
        entity_tags = self.extract_entity_tags(text_chunks)
        tags.update(entity_tags)

        return list(tags)

    def get_related_tags(self, category: str) -> List[str]:
        """Get related tags for a category"""
        related_tags_map = {
            'employment': ['hr', 'compensation', 'benefits', 'termination', 'at-will'],
            'nda': ['confidentiality', 'trade-secrets', 'proprietary', 'disclosure'],
            'service_contract': ['consulting', 'professional-services', 'milestones', 'deliverables'],
            'license_agreement': ['ip', 'royalty', 'intellectual-property', 'patent'],
            'lease': ['rental', 'property', 'tenant', 'landlord', 'occupancy'],
            'purchase_agreement': ['sale', 'vendor', 'procurement', 'supply-chain'],
            'partnership': ['joint-venture', 'llc', 'management', 'profit-sharing'],
            'loan_agreement': ['finance', 'interest', 'collateral', 'repayment'],
            'settlement': ['dispute', 'resolution', 'mediation', 'release'],
            'power_of_attorney': ['authority', 'delegation', 'agent', 'principal']
        }
        return related_tags_map.get(category, [])

    def extract_content_tags(self, text_chunks: List[str]) -> List[str]:
        """Extract tags from document content"""
        tags = set()
        content = ' '.join(text_chunks).lower()

        # Legal keywords that indicate document types
        keyword_tags = {
            'arbitration': 'arbitration',
            'litigation': 'litigation',
            'mediation': 'mediation',
            'court': 'court-proceeding',
            'jurisdiction': 'jurisdiction-specific',
            'international': 'international',
            'compliance': 'regulatory-compliance',
            'regulatory': 'regulation',
            'environmental': 'environmental',
            'intellectual property': 'ip',
            'patent': 'patent',
            'trademark': 'trademark',
            'copyright': 'copyright',
            'data protection': 'data-privacy',
            'gdpr': 'gdpr',
            'hipaa': 'healthcare',
            'finance': 'financial',
            'banking': 'banking',
            'insurance': 'insurance',
            'healthcare': 'healthcare',
            'technology': 'technology',
            'software': 'software',
            'construction': 'construction',
            'real estate': 'real-estate'
        }

        for keyword, tag in keyword_tags.items():
            if keyword in content:
                tags.add(tag)

        return list(tags)

    def extract_entity_tags(self, text_chunks: List[str]) -> List[str]:
        """Extract entity-based tags"""
        tags = set()
        content = ' '.join(text_chunks)

        # Simple entity extraction patterns
        entity_patterns = [
            (r'\b\d+(?:\.\d+)?\s*(?:%|percent)\b', 'percentage-based'),
            (r'\$\d+(?:,\d{3})*(?:\.\d{2})?', 'monetary'),
            (r'\b\d{4}-\d{4}\b', 'date-range'),
            (r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b', 'dated'),
            (r'\b\d+\s+(?:day|month|year)s?\b', 'time-based'),
            (r'\b(?:shall|must|will|agree to|obligated to)\b', 'obligation-heavy'),
            (r'\b(?:may|optional|discretion)\b', 'discretionary')
        ]

        for pattern, tag in entity_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                tags.add(tag)

        return list(tags)

    def cluster_chunks(self, embeddings: List[np.ndarray], text_chunks: List[str]) -> List[Dict[str, Any]]:
        """Cluster similar text chunks"""
        if len(embeddings) < self.n_clusters:
            # Not enough chunks for meaningful clustering
            return [{'cluster_id': 0, 'chunks': text_chunks, 'size': len(text_chunks)}]

        # Convert to numpy array
        embedding_matrix = np.array(embeddings)

        # Fit K-means
        if self.kmeans_model is None:
            self.kmeans_model = KMeans(n_clusters=self.n_clusters, random_state=42, n_init=10)
            self.kmeans_model.fit(embedding_matrix)
        else:
            # Update existing model with new data
            self.kmeans_model = self.kmeans_model.fit(embedding_matrix)

        # Get cluster assignments
        cluster_labels = self.kmeans_model.predict(embedding_matrix)

        # Group chunks by cluster
        clusters = {}
        for i, (chunk, label) in enumerate(zip(text_chunks, cluster_labels)):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append({
                'index': i,
                'text': chunk,
                'embedding': embeddings[i].tolist()
            })

        # Convert to list format
        cluster_list = []
        for cluster_id, chunks in clusters.items():
            cluster_list.append({
                'cluster_id': int(cluster_id),
                'chunks': chunks,
                'size': len(chunks),
                'centroid': self.kmeans_model.cluster_centers_[cluster_id].tolist()
            })

        return cluster_list

    def store_tagging_results(self, document_id: str, categories: List[Dict[str, Any]],
                            tags: List[str], clusters: List[Dict[str, Any]], metadata: Dict[str, Any]):
        """Store tagging results in Qdrant"""
        collection_name = "document_tags"

        # Ensure collection exists
        if not self.qdrant_client.collection_exists(collection_name):
            self.qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config={
                    "categories": VectorParams(
                        size=len(next(iter(self.category_embeddings.values()))),
                        distance=Distance.COSINE
                    )
                }
            )

        # Create point with tagging results
        point = PointStruct(
            id=document_id,
            vector={
                "categories": np.mean([cat_emb for cat_emb in self.category_embeddings.values()], axis=0).tolist()
            },
            payload={
                "document_id": document_id,
                "categories": categories,
                "tags": tags,
                "clusters": clusters,
                "metadata": metadata,
                "tagged_at": int(time.time()),
                "tagger_version": "1.0.0"
            }
        )

        # Upsert point
        self.qdrant_client.upsert(
            collection_name=collection_name,
            points=[point]
        )

    def update_job_status(self, job_id: str, status: str, stage: str = None, error: str = None):
        """Update job status in Redis"""
        import redis
        redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            decode_responses=True
        )

        redis_client.hset(f"job:{job_id}", "status", status)
        if stage:
            redis_client.hset(f"job:{job_id}", "stage", stage)
        if error:
            redis_client.hset(f"job:{job_id}", "error", error)
        redis_client.hset(f"job:{job_id}", "updated_at", str(int(time.time())))

    async def run_tagger(self):
        """Main tagger loop"""
        connection = await aio_pika.connect_robust(
            host=os.getenv('RABBITMQ_HOST', 'localhost'),
            port=int(os.getenv('RABBITMQ_PORT', 5672)),
            login=os.getenv('RABBITMQ_USER', 'guest'),
            password=os.getenv('RABBITMQ_PASSWORD', 'guest')
        )

        async with connection:
            channel = await connection.channel()
            queue = await channel.declare_queue('tagging_queue', durable=True)

            logger.info("Qdrant Auto-Tagger started, waiting for jobs...")

            async for message in queue:
                async with message.process():
                    try:
                        job_data = json.loads(message.body.decode())
                        result = await self.process_tagging_job(job_data)
                        logger.info(f"Job completed: {result}")
                    except Exception as e:
                        logger.error(f"Job failed: {str(e)}")
                        # Message will be re-queued or sent to dead letter queue

if __name__ == "__main__":
    tagger = QdrantAutoTagger()
    asyncio.run(tagger.run_tagger())