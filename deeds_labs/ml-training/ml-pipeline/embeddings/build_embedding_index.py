#!/usr/bin/env python3
"""
Phase 46: Embedding Index Builder
Creates vector embeddings from AST graphs using EmbeddingGemma
"""

import os
import json
import torch
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional
from transformers import AutoTokenizer, AutoModel
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import argparse
import logging
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import hashlib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class EmbeddingConfig:
    """Configuration for embedding generation"""
    model_name: str = "google/embeddinggemma-300m-v1.0"
    max_length: int = 512
    batch_size: int = 32
    device: str = "auto"
    qdrant_url: str = "http://localhost:6333"
    collection_name: str = "code_embeddings"
    vector_dim: int = 384  # EmbeddingGemma dimension

class EmbeddingBuilder:
    """Builds embeddings from AST data and stores in Qdrant"""

    def __init__(self, config: EmbeddingConfig):
        self.config = config
        self.device = self._setup_device()
        self.tokenizer = None
        self.model = None
        self.qdrant_client = None

    def _setup_device(self) -> str:
        """Setup compute device"""
        if self.config.device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch, 'backends') and hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        return self.config.device

    def load_model(self):
        """Load EmbeddingGemma model and tokenizer"""
        logger.info(f"Loading {self.config.model_name} on {self.device}")

        self.tokenizer = AutoTokenizer.from_pretrained(self.config.model_name)
        self.model = AutoModel.from_pretrained(self.config.model_name)

        # Move to device
        self.model.to(self.device)
        self.model.eval()

        logger.info("Model loaded successfully")

    def connect_qdrant(self):
        """Connect to Qdrant vector database"""
        try:
            self.qdrant_client = QdrantClient(url=self.config.qdrant_url)

            # Create collection if it doesn't exist
            self.qdrant_client.create_collection(
                collection_name=self.config.collection_name,
                vectors_config=VectorParams(
                    size=self.config.vector_dim,
                    distance=Distance.COSINE
                )
            )
            logger.info(f"Connected to Qdrant collection: {self.config.collection_name}")

        except Exception as e:
            logger.error(f"Failed to connect to Qdrant: {e}")
            raise

    def process_ast_file(self, ast_file: str) -> List[Dict[str, Any]]:
        """Process AST JSONL file and extract text chunks"""
        chunks = []

        with open(ast_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f):
                try:
                    data = json.loads(line.strip())
                    code_file = data

                    # Create chunks from different parts of the code
                    chunks.extend(self._extract_chunks_from_file(code_file, line_num))

                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse line {line_num}: {e}")
                    continue

        return chunks

    def _extract_chunks_from_file(self, code_file: Dict[str, Any], file_id: int) -> List[Dict[str, Any]]:
        """Extract text chunks from a parsed code file"""
        chunks = []

        filepath = code_file.get('filepath', '')
        language = code_file.get('language', '')
        content = code_file.get('content', '')
        ast_nodes = code_file.get('ast_nodes', [])
        functions = code_file.get('functions', [])
        classes = code_file.get('classes', [])

        # Create file-level chunk
        file_chunk = {
            'id': f"file_{file_id}",
            'text': f"File: {filepath}\nLanguage: {language}\n\n{content[:2000]}...",  # Truncate for embedding
            'metadata': {
                'type': 'file',
                'filepath': filepath,
                'language': language,
                'functions': functions,
                'classes': classes
            }
        }
        chunks.append(file_chunk)

        # Create function-level chunks
        for func in functions:
            func_text = self._extract_function_context(content, func)
            if func_text:
                func_chunk = {
                    'id': f"func_{file_id}_{hashlib.md5(func.encode()).hexdigest()[:8]}",
                    'text': f"Function: {func}\n{func_text}",
                    'metadata': {
                        'type': 'function',
                        'filepath': filepath,
                        'language': language,
                        'function_name': func
                    }
                }
                chunks.append(func_chunk)

        # Create class-level chunks
        for cls in classes:
            class_text = self._extract_class_context(content, cls)
            if class_text:
                class_chunk = {
                    'id': f"class_{file_id}_{hashlib.md5(cls.encode()).hexdigest()[:8]}",
                    'text': f"Class: {cls}\n{class_text}",
                    'metadata': {
                        'type': 'class',
                        'filepath': filepath,
                        'language': language,
                        'class_name': cls
                    }
                }
                chunks.append(class_chunk)

        # Create AST node chunks
        for node in ast_nodes[:10]:  # Limit to first 10 nodes per file
            node_text = node.get('content', '')
            if len(node_text) > 50:  # Only substantial nodes
                node_chunk = {
                    'id': f"node_{file_id}_{node.get('id', 'unknown')}",
                    'text': f"Code: {node_text}",
                    'metadata': {
                        'type': 'ast_node',
                        'filepath': filepath,
                        'language': language,
                        'node_type': node.get('type', ''),
                        'start_line': node.get('start_line', 0)
                    }
                }
                chunks.append(node_chunk)

        return chunks

    def _extract_function_context(self, content: str, func_name: str) -> str:
        """Extract function definition and body"""
        # Simple regex-based extraction
        pattern = rf'(?:function|const|let|var|def)\s+{re.escape(func_name)}\s*\([^)]*\)\s*{{[^}}]*}}'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            return match.group(0)
        return ""

    def _extract_class_context(self, content: str, class_name: str) -> str:
        """Extract class definition and methods"""
        # Simple regex-based extraction
        pattern = rf'class\s+{re.escape(class_name)}\s*{{[^}}]*}}'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            return match.group(0)
        return ""

    def generate_embeddings(self, chunks: List[Dict[str, Any]]) -> List[np.ndarray]:
        """Generate embeddings for text chunks"""
        embeddings = []

        for i in range(0, len(chunks), self.config.batch_size):
            batch = chunks[i:i + self.config.batch_size]
            texts = [chunk['text'] for chunk in batch]

            # Tokenize
            inputs = self.tokenizer(
                texts,
                max_length=self.config.max_length,
                padding=True,
                truncation=True,
                return_tensors="pt"
            )

            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Generate embeddings
            with torch.no_grad():
                outputs = self.model(**inputs)
                # Use mean pooling
                embeddings_batch = outputs.last_hidden_state.mean(dim=1).cpu().numpy()

            embeddings.extend(embeddings_batch)

            logger.info(f"Processed {len(embeddings)}/{len(chunks)} chunks")

        return embeddings

    def store_embeddings(self, chunks: List[Dict[str, Any]], embeddings: List[np.ndarray]):
        """Store embeddings in Qdrant"""
        points = []

        for chunk, embedding in zip(chunks, embeddings):
            point = PointStruct(
                id=chunk['id'],
                vector=embedding.tolist(),
                payload={
                    'text': chunk['text'],
                    'metadata': chunk['metadata']
                }
            )
            points.append(point)

        # Upload in batches
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            self.qdrant_client.upsert(
                collection_name=self.config.collection_name,
                points=batch
            )
            logger.info(f"Uploaded {len(batch)} points to Qdrant")

    def build_index(self, ast_file: str):
        """Main pipeline: AST -> Embeddings -> Qdrant"""
        logger.info("Starting embedding index build")

        # Load model
        self.load_model()

        # Connect to Qdrant
        self.connect_qdrant()

        # Process AST file
        logger.info(f"Processing AST file: {ast_file}")
        chunks = self.process_ast_file(ast_file)
        logger.info(f"Extracted {len(chunks)} text chunks")

        # Generate embeddings
        logger.info("Generating embeddings...")
        embeddings = self.generate_embeddings(chunks)

        # Store in Qdrant
        logger.info("Storing embeddings in Qdrant...")
        self.store_embeddings(chunks, embeddings)

        logger.info("Embedding index build complete!")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Build code embeddings from AST")
    parser.add_argument("ast_file", help="Path to AST JSONL file")
    parser.add_argument("--model", default="google/embeddinggemma-300m-v1.0", help="Embedding model name")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size for embedding")
    parser.add_argument("--qdrant-url", default="http://localhost:6333", help="Qdrant URL")
    parser.add_argument("--collection", default="code_embeddings", help="Qdrant collection name")
    parser.add_argument("--device", default="auto", help="Compute device (auto/cuda/cpu)")

    args = parser.parse_args()

    config = EmbeddingConfig(
        model_name=args.model,
        batch_size=args.batch_size,
        qdrant_url=args.qdrant_url,
        collection_name=args.collection,
        device=args.device
    )

    builder = EmbeddingBuilder(config)
    builder.build_index(args.ast_file)

if __name__ == "__main__":
    main()