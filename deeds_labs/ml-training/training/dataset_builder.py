# Phase 70: QLoRA Dataset Builder
# Creates training datasets from existing database content
# No internet downloads - uses cached NVIDIA container

import os
import sys
import json
import logging
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
import random

# Database connections
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import redis
    DATABASE_AVAILABLE = True
except ImportError:
    DATABASE_AVAILABLE = False

# Data processing
try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

def setup_logging():
    logging.basicConfig(level=logging.INFO)
    return logging.getLogger(__name__)

class QLoRADatasetBuilder:
    """Builds QLoRA training datasets from existing data sources"""

    def __init__(self, logger):
        self.logger = logger
        self.db_conn = None
        self.redis_conn = None

    def connect_databases(self):
        """Connect to PostgreSQL and Redis"""
        try:
            # PostgreSQL connection
            db_url = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5432/legal_ai_db")
            self.db_conn = psycopg2.connect(db_url)
            self.logger.info("✅ Connected to PostgreSQL")

            # Redis connection
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            self.redis_conn = redis.from_url(redis_url)
            self.logger.info("✅ Connected to Redis")

        except Exception as e:
            self.logger.error(f"Database connection failed: {e}")
            raise

    def fetch_chat_history(self, limit: int = 10000) -> List[Dict[str, Any]]:
        """Fetch chat history from database"""
        if not self.db_conn:
            return []

        try:
            with self.db_conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT
                        id,
                        user_message,
                        assistant_response,
                        created_at,
                        metadata
                    FROM chat_history
                    WHERE user_message IS NOT NULL
                    AND assistant_response IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))

                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to fetch chat history: {e}")
            return []

    def fetch_evidence_data(self, limit: int = 5000) -> List[Dict[str, Any]]:
        """Fetch evidence data from database"""
        if not self.db_conn:
            return []

        try:
            with self.db_conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT
                        id,
                        title,
                        content,
                        ocr_text,
                        metadata,
                        created_at
                    FROM evidence_documents
                    WHERE content IS NOT NULL
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))

                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to fetch evidence data: {e}")
            return []

    def fetch_error_logs(self, limit: int = 2000) -> List[Dict[str, Any]]:
        """Fetch error logs and fixes from Redis"""
        if not self.redis_conn:
            return []

        try:
            # Get error analysis data from Redis
            error_keys = self.redis_conn.keys("error_analysis:*")
            errors = []

            for key in error_keys[:limit]:
                data = self.redis_conn.get(key)
                if data:
                    try:
                        error_data = json.loads(data)
                        errors.append(error_data)
                    except json.JSONDecodeError:
                        continue

            return errors

        except Exception as e:
            self.logger.error(f"Failed to fetch error logs: {e}")
            return []

    def create_instruction_tuning_data(self, chat_history: List[Dict]) -> List[Dict[str, Any]]:
        """Create instruction tuning examples from chat history"""
        instructions = []

        for chat in chat_history:
            user_msg = chat.get('user_message', '').strip()
            assistant_msg = chat.get('assistant_response', '').strip()

            if not user_msg or not assistant_msg:
                continue

            # Create instruction format
            instruction = {
                "instruction": user_msg,
                "input": "",
                "output": assistant_msg,
                "source": "chat_history",
                "metadata": {
                    "chat_id": chat.get('id'),
                    "created_at": chat.get('created_at').isoformat() if chat.get('created_at') else None
                }
            }
            instructions.append(instruction)

        return instructions

    def create_legal_analysis_data(self, evidence: List[Dict]) -> List[Dict[str, Any]]:
        """Create legal analysis examples from evidence"""
        analyses = []

        for doc in evidence:
            content = doc.get('content', '') or doc.get('ocr_text', '')
            title = doc.get('title', '')

            if not content:
                continue

            # Create analysis instruction
            instruction = {
                "instruction": f"Analyze the following legal document and provide key insights:",
                "input": f"Title: {title}\n\nContent: {content[:2000]}...",  # Truncate for training
                "output": f"This document appears to be related to legal matters. Key points include: [AI would analyze here]",
                "source": "evidence_analysis",
                "metadata": {
                    "doc_id": doc.get('id'),
                    "title": title
                }
            }
            analyses.append(instruction)

        return analyses

    def create_error_fixing_data(self, errors: List[Dict]) -> List[Dict[str, Any]]:
        """Create error fixing examples from error logs"""
        fixes = []

        for error in errors:
            error_msg = error.get('error', '')
            fix_suggestion = error.get('fix', '')

            if not error_msg or not fix_suggestion:
                continue

            instruction = {
                "instruction": f"Fix the following TypeScript/Svelte error:",
                "input": error_msg,
                "output": fix_suggestion,
                "source": "error_fixing",
                "metadata": {
                    "error_type": error.get('type'),
                    "file": error.get('file')
                }
            }
            fixes.append(instruction)

        return fixes

    def balance_dataset(self, datasets: List[List[Dict]], target_size: int = 10000) -> List[Dict]:
        """Balance and combine datasets"""
        combined = []
        for dataset in datasets:
            combined.extend(dataset)

        # Shuffle
        random.shuffle(combined)

        # Balance to target size
        if len(combined) > target_size:
            combined = combined[:target_size]

        self.logger.info(f"Created balanced dataset with {len(combined)} examples")
        return combined

    def save_dataset(self, data: List[Dict], output_path: str):
        """Save dataset in JSONL format for QLoRA training"""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            for item in data:
                f.write(json.dumps(item, ensure_ascii=False) + '\n')

        self.logger.info(f"✅ Saved dataset to {output_path} ({len(data)} examples)")

    def build_dataset(self, output_path: str, chat_limit: int = 5000, evidence_limit: int = 2500, error_limit: int = 1000):
        """Build complete QLoRA dataset"""
        self.logger.info("🏗️ Building QLoRA dataset...")

        # Connect to databases
        self.connect_databases()

        # Fetch data
        self.logger.info("Fetching chat history...")
        chat_data = self.fetch_chat_history(chat_limit)

        self.logger.info("Fetching evidence data...")
        evidence_data = self.fetch_evidence_data(evidence_limit)

        self.logger.info("Fetching error logs...")
        error_data = self.fetch_error_logs(error_limit)

        # Create training examples
        self.logger.info("Creating instruction tuning data...")
        instructions = self.create_instruction_tuning_data(chat_data)

        self.logger.info("Creating legal analysis data...")
        analyses = self.create_legal_analysis_data(evidence_data)

        self.logger.info("Creating error fixing data...")
        fixes = self.create_error_fixing_data(error_data)

        # Combine and balance
        dataset = self.balance_dataset([instructions, analyses, fixes])

        # Save dataset
        self.save_dataset(dataset, output_path)

        # Print statistics
        sources = {}
        for item in dataset:
            source = item.get('source', 'unknown')
            sources[source] = sources.get(source, 0) + 1

        self.logger.info("📊 Dataset Statistics:")
        for source, count in sources.items():
            self.logger.info(f"  {source}: {count} examples")

        return len(dataset)

def main():
    parser = argparse.ArgumentParser(description="Phase 70 QLoRA Dataset Builder")
    parser.add_argument("--output", required=True, help="Output JSONL file path")
    parser.add_argument("--chat-limit", type=int, default=5000, help="Max chat history examples")
    parser.add_argument("--evidence-limit", type=int, default=2500, help="Max evidence examples")
    parser.add_argument("--error-limit", type=int, default=1000, help="Max error examples")

    args = parser.parse_args()

    logger = setup_logging()

    logger.info("🚀 Phase 70 QLoRA Dataset Builder")
    logger.info("=================================")

    builder = QLoRADatasetBuilder(logger)

    try:
        count = builder.build_dataset(
            args.output,
            args.chat_limit,
            args.evidence_limit,
            args.error_limit
        )

        logger.info(f"✅ Dataset building completed: {count} examples")
        return 0

    except Exception as e:
        logger.error(f"❌ Dataset building failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())