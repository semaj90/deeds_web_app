#!/usr/bin/env python3
"""
LangChain Integration Service for SSE-first Streaming RAG
Connects to existing PostgreSQL + SSE Go service
Adds document chunking, summarization, and chain-of-thought reasoning
"""

import os
import asyncio
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

import psycopg2
import requests
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_ollama import OllamaLLM, OllamaEmbeddings
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_community.vectorstores import PGVector

# Configuration
DATABASE_URL = "postgresql://legal_admin:123456@localhost:5433/legal_ai_db"
OLLAMA_BASE_URL = "http://localhost:11434"
SSE_SERVICE_URL = "http://localhost:9003"
EMBEDDING_MODEL = "embeddinggemma:latest"
GENERATION_MODEL = "gemma3-legal:latest"

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LangChain RAG Service", version="1.0.0")

class DocumentInput(BaseModel):
    content: str
    case_id: Optional[int] = None
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}

class RAGQuery(BaseModel):
    query: str
    case_id: Optional[int] = None
    client_id: str
    enable_summarization: bool = True
    enable_chain_of_thought: bool = True

class LangChainRAGService:
    def __init__(self):
        self.embeddings = OllamaEmbeddings(
            base_url=OLLAMA_BASE_URL,
            model=EMBEDDING_MODEL
        )
        self.llm = OllamaLLM(
            base_url=OLLAMA_BASE_URL,
            model=GENERATION_MODEL,
            temperature=0.1
        )
        
        # Text splitter for document chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            separators=["\n\n", "\n", ".", "!", "?", ";", ":", " ", ""],
            keep_separator=False
        )
        
        # Initialize database connection
        self.db_connection = psycopg2.connect(DATABASE_URL)
        
        # Legal-specific prompt templates
        self.legal_qa_template = PromptTemplate(
            template="""You are a legal AI assistant. Use the following legal context to answer the question.
            
Context:
{context}

Question: {question}

Provide a comprehensive legal analysis that:
1. Directly answers the question
2. References relevant legal principles from the context
3. Explains the reasoning step-by-step
4. Identifies any limitations or exceptions

Answer:""",
            input_variables=["context", "question"]
        )
        
        self.summarization_template = PromptTemplate(
            template="""Summarize the following legal documents and messages for case analysis:

{text}

Provide a concise summary that captures:
- Key legal issues and principles
- Important facts and evidence  
- Procedural status and timeline
- Outstanding questions or concerns

Summary:""",
            input_variables=["text"]
        )
        
    def send_sse_event(self, client_id: str, event_type: str, data: Dict[str, Any]):
        """Send event to SSE service for real-time streaming"""
        try:
            response = requests.post(f"{SSE_SERVICE_URL}/api/v1/events", json={
                "client_id": client_id,
                "event": {
                    "id": str(uuid.uuid4()),
                    "type": event_type,
                    "timestamp": datetime.now().isoformat(),
                    "data": data
                }
            }, timeout=5)
            if response.status_code != 200:
                logger.warning(f"Failed to send SSE event: {response.text}")
        except Exception as e:
            logger.error(f"Error sending SSE event: {e}")
    
    async def chunk_document(self, document: DocumentInput, client_id: str) -> List[str]:
        """Chunk document using LangChain text splitter"""
        self.send_sse_event(client_id, "chunking_started", {
            "document_title": document.title,
            "content_length": len(document.content)
        })
        
        # Split document into chunks
        chunks = self.text_splitter.split_text(document.content)
        
        # Store chunks in database with embeddings
        chunk_ids = []
        for i, chunk in enumerate(chunks):
            try:
                # Generate embedding for chunk
                embedding = await self.generate_embedding(chunk)
                
                # Store in messages table
                chunk_id = self.store_message_chunk(
                    case_id=document.case_id,
                    content=chunk,
                    embedding=embedding,
                    metadata={
                        **document.metadata,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "document_title": document.title
                    }
                )
                chunk_ids.append(chunk_id)
                
                # Send progress event
                self.send_sse_event(client_id, "chunk_processed", {
                    "chunk_id": chunk_id,
                    "chunk_index": i + 1,
                    "total_chunks": len(chunks),
                    "preview": chunk[:100] + "..." if len(chunk) > 100 else chunk
                })
                
            except Exception as e:
                logger.error(f"Error processing chunk {i}: {e}")
                self.send_sse_event(client_id, "chunk_error", {
                    "chunk_index": i,
                    "error": str(e)
                })
        
        self.send_sse_event(client_id, "chunking_complete", {
            "total_chunks": len(chunks),
            "chunk_ids": chunk_ids
        })
        
        return chunk_ids
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using embeddinggemma via LangChain"""
        try:
            embedding = await self.embeddings.aembed_query(text)
            return embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            # Fallback to direct Ollama API
            response = requests.post(f"{OLLAMA_BASE_URL}/api/embeddings", json={
                "model": EMBEDDING_MODEL,
                "prompt": text
            })
            if response.status_code == 200:
                return response.json()["embedding"]
            raise e
    
    def store_message_chunk(self, case_id: Optional[int], content: str, 
                          embedding: List[float], metadata: Dict[str, Any]) -> str:
        """Store message chunk with embedding in PostgreSQL"""
        cursor = self.db_connection.cursor()
        
        # Convert embedding to PostgreSQL vector format
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"
        
        cursor.execute("""
            INSERT INTO messages (case_id, sender, content, embedding, metadata)
            VALUES (%s, %s, %s, %s::vector, %s)
            RETURNING id
        """, (case_id, "langchain_chunker", content, embedding_str, json.dumps(metadata)))
        
        chunk_id = cursor.fetchone()[0]
        self.db_connection.commit()
        cursor.close()
        
        return str(chunk_id)
    
    async def generate_case_summary(self, case_id: int, client_id: str) -> str:
        """Generate streaming case summary using LangChain"""
        self.send_sse_event(client_id, "summarization_started", {
            "case_id": case_id
        })
        
        # Retrieve all messages for the case
        cursor = self.db_connection.cursor()
        cursor.execute("""
            SELECT content FROM messages 
            WHERE case_id = %s 
            ORDER BY created_at DESC
            LIMIT 50
        """, (case_id,))
        
        messages = [row[0] for row in cursor.fetchall()]
        cursor.close()
        
        if not messages:
            return "No messages found for this case."
        
        # Combine messages for summarization
        combined_content = "\n\n".join(messages)
        
        # Generate summary using LangChain
        try:
            summary = await self.llm.ainvoke(
                self.summarization_template.format(text=combined_content)
            )
            
            self.send_sse_event(client_id, "summary_generated", {
                "case_id": case_id,
                "summary": summary,
                "source_messages": len(messages)
            })
            
            return summary
            
        except Exception as e:
            logger.error(f"Summarization failed: {e}")
            self.send_sse_event(client_id, "summarization_error", {
                "case_id": case_id,
                "error": str(e)
            })
            return f"Summarization failed: {str(e)}"
    
    async def chain_of_thought_reasoning(self, query: str, context: str, client_id: str) -> str:
        """Perform chain-of-thought legal reasoning"""
        self.send_sse_event(client_id, "reasoning_started", {
            "query": query
        })
        
        reasoning_prompt = PromptTemplate(
            template="""As a legal AI, think through this question step-by-step:

Question: {question}
Context: {context}

Step-by-step reasoning:
1. **Issue Identification**: What legal issues are presented?
2. **Relevant Law**: What legal principles apply from the context?
3. **Analysis**: How do the facts relate to the legal principles?
4. **Conclusion**: What is the answer and why?

Let me work through this systematically:""",
            input_variables=["question", "context"]
        )
        
        try:
            reasoning = await self.llm.ainvoke(
                reasoning_prompt.format(question=query, context=context)
            )
            
            self.send_sse_event(client_id, "reasoning_complete", {
                "query": query,
                "reasoning": reasoning
            })
            
            return reasoning
            
        except Exception as e:
            logger.error(f"Chain-of-thought reasoning failed: {e}")
            return f"Reasoning failed: {str(e)}"

# Global service instance
langchain_service = LangChainRAGService()

@app.post("/api/v1/documents/chunk")
async def chunk_document(document: DocumentInput, background_tasks: BackgroundTasks):
    """Chunk and embed a document using LangChain"""
    client_id = f"langchain_{uuid.uuid4()}"
    
    background_tasks.add_task(
        langchain_service.chunk_document, document, client_id
    )
    
    return {
        "success": True,
        "message": "Document chunking started",
        "client_id": client_id
    }

@app.post("/api/v1/cases/{case_id}/summarize")
async def summarize_case(case_id: int, client_id: str, background_tasks: BackgroundTasks):
    """Generate case summary using LangChain"""
    background_tasks.add_task(
        langchain_service.generate_case_summary, case_id, client_id
    )
    
    return {
        "success": True,
        "message": "Case summarization started",
        "case_id": case_id,
        "client_id": client_id
    }

@app.post("/api/v1/rag/enhanced")
async def enhanced_rag_query(query: RAGQuery, background_tasks: BackgroundTasks):
    """Enhanced RAG with LangChain chain-of-thought reasoning"""
    
    async def process_enhanced_rag():
        # First, let the Go service handle the basic RAG
        rag_response = requests.post(f"{SSE_SERVICE_URL}/api/v1/rag", 
                                   params={"client_id": query.client_id},
                                   json={
                                       "query": query.query,
                                       "case_id": query.case_id,
                                       "stream": True,
                                       "max_results": 5
                                   })
        
        if rag_response.status_code != 200:
            langchain_service.send_sse_event(query.client_id, "enhanced_rag_error", {
                "error": "Basic RAG failed",
                "details": rag_response.text
            })
            return
        
        # Wait a moment for basic RAG to complete, then add enhancements
        await asyncio.sleep(3)
        
        if query.enable_summarization and query.case_id:
            await langchain_service.generate_case_summary(query.case_id, query.client_id)
        
        if query.enable_chain_of_thought:
            # Get some context for reasoning (simplified)
            context = f"Legal query about: {query.query}"
            await langchain_service.chain_of_thought_reasoning(
                query.query, context, query.client_id
            )
    
    background_tasks.add_task(process_enhanced_rag)
    
    return {
        "success": True,
        "message": "Enhanced RAG processing started",
        "client_id": query.client_id,
        "features": {
            "summarization": query.enable_summarization,
            "chain_of_thought": query.enable_chain_of_thought
        }
    }

@app.get("/api/v1/health")
async def health_check():
    return {
        "service": "langchain-rag-service",
        "status": "healthy",
        "features": [
            "document_chunking",
            "case_summarization", 
            "chain_of_thought_reasoning",
            "enhanced_rag_queries"
        ],
        "models": {
            "embeddings": EMBEDDING_MODEL,
            "generation": GENERATION_MODEL
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9004)