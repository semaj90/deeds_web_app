"""
Chat Service: Message storage, context management, and conversation persistence

Provides:
- Message storage and retrieval from Postgres
- Context window management (last 10 messages)
- Conversation persistence
- Latency tracking and logging
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

import asyncpg
from sqlalchemy import create_engine, Column, String, DateTime, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

Base = declarative_base()

# Database DSN configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
)


@dataclass
class Message:
    """Chat message"""
    id: str
    case_id: str
    user_id: str
    role: str  # "user", "assistant", "prosecutor", "detective"
    content: str
    timestamp: datetime
    evidence_references: List[str]
    citations: List[str]


@dataclass
class Conversation:
    """Conversation thread"""
    id: str
    case_id: str
    user_id: str
    created_at: datetime
    last_updated: datetime
    message_count: int
    evidence_memory: Dict[str, float]


class ChatService:
    """Chat service with message storage and context management"""

    def __init__(
        self,
        postgres_url: str = "postgresql://legal_admin:123456@localhost:5432/legal_ai_db",
        context_window_size: int = 10,
    ):
        self.postgres_url = postgres_url
        self.context_window_size = context_window_size
        self.pool: Optional[asyncpg.pool.Pool] = None

        logger.info(f"✅ Chat Service initialized")
        logger.info(f"   Postgres: {postgres_url}")
        logger.info(f"   Context Window: {context_window_size} messages")

    async def connect(self):
        """Connect to Postgres"""
        try:
            self.pool = await asyncpg.create_pool(
                self.postgres_url,
                min_size=5,
                max_size=20,
            )
            logger.info("✅ Connected to Postgres")
        except Exception as e:
            logger.error(f"Failed to connect to Postgres: {e}")
            raise

    async def disconnect(self):
        """Disconnect from Postgres"""
        if self.pool:
            await self.pool.close()
            logger.info("✅ Disconnected from Postgres")

    async def _ensure_connected(self):
        """Ensure connection is active"""
        if self.pool is None:
            await self.connect()

    async def create_conversation(
        self,
        case_id: str,
        user_id: str,
    ) -> Conversation:
        """Create new conversation"""
        try:
            await self._ensure_connected()

            conversation_id = str(uuid4())
            now = datetime.now()

            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO conversations (id, case_id, user_id, created_at, last_updated, message_count)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    conversation_id,
                    case_id,
                    user_id,
                    now,
                    now,
                    0,
                )

            logger.info(f"✅ Created conversation: {conversation_id}")

            return Conversation(
                id=conversation_id,
                case_id=case_id,
                user_id=user_id,
                created_at=now,
                last_updated=now,
                message_count=0,
                evidence_memory={},
            )

        except Exception as e:
            logger.error(f"Error creating conversation: {e}")
            raise

    async def store_message(
        self,
        case_id: str,
        user_id: str,
        role: str,
        content: str,
        evidence_references: Optional[List[str]] = None,
        citations: Optional[List[str]] = None,
    ) -> Message:
        """Store message in Postgres"""
        start_time = time.time()

        try:
            await self._ensure_connected()

            message_id = str(uuid4())
            now = datetime.now()
            evidence_refs = evidence_references or []
            citation_list = citations or []

            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO messages (id, case_id, user_id, role, content, timestamp, evidence_references, citations)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    message_id,
                    case_id,
                    user_id,
                    role,
                    content,
                    now,
                    json.dumps(evidence_refs),
                    json.dumps(citation_list),
                )

                # Update conversation
                await conn.execute(
                    """
                    UPDATE conversations
                    SET message_count = message_count + 1, last_updated = $1
                    WHERE case_id = $2
                    """,
                    now,
                    case_id,
                )

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ Stored message {message_id} in {latency_ms}ms")

            return Message(
                id=message_id,
                case_id=case_id,
                user_id=user_id,
                role=role,
                content=content,
                timestamp=now,
                evidence_references=evidence_refs,
                citations=citation_list,
            )

        except Exception as e:
            logger.error(f"Error storing message: {e}")
            raise

    async def get_conversation_history(
        self,
        case_id: str,
        limit: int = 10,
    ) -> List[Message]:
        """Get conversation history (last N messages)"""
        try:
            await self._ensure_connected()

            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT id, case_id, user_id, role, content, timestamp, evidence_references, citations
                    FROM messages
                    WHERE case_id = $1
                    ORDER BY timestamp DESC
                    LIMIT $2
                    """,
                    case_id,
                    limit,
                )

            messages = []
            for row in reversed(rows):  # Reverse to get chronological order
                messages.append(
                    Message(
                        id=row["id"],
                        case_id=row["case_id"],
                        user_id=row["user_id"],
                        role=row["role"],
                        content=row["content"],
                        timestamp=row["timestamp"],
                        evidence_references=json.loads(row["evidence_references"] or "[]"),
                        citations=json.loads(row["citations"] or "[]"),
                    )
                )

            logger.info(f"✅ Retrieved {len(messages)} messages for case {case_id}")
            return messages

        except Exception as e:
            logger.error(f"Error retrieving conversation history: {e}")
            raise

    async def get_context_window(
        self,
        case_id: str,
    ) -> str:
        """Get formatted context window (last 10 messages)"""
        try:
            messages = await self.get_conversation_history(case_id, self.context_window_size)

            # Format as conversation history
            context_lines = []
            for msg in messages:
                role_label = {
                    "user": "User",
                    "assistant": "AI Legal Assistant",
                    "prosecutor": "Prosecutor",
                    "detective": "Detective",
                }.get(msg.role, msg.role)

                context_lines.append(f"{role_label}: {msg.content}")

            context = "\n".join(context_lines)
            logger.info(f"✅ Prepared context window ({len(messages)} messages)")

            return context

        except Exception as e:
            logger.error(f"Error preparing context window: {e}")
            raise

    async def get_conversation(self, case_id: str) -> Optional[Conversation]:
        """Get conversation metadata"""
        try:
            await self._ensure_connected()

            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT id, case_id, user_id, created_at, last_updated, message_count
                    FROM conversations
                    WHERE case_id = $1
                    """,
                    case_id,
                )

            if row:
                return Conversation(
                    id=row["id"],
                    case_id=row["case_id"],
                    user_id=row["user_id"],
                    created_at=row["created_at"],
                    last_updated=row["last_updated"],
                    message_count=row["message_count"],
                    evidence_memory={},
                )
            else:
                return None

        except Exception as e:
            logger.error(f"Error retrieving conversation: {e}")
            raise

    async def delete_conversation(self, case_id: str) -> bool:
        """Delete conversation and all messages"""
        try:
            await self._ensure_connected()

            async with self.pool.acquire() as conn:
                # Delete messages
                await conn.execute(
                    "DELETE FROM messages WHERE case_id = $1",
                    case_id,
                )

                # Delete conversation
                await conn.execute(
                    "DELETE FROM conversations WHERE case_id = $1",
                    case_id,
                )

            logger.info(f"✅ Deleted conversation for case {case_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting conversation: {e}")
            raise

    async def count_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation)"""
        # Rough approximation: 1 token ≈ 4 characters
        return len(text) // 4

    async def close(self):
        """Close service"""
        await self.disconnect()
        logger.info("✅ Chat Service closed")


# Global chat service instance
chat_service: Optional[ChatService] = None


async def get_chat_service() -> ChatService:
    """Get or create chat service instance"""
    global chat_service

    if chat_service is None:
        chat_service = ChatService()
        await chat_service.connect()

    return chat_service


async def close_chat_service():
    """Close chat service"""
    global chat_service

    if chat_service:
        await chat_service.close()
        chat_service = None
