#!/usr/bin/env python3
"""
Embedding Service using embeddinggemma:latest (768-dim)
Handles file ingestion and vector generation for the legal AI platform.
"""

import argparse
import json
import hashlib
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import asyncio
import aiofiles
import torch
from transformers import AutoTokenizer, AutoModel
import numpy as np
from minio import Minio
import psycopg2
from psycopg2.extras import Json
import logging
from PIL import Image
import fitz  # PyMuPDF for PDF processing
import io

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_name = 'google/gemma-3-2b'  # Gemma-3 VLM base model (2B parameters)
        self.model = None
        self.processor = None  # Unified processor for vision + text
        self.minio_client = None
        self.db_conn = None

        # Configuration
        self.max_chunk_size = 2000  # characters
        self.chunk_overlap = 200    # characters
        self.embedding_dim = 1024   # Gemma-3 VLM dimension (increased from 768)

        # Initialize connections
        self._init_minio()
        self._init_database()

    def _init_minio(self):
        """Initialize MinIO client"""
        # Allow disabling MinIO for local tests
        if os.getenv('DISABLE_MINIO', 'false').lower() in ('true', '1', 'yes'):
            logger.info("MinIO disabled for local testing")
            self.minio_client = None
            return

        try:
            self.minio_client = Minio(
                os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
                access_key=os.getenv('MINIO_ACCESS_KEY', 'minioadmin'),
                secret_key=os.getenv('MINIO_SECRET_KEY', 'minioadmin'),
                secure=False
            )

            # Ensure bucket exists
            bucket_name = 'code-docs'
            if not self.minio_client.bucket_exists(bucket_name):
                self.minio_client.make_bucket(bucket_name)
                logger.info(f"Created MinIO bucket: {bucket_name}")

        except Exception as e:
            logger.error(f"Failed to initialize MinIO: {e}")
            self.minio_client = None

    def _init_database(self):
        """Initialize PostgreSQL connection"""
        try:
            self.db_conn = psycopg2.connect(
                host=os.getenv('POSTGRES_HOST', 'localhost'),
                port=int(os.getenv('POSTGRES_PORT', '5432')),
                database=os.getenv('POSTGRES_DB', 'legal_ai_db'),
                user=os.getenv('POSTGRES_USER', 'postgres'),
                password=os.getenv('POSTGRES_PASSWORD', 'password')
            )
            self.db_conn.autocommit = True

            # Create tables if they don't exist
            self._create_tables()

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            self.db_conn = None

    def _create_tables(self):
        """Create necessary database tables"""
        if not self.db_conn:
            return

        try:
            with self.db_conn.cursor() as cursor:
                # Create embeddings table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS document_embeddings (
                        id SERIAL PRIMARY KEY,
                        path TEXT NOT NULL,
                        hash TEXT NOT NULL,
                        embedding_model TEXT NOT NULL,
                        embedding_vector VECTOR(1024),
                        summary TEXT,
                        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        chunk_index INTEGER DEFAULT 0,
                        total_chunks INTEGER DEFAULT 1,
                        UNIQUE(path, hash, chunk_index)
                    )
                """)

                # Create file summaries table (avoid duplication)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS file_summaries (
                        id SERIAL PRIMARY KEY,
                        path TEXT NOT NULL UNIQUE,
                        hash TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        file_type TEXT,
                        word_count INTEGER,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                    )
                """)

                # Create indexes
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_embeddings_path
                    ON document_embeddings(path)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_embeddings_timestamp
                    ON document_embeddings(timestamp DESC)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_file_summaries_path
                    ON file_summaries(path)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_file_summaries_updated
                    ON file_summaries(updated_at DESC)
                """)

                # Create GIN index for full-text search on summaries
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_file_summaries_fts
                    ON file_summaries USING GIN (to_tsvector('english', summary))
                """)

                logger.info("Database tables and indexes created/verified")

        except Exception as e:
            logger.error(f"Failed to create tables: {e}")

    async def load_model(self):
        """Load the Gemma-3 VLM model for multimodal embeddings"""
        try:
            logger.info(f"Loading VLM model: {self.model_name}")

            from transformers import AutoModelForVision2Seq, AutoProcessor

            # Use unified multimodal processor instead of tokenizer
            self.processor = AutoProcessor.from_pretrained(self.model_name)

            # VLM model (Vision + Text)
            self.model = AutoModelForVision2Seq.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device.type == 'cuda' else torch.float32
            ).to(self.device)

            self.model.eval()
            logger.info("Gemma-3 VLM loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load VLM: {e}")
            raise

    def chunk_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks"""
        if len(text) <= self.max_chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.max_chunk_size

            # If we're not at the end, try to find a good break point
            if end < len(text):
                # Look for sentence endings within the last 100 characters
                break_chars = ['. ', '! ', '? ', '\n\n', '\n']
                best_break = end

                for break_char in break_chars:
                    last_break = text.rfind(break_char, start, end)
                    if last_break > end - 100:
                        best_break = last_break + len(break_char)
                        break

                end = best_break

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Move start position with overlap
            start = max(start + 1, end - self.chunk_overlap)

        return chunks

    def generate_embedding(self, text: str, image=None) -> np.ndarray:
        """Generate embedding for text (and optional image) using Gemma-3 VLM"""
        if not self.model or not self.processor:
            raise RuntimeError("VLM not loaded")

        try:
            if image is not None:
                # Multimodal forward pass (text + image)
                inputs = self.processor(
                    text=text,
                    images=image,
                    return_tensors="pt"
                ).to(self.device)
            else:
                # Text-only forward pass
                inputs = self.processor(
                    text=text,
                    return_tensors="pt"
                ).to(self.device)

            # Generate embeddings
            with torch.no_grad():
                outputs = self.model(**inputs)
                # Use mean pooling of last hidden states
                embeddings = outputs.last_hidden_state.mean(dim=1)

            # Convert to numpy and normalize
            embedding = embeddings.cpu().numpy().astype(np.float32)[0]
            embedding = embedding / np.linalg.norm(embedding)  # L2 normalize

            return embedding

        except Exception as e:
            logger.error(f"Failed to generate VLM embedding: {e}")
            raise

    def process_image(self, image_path: str) -> Image.Image:
        """Load and preprocess image for VLM"""
        try:
            image = Image.open(image_path).convert('RGB')
            # Resize if too large (Gemma-3 can handle various sizes, but we'll limit for memory)
            max_size = 1024
            if max(image.size) > max_size:
                ratio = max_size / max(image.size)
                new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                image = image.resize(new_size, Image.Resampling.LANCZOS)
            return image
        except Exception as e:
            logger.error(f"Failed to process image {image_path}: {e}")
            raise

    def extract_text_from_pdf(self, pdf_path: str) -> Tuple[str, List[Image.Image]]:
        """Extract text and images from PDF"""
        try:
            doc = fitz.open(pdf_path)
            text_content = ""
            images = []

            for page_num in range(len(doc)):
                page = doc.load_page(page_num)

                # Extract text
                text_content += page.get_text() + "\n"

                # Extract images (first page only for now, or limit to avoid memory issues)
                if page_num < 3:  # Process first 3 pages for images
                    image_list = page.get_images(full=True)
                    for img_index, img_info in enumerate(image_list[:2]):  # Max 2 images per page
                        try:
                            xref = img_info[0]
                            base_image = doc.extract_image(xref)
                            image_bytes = base_image["image"]
                            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                            images.append(image)
                        except Exception as e:
                            logger.warning(f"Failed to extract image {img_index} from page {page_num}: {e}")

            doc.close()
            return text_content.strip(), images

        except Exception as e:
            logger.error(f"Failed to process PDF {pdf_path}: {e}")
            raise

    async def process_multimodal_file(self, filepath: str):
        """Process files that may contain both text and images (PDFs, images)"""
        try:
            path_obj = Path(filepath)
            extension = path_obj.suffix.lower()

            # Calculate file hash
            async with aiofiles.open(filepath, 'rb') as f:
                content_bytes = await f.read()
            file_hash = hashlib.sha256(content_bytes).hexdigest()

            if extension == '.pdf':
                # Process PDF
                text_content, images = await asyncio.get_event_loop().run_in_executor(
                    None, self.extract_text_from_pdf, filepath
                )

                if not text_content.strip() and not images:
                    logger.warning(f"Empty PDF: {filepath}")
                    return

                # Generate summary
                summary = self.generate_summary(filepath, text_content)

                # Store file-level summary
                await self._store_file_summary(filepath, file_hash, summary, 'pdf', len(text_content.split()))

                # Process text chunks
                if text_content.strip():
                    chunks = self.chunk_text(text_content)
                    for i, chunk in enumerate(chunks):
                        try:
                            # Use first image if available for multimodal embedding
                            image = images[0] if images else None
                            embedding = self.generate_embedding(chunk, image)

                            metadata = self._create_metadata(path_obj, file_hash, summary, embedding, i, len(chunks), chunk)
                            await self._store_multimodal(metadata)

                        except Exception as e:
                            logger.error(f"Failed to process PDF chunk {i}: {e}")

                # Process images separately if no text or as additional chunks
                for img_idx, image in enumerate(images):
                    try:
                        # Generate image-only embedding with descriptive text
                        img_text = f"Image from {path_obj.name} page {img_idx + 1}"
                        embedding = self.generate_embedding(img_text, image)

                        metadata = self._create_metadata(path_obj, file_hash, summary, embedding, img_idx, len(images), img_text, modality="image")
                        await self._store_multimodal(metadata)

                    except Exception as e:
                        logger.error(f"Failed to process PDF image {img_idx}: {e}")

            elif extension in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
                # Process image
                image = await asyncio.get_event_loop().run_in_executor(
                    None, self.process_image, filepath
                )

                summary = f"Image file: {path_obj.name}"
                await self._store_file_summary(filepath, file_hash, summary, extension[1:], 0)

                # Generate multimodal embedding
                img_text = f"Image content from {path_obj.name}"
                embedding = self.generate_embedding(img_text, image)

                metadata = self._create_metadata(path_obj, file_hash, summary, embedding, 0, 1, img_text, modality="image")
                await self._store_multimodal(metadata)

        except Exception as e:
            logger.error(f"Failed to process multimodal file {filepath}: {e}")

    def _create_metadata(self, path_obj: Path, file_hash: str, summary: str, embedding: np.ndarray,
                        chunk_index: int, total_chunks: int, chunk_content: str, modality: str = "text") -> Dict:
        """Create metadata dictionary for storage"""
        return {
            "path": str(path_obj),
            "timestamp": datetime.now().isoformat(),
            "hash": file_hash,
            "summary": summary,
            "embedding_model": "gemma-3-vlm-1024d",
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "chunk_size": len(chunk_content),
            "modality": modality,
            "embedding": embedding.tolist()
        }

    async def _store_multimodal(self, metadata: Dict):
        """Store multimodal metadata in MinIO and PostgreSQL"""
        await self._store_in_minio(metadata)
        await self._store_in_database(metadata)

    def generate_summary(self, filepath: str, content: str) -> str:
        """Generate a code fix style summary for the file"""
        path_obj = Path(filepath)
        filename = path_obj.name
        extension = path_obj.suffix.lower()

        # Extract key fixes and improvements from the code
        fixes = self._extract_code_fixes(content, extension)

        if fixes:
            return f"Fixes {', '.join(fixes[:3])}"  # Limit to top 3 fixes
        else:
            return f"Updates {filename} with general improvements"

    def _extract_code_fixes(self, content: str, extension: str) -> List[str]:
        """Extract code fixes and improvements from the content"""
        fixes = []
        content_lower = content.lower()

        # C/C++ specific fixes
        if extension in ['.cpp', '.cu', '.hpp', '.cuh']:
            # Memory management fixes
            if 'unique_ptr' in content or 'shared_ptr' in content:
                fixes.append("memory management improvements")
            if 'cudaFree' in content or 'cudaMalloc' in content:
                fixes.append("CUDA memory handling")
            if 'std::chrono' in content or 'chrono::' in content:
                fixes.append("chrono template mismatch")

            # Error handling
            if 'cudaError_t' in content or 'cudaGetLastError' in content:
                fixes.append("CUDA error handling")
            if 'try' in content and 'catch' in content:
                fixes.append("exception safety")
            if 'assert' in content or 'CHECK_CUDA' in content:
                fixes.append("error checking")

            # Performance optimizations
            if 'gradient_checkpointing' in content_lower or 'checkpoint' in content_lower:
                fixes.append("gradient checkpointing")
            if 'quantization' in content_lower or 'quantize' in content_lower:
                fixes.append("quantization support")
            if '__syncthreads' in content or 'cudaDeviceSynchronize' in content:
                fixes.append("CUDA synchronization")

            # Template and compilation fixes
            if 'template' in content and ('typename' in content or 'class' in content):
                fixes.append("template specialization")
            if 'constexpr' in content:
                fixes.append("compile-time optimizations")

        # Python specific fixes
        elif extension == '.py':
            if 'torch.no_grad' in content or 'with torch.no_grad' in content:
                fixes.append("gradient computation fixes")
            if 'cuda' in content_lower and ('device' in content or 'gpu' in content):
                fixes.append("GPU device handling")
            if 'async' in content or 'await' in content:
                fixes.append("async processing")
            if 'logging' in content or 'logger' in content:
                fixes.append("logging improvements")

        # TypeScript/JavaScript fixes
        elif extension in ['.ts', '.tsx', '.js', '.jsx']:
            if 'catch' in content or 'try' in content:
                fixes.append("error boundary handling")
            if 'useEffect' in content or 'useState' in content:
                fixes.append("React hook optimizations")
            if '$state' in content or '$derived' in content or '$props' in content:
                fixes.append("Svelte 5 rune optimizations")
            if 'interface' in content or 'type' in content:
                fixes.append("type safety improvements")

        # Svelte specific fixes
        elif extension == '.svelte':
            if 'onMount' in content or 'onDestroy' in content:
                fixes.append("lifecycle management")
            if 'bind:' in content or 'use:' in content:
                fixes.append("directive handling")
            if 'store' in content or 'writable' in content:
                fixes.append("state management")

        # General fixes that apply to any language
        if 'thread' in content_lower or 'mutex' in content_lower:
            fixes.append("thread safety")
        if 'memory' in content_lower and ('leak' in content_lower or 'free' in content_lower):
            fixes.append("memory leak prevention")
        if 'performance' in content_lower or 'optimize' in content_lower:
            fixes.append("performance optimizations")

        return list(set(fixes))  # Remove duplicates

    async def process_file(self, filepath: str):
        """Process a single file for embedding (routes to appropriate handler)"""
        try:
            path_obj = Path(filepath)
            extension = path_obj.suffix.lower()

            # Route to appropriate processing method
            if extension == '.pdf':
                await self.process_multimodal_file(filepath)
            elif extension in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
                await self.process_multimodal_file(filepath)
            else:
                # Default to text processing for other files
                await self._process_text_file(filepath)

        except Exception as e:
            logger.error(f"Failed to process file {filepath}: {e}")

    async def _process_text_file(self, filepath: str):
        """Process text-based files (original logic)"""
        try:
            path_obj = Path(filepath)

            # Read file content
            async with aiofiles.open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = await f.read()

            if not content.strip():
                logger.warning(f"Empty file: {filepath}")
                return

            # Calculate file hash
            file_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()

            # Generate summary
            summary = self.generate_summary(filepath, content)

            # Store file-level summary (once per file)
            extension = path_obj.suffix.lower()
            await self._store_file_summary(filepath, file_hash, summary, extension, len(content.split()))

            # Chunk the content
            chunks = self.chunk_text(content)

            logger.info(f"Processing {filepath}: {len(chunks)} chunks")

            # Process each chunk
            for i, chunk in enumerate(chunks):
                try:
                    # Generate embedding (text-only)
                    embedding = self.generate_embedding(chunk)

                    # Create metadata
                    metadata = {
                        "path": str(path_obj),
                        "timestamp": datetime.now().isoformat(),
                        "hash": file_hash,
                        "summary": summary,
                        "embedding_model": "gemma-3-vlm-1024d",
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "chunk_size": len(chunk),
                        "modality": "text",
                        "embedding": embedding.tolist()
                    }

                    # Store in MinIO
                    await self._store_in_minio(metadata)

                    # Store in PostgreSQL
                    await self._store_in_database(metadata)

                    logger.info(f"Processed chunk {i+1}/{len(chunks)} for {filepath}")

                except Exception as e:
                    logger.error(f"Failed to process chunk {i} of {filepath}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Failed to process text file {filepath}: {e}")

    async def _store_in_minio(self, metadata: Dict):
        """Store metadata in MinIO"""
        if not self.minio_client:
            return

        try:
            bucket_name = 'code-docs'
            date_str = datetime.now().strftime('%Y-%m-%d')
            filename = f"{Path(metadata['path']).name}.chunk_{metadata['chunk_index']}.json"
            object_name = f"embeddings/{date_str}/{filename}"

            # Upload JSON
            json_data = json.dumps(metadata, indent=2)
            self.minio_client.put_object(
                bucket_name,
                object_name,
                json_data,
                len(json_data),
                content_type='application/json'
            )

            # Also upload original file if not already present
            original_name = f"originals/{Path(metadata['path']).name}"
            if not self._minio_object_exists(bucket_name, original_name):
                try:
                    self.minio_client.fput_object(
                        bucket_name,
                        original_name,
                        metadata['path']
                    )
                except Exception as e:
                    logger.warning(f"Failed to upload original file: {e}")

        except Exception as e:
            logger.error(f"Failed to store in MinIO: {e}")

    def _minio_object_exists(self, bucket: str, object_name: str) -> bool:
        """Check if object exists in MinIO"""
        try:
            self.minio_client.stat_object(bucket, object_name)
            return True
        except:
            return False

    async def _store_file_summary(self, filepath: str, file_hash: str, summary: str, file_type: str, word_count: int):
        """Store file-level summary in PostgreSQL"""
        if not self.db_conn:
            return

        try:
            with self.db_conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO file_summaries
                    (path, hash, summary, file_type, word_count)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (path) DO UPDATE SET
                        hash = EXCLUDED.hash,
                        summary = EXCLUDED.summary,
                        file_type = EXCLUDED.file_type,
                        word_count = EXCLUDED.word_count,
                        updated_at = NOW()
                """, (
                    filepath,
                    file_hash,
                    summary,
                    file_type,
                    word_count
                ))

        except Exception as e:
            logger.error(f"Failed to store file summary: {e}")

    async def _store_in_database(self, metadata: Dict):
        """Store chunk metadata in PostgreSQL"""
        if not self.db_conn:
            return

        try:
            with self.db_conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO document_embeddings
                    (path, hash, embedding_model, embedding_vector, chunk_index, total_chunks)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (path, hash, chunk_index) DO UPDATE SET
                        embedding_vector = EXCLUDED.embedding_vector,
                        timestamp = NOW()
                """, (
                    metadata['path'],
                    metadata['hash'],
                    metadata['embedding_model'],
                    metadata['embedding'],  # pgvector will handle conversion
                    metadata['chunk_index'],
                    metadata['total_chunks']
                ))

        except Exception as e:
            logger.error(f"Failed to store in database: {e}")

    async def run_batch_processing(self, file_list: List[str]):
        """Process multiple files"""
        logger.info(f"Starting batch processing of {len(file_list)} files")

        for filepath in file_list:
            if os.path.exists(filepath):
                await self.process_file(filepath)
            else:
                logger.warning(f"File not found: {filepath}")

        logger.info("Batch processing completed")

    def search_summaries(self, query: str = None, file_type: str = None, limit: int = 50) -> List[Dict]:
        """Search file summaries in PostgreSQL"""
        if not self.db_conn:
            return []

        try:
            with self.db_conn.cursor() as cursor:
                base_query = """
                    SELECT path, hash, summary, file_type, word_count, created_at, updated_at
                    FROM file_summaries
                    WHERE 1=1
                """
                params = []

                if query:
                    base_query += " AND summary ILIKE %s"
                    params.append(f"%{query}%")

                if file_type:
                    base_query += " AND file_type = %s"
                    params.append(file_type)

                base_query += " ORDER BY updated_at DESC LIMIT %s"
                params.append(limit)

                cursor.execute(base_query, params)

                results = []
                for row in cursor.fetchall():
                    results.append({
                        'path': row[0],
                        'hash': row[1],
                        'summary': row[2],
                        'file_type': row[3],
                        'word_count': row[4],
                        'created_at': row[5],
                        'updated_at': row[6]
                    })

                return results

        except Exception as e:
            logger.error(f"Failed to search summaries: {e}")
            return []

    def get_file_summary(self, filepath: str) -> Optional[Dict]:
        """Get summary for a specific file"""
        if not self.db_conn:
            return None

        try:
            with self.db_conn.cursor() as cursor:
                cursor.execute("""
                    SELECT path, hash, summary, file_type, word_count, created_at, updated_at
                    FROM file_summaries
                    WHERE path = %s
                """, (filepath,))

                row = cursor.fetchone()
                if row:
                    return {
                        'path': row[0],
                        'hash': row[1],
                        'summary': row[2],
                        'file_type': row[3],
                        'word_count': row[4],
                        'created_at': row[5],
                        'updated_at': row[6]
                    }

        except Exception as e:
            logger.error(f"Failed to get file summary: {e}")

        return None

    def get_summary_stats(self) -> Dict:
        """Get statistics about stored summaries"""
        if not self.db_conn:
            return {}

        try:
            with self.db_conn.cursor() as cursor:
                # Get total files and summaries
                cursor.execute("""
                    SELECT
                        COUNT(*) as total_files,
                        COUNT(DISTINCT file_type) as file_types,
                        SUM(word_count) as total_words,
                        AVG(word_count) as avg_words_per_file
                    FROM file_summaries
                """)

                row = cursor.fetchone()
                stats = {
                    'total_files': row[0],
                    'file_types': row[1],
                    'total_words': row[2],
                    'avg_words_per_file': float(row[3]) if row[3] else 0
                }

                # Get file type breakdown
                cursor.execute("""
                    SELECT file_type, COUNT(*) as count
                    FROM file_summaries
                    GROUP BY file_type
                    ORDER BY count DESC
                """)

                stats['file_type_breakdown'] = {row[0]: row[1] for row in cursor.fetchall()}

                return stats

        except Exception as e:
            logger.error(f"Failed to get summary stats: {e}")
            return {}

async def main():
    parser = argparse.ArgumentParser(description='Embedding Service for Legal AI Platform')
    parser.add_argument('--file', help='Single file to process')
    parser.add_argument('--batch', nargs='+', help='List of files to process')
    parser.add_argument('--watch-dir', help='Directory to watch for changes')
    parser.add_argument('--search-summaries', help='Search summaries with query')
    parser.add_argument('--file-type', help='Filter search by file type')
    parser.add_argument('--stats', action='store_true', help='Show summary statistics')

    args = parser.parse_args()

    service = EmbeddingService()
    await service.load_model()

    if args.file:
        await service.process_file(args.file)
    elif args.batch:
        await service.run_batch_processing(args.batch)
    elif args.watch_dir:
        # Watch mode would be implemented here
        logger.info(f"Watch mode for {args.watch_dir} not implemented yet")
    elif args.search_summaries or args.stats:
        if args.stats:
            stats = service.get_summary_stats()
            print("📊 Summary Statistics:")
            print(json.dumps(stats, indent=2))
        else:
            results = service.search_summaries(args.search_summaries, args.file_type)
            print(f"🔍 Found {len(results)} summaries:")
            for result in results:
                print(f"\n📄 {result['path']}")
                print(f"📝 {result['summary']}")
                print(f"🏷️  Type: {result['file_type']}, Words: {result['word_count']}")
    else:
        logger.error("No action specified. Use --file, --batch, --watch-dir, --search-summaries, or --stats")

if __name__ == '__main__':
    asyncio.run(main())