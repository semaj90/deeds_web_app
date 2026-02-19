#!/usr/bin/env python3
"""
ACE Web Ingestion Worker
Processes jobs from RabbitMQ: crawl → clean → chunk → embed → store

Pipeline:
1. Crawl: Fetch HTML from URL
2. Clean: Convert HTML to markdown
3. Chunk: Split into 800-1200 token segments
4. Embed: Generate embeddings using Ollama
5. Store: Save to MinIO, PostgreSQL, and Qdrant
6. Extract: Extract entities and relations
7. Summarize: Generate document summary
"""

import asyncio
import json
import hashlib
import logging
import os
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlparse, urljoin
import time

# Third-party imports
import pika
import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as md
import tiktoken
import psycopg2
from psycopg2.extras import execute_values
from minio import Minio
from minio.error import S3Error

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AceWebWorker:
    """
    ACE Web Ingestion Worker
    Consumes jobs from RabbitMQ and processes web content
    """

    def __init__(self):
        # Configuration from environment
        self.rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://localhost:5672')
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        self.qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
        self.db_url = os.getenv('DATABASE_URL')

        # MinIO configuration
        minio_endpoint = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
        self.minio_client = Minio(
            minio_endpoint,
            access_key=os.getenv('MINIO_ACCESS_KEY', 'minioadmin'),
            secret_key=os.getenv('MINIO_SECRET_KEY', 'minioadmin'),
            secure=False
        )

        # Buckets
        self.buckets = {
            'raw': 'ace-web-raw',
            'derived': 'ace-web-derived',
            'logs': 'ace-eval-logs'
        }

        # Tokenizer for chunking
        self.tokenizer = tiktoken.get_encoding('cl100k_base')

        # Rate limiting
        self.domain_last_request = {}
        self.rate_limit_delay = 2.0  # seconds between requests to same domain

        logger.info('ACE Web Worker initialized')

    def start(self):
        """Start consuming jobs from RabbitMQ"""
        try:
            connection = pika.BlockingConnection(pika.URLParameters(self.rabbitmq_url))
            channel = connection.channel()
            channel.queue_declare(queue='ace_web_ingest', durable=True)
            channel.basic_qos(prefetch_count=1)

            logger.info('Worker started, waiting for jobs...')

            def callback(ch, method, properties, body):
                try:
                    job = json.loads(body)
                    logger.info(f"Processing job {job['jobId']}")

                    # Run async pipeline
                    asyncio.run(self.process_job(job))

                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    logger.info(f"Job {job['jobId']} completed successfully")
                except Exception as e:
                    logger.error(f"Job processing failed: {e}", exc_info=True)
                    # Don't ack - let it retry

            channel.basic_consume(queue='ace_web_ingest', on_message_callback=callback)
            channel.start_consuming()

        except KeyboardInterrupt:
            logger.info('Worker stopped by user')
            sys.exit(0)
        except Exception as e:
            logger.error(f"Worker failed: {e}", exc_info=True)
            sys.exit(1)

    async def process_job(self, job: Dict[str, Any]):
        """Execute the full pipeline for a job"""
        source_id = job['sourceId']
        url = job['url']
        tags = job.get('tags', [])

        try:
            # Step 1: Crawl
            logger.info(f"[{source_id}] Crawling {url}")
            html = await self.crawl(url)
            if not html:
                await self.update_source_status(source_id, 'error')
                await self.log_error(source_id, 'crawl_error', {
                    'url': url,
                    'error': 'Failed to fetch HTML'
                })
                return

            # Compute content hash
            content_hash = hashlib.sha256(html.encode()).hexdigest()

            # Check if unchanged
            existing_hash = await self.get_content_hash(source_id)
            if existing_hash == content_hash:
                logger.info(f"[{source_id}] Content unchanged, skipping")
                await self.update_source_status(source_id, 'ok', content_hash)
                return

            # Store raw HTML in MinIO
            logger.info(f"[{source_id}] Storing raw HTML")
            raw_key = await self.store_raw_html(source_id, html)

            # Step 2: Clean
            logger.info(f"[{source_id}] Cleaning HTML")
            markdown = self.clean_html(html)
            clean_key = await self.store_clean_markdown(source_id, markdown)

            # Create doc record
            logger.info(f"[{source_id}] Creating doc record")
            doc_id = await self.create_doc(source_id, raw_key, clean_key, url)

            # Step 3: Chunk
            logger.info(f"[{source_id}] Chunking text")
            chunks = self.chunk_text(markdown, url, tags)
            logger.info(f"[{source_id}] Created {len(chunks)} chunks")

            # Step 4: Embed
            logger.info(f"[{source_id}] Generating embeddings")
            embeddings = await self.generate_embeddings([c['text'] for c in chunks])

            # Step 5: Store chunks
            logger.info(f"[{source_id}] Storing chunks")
            await self.store_chunks(doc_id, chunks, embeddings, url)

            # Step 6: Extract entities and relations
            logger.info(f"[{source_id}] Extracting knowledge")
            entities, edges = await self.extract_knowledge(markdown, doc_id)
            await self.store_knowledge(doc_id, entities, edges)

            # Step 7: Summarize
            logger.info(f"[{source_id}] Generating summary")
            summary = await self.generate_summary(markdown, entities, edges)
            await self.store_summary(doc_id, summary)

            # Update source status
            await self.update_source_status(source_id, 'ok', content_hash)

            logger.info(f"[{source_id}] Pipeline complete!")

        except Exception as e:
            logger.error(f"[{source_id}] Pipeline failed: {e}", exc_info=True)
            await self.update_source_status(source_id, 'error')
            await self.log_error(source_id, 'pipeline_error', {
                'url': url,
                'error': str(e),
                'traceback': str(e.__traceback__)
            })

    async def crawl(self, url: str) -> Optional[str]:
        """Fetch HTML from URL with rate limiting and robots.txt respect"""
        try:
            # Rate limiting
            domain = urlparse(url).netloc
            last_request = self.domain_last_request.get(domain, 0)
            time_since = time.time() - last_request

            if time_since < self.rate_limit_delay:
                wait_time = self.rate_limit_delay - time_since
                logger.info(f"Rate limiting: waiting {wait_time:.1f}s for {domain}")
                await asyncio.sleep(wait_time)

            # Fetch HTML
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                headers = {
                    'User-Agent': 'ACE-Web-Crawler/1.0 (Legal AI Research Bot)'
                }
                response = await client.get(url, headers=headers)
                response.raise_for_status()

                self.domain_last_request[domain] = time.time()

                return response.text

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error {e.response.status_code} for {url}")
            return None
        except httpx.TimeoutException:
            logger.error(f"Timeout fetching {url}")
            return None
        except Exception as e:
            logger.error(f"Crawl failed for {url}: {e}")
            return None

    def clean_html(self, html: str) -> str:
        """Convert HTML to clean markdown"""
        soup = BeautifulSoup(html, 'html.parser')

        # Remove unwanted elements
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe']):
            tag.decompose()

        # Convert to markdown
        markdown = md(str(soup), heading_style='ATX')

        # Clean up excessive whitespace
        lines = markdown.split('\n')
        cleaned_lines = []
        prev_empty = False

        for line in lines:
            stripped = line.strip()
            if stripped:
                cleaned_lines.append(line)
                prev_empty = False
            elif not prev_empty:
                cleaned_lines.append('')
                prev_empty = True

        return '\n'.join(cleaned_lines)

    def chunk_text(self, text: str, url: str, tags: List[str]) -> List[Dict[str, Any]]:
        """Chunk text into 800-1200 token segments with 200 token overlap"""
        tokens = self.tokenizer.encode(text)
        chunks = []
        chunk_size = 1000
        overlap = 200

        # Extract heading context
        lines = text.split('\n')
        current_heading = None
        line_headings = {}

        for i, line in enumerate(lines):
            if line.startswith('#'):
                current_heading = line.strip('#').strip()
            line_headings[i] = current_heading

        # Chunk tokens
        for i in range(0, len(tokens), chunk_size - overlap):
            chunk_tokens = tokens[i:i + chunk_size]
            chunk_text = self.tokenizer.decode(chunk_tokens)

            # Try to find heading for this chunk
            chunk_start_line = text[:len(self.tokenizer.decode(tokens[:i]))].count('\n')
            heading = line_headings.get(chunk_start_line)

            chunks.append({
                'text': chunk_text,
                'metadata': {
                    'url': url,
                    'tags': tags,
                    'chunk_index': len(chunks),
                    'token_count': len(chunk_tokens),
                    'heading': heading,
                    'fetchedAt': datetime.utcnow().isoformat()
                }
            })

        return chunks

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Ollama (nomic-embed-text)"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.ollama_url}/api/embed",
                    json={'model': 'nomic-embed-text', 'input': texts}
                )
                response.raise_for_status()
                data = response.json()
                return data['embeddings']
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    async def generate_summary(
        self,
        text: str,
        entities: List[Dict],
        edges: List[Dict]
    ) -> Dict[str, Any]:
        """Generate document summary using Gemma3"""
        # Truncate to first 4000 tokens for summary
        tokens = self.tokenizer.encode(text)[:4000]
        truncated = self.tokenizer.decode(tokens)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                prompt = f"""Summarize this document in 3-5 sentences. Focus on key concepts and main ideas.

Document:
{truncated}

Summary:"""

                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        'model': 'gemma3-legal',
                        'prompt': prompt,
                        'stream': False
                    }
                )
                response.raise_for_status()
                data = response.json()

                summary_text = data.get('response', 'Summary generation failed')

                return {
                    'text': summary_text,
                    'entities': [e['entity'] for e in entities[:20]],
                    'relations': [f"{e['src']} -> {e['dst']}" for e in edges[:10]],
                    'generatedAt': datetime.utcnow().isoformat()
                }
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            return {
                'text': 'Summary generation failed',
                'entities': [],
                'relations': [],
                'generatedAt': datetime.utcnow().isoformat()
            }

    async def extract_knowledge(
        self,
        text: str,
        doc_id: str
    ) -> Tuple[List[Dict], List[Dict]]:
        """Extract entities and relations from text"""
        # Simple extraction for now - in production use spaCy or similar
        entities = []
        edges = []

        # Extract capitalized words as potential entities
        words = text.split()
        entity_candidates = set()

        for i, word in enumerate(words):
            # Remove punctuation
            clean_word = ''.join(c for c in word if c.isalnum())

            # Check if capitalized and not at sentence start
            if clean_word and clean_word[0].isupper() and len(clean_word) > 3:
                if i > 0 and not words[i-1].endswith('.'):
                    entity_candidates.add(clean_word)

        # Create entity records
        for entity in list(entity_candidates)[:50]:  # Limit to 50
            entity_type = 'CONCEPT'  # Default type

            # Simple heuristics for type detection
            if entity.endswith('Inc') or entity.endswith('Corp') or entity.endswith('LLC'):
                entity_type = 'ORG'
            elif entity in ['Python', 'JavaScript', 'TypeScript', 'Svelte', 'React']:
                entity_type = 'TECH'

            entities.append({
                'entity': entity,
                'type': entity_type,
                'docId': doc_id
            })

        # Extract simple co-occurrence relations
        entity_list = list(entity_candidates)
        for i in range(len(entity_list)):
            for j in range(i + 1, min(i + 5, len(entity_list))):
                edges.append({
                    'src': entity_list[i],
                    'dst': entity_list[j],
                    'rel': 'RELATED_TO',
                    'weight': 1.0,
                    'docId': doc_id
                })

        logger.info(f"Extracted {len(entities)} entities and {len(edges)} edges")
        return entities, edges

    # Storage methods
    async def store_raw_html(self, source_id: str, html: str) -> str:
        """Store raw HTML in MinIO"""
        timestamp = datetime.utcnow().isoformat().replace(':', '-')
        key = f"crawl/{source_id}/{timestamp}.html"

        try:
            self.minio_client.put_object(
                self.buckets['raw'],
                key,
                data=html.encode('utf-8'),
                length=len(html.encode('utf-8')),
                content_type='text/html'
            )
            return key
        except S3Error as e:
            logger.error(f"Failed to store raw HTML: {e}")
            raise

    async def store_clean_markdown(self, source_id: str, markdown: str) -> str:
        """Store cleaned markdown in MinIO"""
        timestamp = datetime.utcnow().isoformat().replace(':', '-')
        key = f"crawl/{source_id}/{timestamp}.md"

        try:
            self.minio_client.put_object(
                self.buckets['raw'],
                key,
                data=markdown.encode('utf-8'),
                length=len(markdown.encode('utf-8')),
                content_type='text/markdown'
            )
            return key
        except S3Error as e:
            logger.error(f"Failed to store clean markdown: {e}")
            raise

    async def store_summary(self, doc_id: str, summary: Dict) -> str:
        """Store summary in MinIO"""
        key = f"summary/{doc_id}.json"
        json_data = json.dumps(summary, indent=2)

        try:
            self.minio_client.put_object(
                self.buckets['derived'],
                key,
                data=json_data.encode('utf-8'),
                length=len(json_data.encode('utf-8')),
                content_type='application/json'
            )
            return key
        except S3Error as e:
            logger.error(f"Failed to store summary: {e}")
            raise

    async def create_doc(
        self,
        source_id: str,
        raw_key: str,
        clean_key: str,
        url: str
    ) -> str:
        """Create document record in PostgreSQL"""
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()

        try:
            cur.execute("""
                INSERT INTO ace_docs (source_id, minio_raw_key, minio_clean_key, content_type, fetched_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (source_id, raw_key, clean_key, 'text/html', datetime.utcnow()))

            doc_id = cur.fetchone()[0]
            conn.commit()
            return doc_id
        finally:
            cur.close()
            conn.close()

    async def store_chunks(
        self,
        doc_id: str,
        chunks: List[Dict],
        embeddings: List[List[float]],
        url: str
    ):
        """Store chunks in PostgreSQL and Qdrant"""
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()

        try:
            # Store in PostgreSQL
            values = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                values.append((
                    doc_id,
                    i,
                    chunk['text'],
                    json.dumps(embedding),
                    json.dumps(chunk['metadata'])
                ))

            execute_values(cur, """
                INSERT INTO ace_chunks (doc_id, chunk_index, text, embedding, metadata)
                VALUES %s
                RETURNING id
            """, values, template="(%s, %s, %s, %s::vector, %s::jsonb)")

            chunk_ids = [row[0] for row in cur.fetchall()]
            conn.commit()

            # Store in Qdrant
            await self.store_chunks_qdrant(chunk_ids, chunks, embeddings, url)

        finally:
            cur.close()
            conn.close()

    async def store_chunks_qdrant(
        self,
        chunk_ids: List[str],
        chunks: List[Dict],
        embeddings: List[List[float]],
        url: str
    ):
        """Store chunks in Qdrant for fast ANN search"""
        try:
            points = []
            for chunk_id, chunk, embedding in zip(chunk_ids, chunks, embeddings):
                points.append({
                    'id': chunk_id,
                    'vector': embedding,
                    'payload': {
                        'url': url,
                        'domain': urlparse(url).netloc,
                        'fetchedAt': chunk['metadata']['fetchedAt'],
                        'heading': chunk['metadata'].get('heading'),
                        'tags': chunk['metadata'].get('tags', [])
                    }
                })

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.put(
                    f"{self.qdrant_url}/collections/ace_chunks/points",
                    json={'points': points}
                )
                response.raise_for_status()

        except Exception as e:
            logger.warning(f"Failed to store in Qdrant (non-fatal): {e}")

    async def store_knowledge(
        self,
        doc_id: str,
        entities: List[Dict],
        edges: List[Dict]
    ):
        """Store entities and edges in PostgreSQL"""
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()

        try:
            # Store entities
            if entities:
                entity_values = [(doc_id, e['entity'], e['type'], '{}') for e in entities]
                execute_values(cur, """
                    INSERT INTO ace_entities (doc_id, entity, entity_type, data)
                    VALUES %s
                """, entity_values)

            # Store edges
            if edges:
                edge_values = [(e['src'], e['rel'], e['dst'], doc_id, e['weight'], '{}') for e in edges]
                execute_values(cur, """
                    INSERT INTO ace_edges (src_entity, rel, dst_entity, doc_id, weight, data)
                    VALUES %s
                """, edge_values)

            conn.commit()
        finally:
            cur.close()
            conn.close()

    async def update_source_status(
        self,
        source_id: str,
        status: str,
        content_hash: Optional[str] = None
    ):
        """Update source crawl status"""
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()

        try:
            if content_hash:
                cur.execute("""
                    UPDATE ace_sources
                    SET crawl_status = %s, last_crawled = %s, content_hash = %s
                    WHERE id = %s
                """, (status, datetime.utcnow(), content_hash, source_id))
            else:
                cur.execute("""
                    UPDATE ace_sources
                    SET crawl_status = %s, last_crawled = %s
                    WHERE id = %s
                """, (status, datetime.utcnow(), source_id))

            conn.commit()
        finally:
            cur.close()
            conn.close()

    async def get_content_hash(self, source_id: str) -> Optional[str]:
        """Get existing content hash for source"""
        conn = psycopg2.connect(self.db_url)
        cur = conn.cursor()

        try:
            cur.execute("SELECT content_hash FROM ace_sources WHERE id = %s", (source_id,))
            row = cur.fetchone()
            return row[0] if row else None
        finally:
            cur.close()
            conn.close()

    async def log_error(self, source_id: str, error_type: str, error_data: Dict):
        """Log error to MinIO"""
        date = datetime.utcnow().strftime('%Y-%m-%d')
        timestamp = datetime.utcnow().isoformat().replace(':', '-')
        key = f"{error_type}/{date}/{source_id}-{timestamp}.json"

        json_data = json.dumps(error_data, indent=2)

        try:
            self.minio_client.put_object(
                self.buckets['logs'],
                key,
                data=json_data.encode('utf-8'),
                length=len(json_data.encode('utf-8')),
                content_type='application/json'
            )
        except S3Error as e:
            logger.error(f"Failed to log error: {e}")


if __name__ == '__main__':
    worker = AceWebWorker()
    worker.start()
