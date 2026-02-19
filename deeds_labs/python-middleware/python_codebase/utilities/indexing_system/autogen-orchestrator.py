#!/usr/bin/env python3
"""
AutoGen Orchestration for Intelligent Document Processing
Multi-agent system for code analysis, embedding generation, and semantic understanding
"""

import asyncio
import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from queue import Queue
import threading
import websockets
import requests
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class DocumentContext:
    file_path: str
    content: str
    language: str
    size: int
    last_modified: float
    embedding: Optional[List[float]] = None
    analysis: Optional[Dict[str, Any]] = None
    complexity_score: float = 0.0
    importance_score: float = 0.0
    dependencies: List[str] = None
    
    def __post_init__(self):
        if self.dependencies is None:
            self.dependencies = []

class CodeAnalysisAgent:
    """Agent responsible for analyzing code structure and complexity"""
    
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.logger = logging.getLogger(f"CodeAnalysisAgent-{agent_id}")
        
    async def analyze_document(self, doc: DocumentContext) -> Dict[str, Any]:
        """Analyze document for complexity, imports, functions, etc."""
        self.logger.info(f"Analyzing {doc.file_path}")
        
        analysis = {
            "lines_of_code": len(doc.content.splitlines()),
            "functions": self._extract_functions(doc.content, doc.language),
            "imports": self._extract_imports(doc.content, doc.language),
            "complexity": self._calculate_complexity(doc.content, doc.language),
            "documentation_ratio": self._calculate_doc_ratio(doc.content, doc.language),
            "timestamp": time.time()
        }
        
        # Calculate importance score based on analysis
        doc.importance_score = self._calculate_importance(analysis)
        doc.complexity_score = analysis["complexity"]
        doc.analysis = analysis
        
        return analysis
    
    def _extract_functions(self, content: str, language: str) -> List[str]:
        """Extract function names based on language"""
        functions = []
        lines = content.splitlines()
        
        if language == "python":
            for line in lines:
                line = line.strip()
                if line.startswith("def ") or line.startswith("async def "):
                    func_name = line.split("(")[0].split()[-1]
                    functions.append(func_name)
        elif language in ["javascript", "typescript"]:
            for line in lines:
                line = line.strip()
                if "function " in line or " => " in line:
                    # Basic function extraction
                    functions.append("detected_function")
        elif language == "go":
            for line in lines:
                line = line.strip()
                if line.startswith("func "):
                    func_name = line.split("(")[0].replace("func ", "")
                    functions.append(func_name.strip())
        
        return functions
    
    def _extract_imports(self, content: str, language: str) -> List[str]:
        """Extract import statements"""
        imports = []
        lines = content.splitlines()
        
        if language == "python":
            for line in lines:
                line = line.strip()
                if line.startswith("import ") or line.startswith("from "):
                    imports.append(line)
        elif language in ["javascript", "typescript"]:
            for line in lines:
                line = line.strip()
                if line.startswith("import ") and " from " in line:
                    imports.append(line)
        elif language == "go":
            in_import_block = False
            for line in lines:
                line = line.strip()
                if line.startswith("import ("):
                    in_import_block = True
                elif line == ")" and in_import_block:
                    in_import_block = False
                elif in_import_block or line.startswith("import "):
                    imports.append(line)
        
        return imports
    
    def _calculate_complexity(self, content: str, language: str) -> float:
        """Calculate cyclomatic complexity estimate"""
        complexity_keywords = {
            "python": ["if", "elif", "for", "while", "try", "except", "with"],
            "javascript": ["if", "for", "while", "switch", "try", "catch"],
            "typescript": ["if", "for", "while", "switch", "try", "catch"],
            "go": ["if", "for", "switch", "select"],
            "svelte": ["if", "each", "await"]
        }
        
        keywords = complexity_keywords.get(language, ["if", "for", "while"])
        complexity = 1  # Base complexity
        
        for keyword in keywords:
            complexity += content.count(f" {keyword} ") + content.count(f"\t{keyword} ")
        
        return min(complexity / max(len(content.splitlines()), 1) * 100, 10.0)
    
    def _calculate_doc_ratio(self, content: str, language: str) -> float:
        """Calculate documentation to code ratio"""
        lines = content.splitlines()
        doc_lines = 0
        
        comment_prefixes = {
            "python": ["#", '"""', "'''"],
            "javascript": ["//", "/*", "*"],
            "typescript": ["//", "/*", "*"],
            "go": ["//", "/*"],
            "svelte": ["<!--", "//"]
        }
        
        prefixes = comment_prefixes.get(language, ["//", "#"])
        
        for line in lines:
            line = line.strip()
            for prefix in prefixes:
                if line.startswith(prefix):
                    doc_lines += 1
                    break
        
        return doc_lines / max(len(lines), 1)
    
    def _calculate_importance(self, analysis: Dict[str, Any]) -> float:
        """Calculate document importance score"""
        score = 0.0
        
        # More functions = more important
        score += len(analysis["functions"]) * 0.1
        
        # More imports = more connected
        score += len(analysis["imports"]) * 0.05
        
        # Higher complexity can mean more important (up to a point)
        score += min(analysis["complexity"] * 0.1, 0.5)
        
        # Better documentation = higher quality
        score += analysis["documentation_ratio"] * 0.3
        
        return min(score, 1.0)

class EmbeddingAgent:
    """Agent responsible for generating embeddings via Ollama"""
    
    def __init__(self, agent_id: str, ollama_url: str = "http://localhost:11434"):
        self.agent_id = agent_id
        self.ollama_url = ollama_url
        self.logger = logging.getLogger(f"EmbeddingAgent-{agent_id}")
        self.session = requests.Session()
        
    async def generate_embedding(self, doc: DocumentContext) -> List[float]:
        """Generate embedding for document content"""
        self.logger.info(f"Generating embedding for {doc.file_path}")
        
        try:
            # Prepare content for embedding (limit size)
            content = self._prepare_content(doc.content, doc.language)
            
            response = await asyncio.get_event_loop().run_in_executor(
                None, self._call_ollama_embedding, content
            )
            
            if response and "embedding" in response:
                doc.embedding = response["embedding"]
                return response["embedding"]
            else:
                self.logger.error(f"No embedding returned for {doc.file_path}")
                return []
                
        except Exception as e:
            self.logger.error(f"Failed to generate embedding for {doc.file_path}: {e}")
            return []
    
    def _prepare_content(self, content: str, language: str) -> str:
        """Prepare content for embedding generation"""
        # Limit content size to prevent token overflow
        max_chars = 8000
        
        if len(content) <= max_chars:
            return content
        
        # For code files, prioritize the beginning (imports, function definitions)
        lines = content.splitlines()
        
        # Take first portion and last portion
        first_portion = int(max_chars * 0.7)
        last_portion = int(max_chars * 0.3)
        
        first_part = content[:first_portion]
        last_part = content[-last_portion:]
        
        return f"{first_part}\n\n... [truncated] ...\n\n{last_part}"
    
    def _call_ollama_embedding(self, content: str) -> Dict[str, Any]:
        """Call Ollama API for embedding generation"""
        try:
            response = self.session.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": "nomic-embed-text",
                    "prompt": content
                },
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                self.logger.error(f"Ollama API error: {response.status_code}")
                return {}
                
        except Exception as e:
            self.logger.error(f"Ollama API call failed: {e}")
            return {}

class CoordinatorAgent:
    """Master agent that coordinates the analysis workflow"""
    
    def __init__(self, max_workers: int = 8):
        self.max_workers = max_workers
        self.logger = logging.getLogger("CoordinatorAgent")
        self.analysis_agents: List[CodeAnalysisAgent] = []
        self.embedding_agents: List[EmbeddingAgent] = []
        self.document_queue = Queue()
        self.results_queue = Queue()
        self.processed_count = 0
        self.total_count = 0
        self.start_time = time.time()
        
        # Initialize agents
        for i in range(max_workers // 2):
            self.analysis_agents.append(CodeAnalysisAgent(f"analyzer-{i}"))
            self.embedding_agents.append(EmbeddingAgent(f"embedder-{i}"))
    
    async def process_codebase(self, root_path: str) -> List[DocumentContext]:
        """Process entire codebase with multi-agent orchestration"""
        self.logger.info(f"Starting multi-agent processing of {root_path}")
        
        # Phase 1: Discover all files
        documents = await self._discover_documents(root_path)
        self.total_count = len(documents)
        
        self.logger.info(f"Discovered {len(documents)} documents to process")
        
        # Phase 2: Process documents concurrently
        processed_docs = await self._process_documents_parallel(documents)
        
        # Phase 3: Generate summary statistics
        stats = self._generate_statistics(processed_docs)
        self.logger.info(f"Processing complete. Stats: {stats}")
        
        return processed_docs
    
    async def _discover_documents(self, root_path: str) -> List[DocumentContext]:
        """Discover all relevant documents in the codebase"""
        documents = []
        supported_extensions = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.jsx': 'javascript',
            '.go': 'go',
            '.svelte': 'svelte',
            '.md': 'markdown',
            '.json': 'json',
            '.sql': 'sql',
            '.css': 'css',
            '.scss': 'scss'
        }
        
        root_path_obj = Path(root_path)
        
        # Skip certain directories
        skip_dirs = {
            'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
            'vendor', 'target', '.vscode', '.idea'
        }
        
        for file_path in root_path_obj.rglob('*'):
            if file_path.is_file():
                # Skip if in ignored directory
                if any(skip_dir in file_path.parts for skip_dir in skip_dirs):
                    continue
                
                extension = file_path.suffix.lower()
                if extension in supported_extensions:
                    try:
                        content = file_path.read_text(encoding='utf-8', errors='ignore')
                        stat = file_path.stat()
                        
                        # Skip very large files (>1MB)
                        if stat.st_size > 1024 * 1024:
                            continue
                        
                        doc = DocumentContext(
                            file_path=str(file_path),
                            content=content,
                            language=supported_extensions[extension],
                            size=stat.st_size,
                            last_modified=stat.st_mtime
                        )
                        
                        documents.append(doc)
                        
                    except Exception as e:
                        self.logger.warning(f"Skipping {file_path}: {e}")
        
        return documents
    
    async def _process_documents_parallel(self, documents: List[DocumentContext]) -> List[DocumentContext]:
        """Process documents using parallel agent execution"""
        semaphore = asyncio.Semaphore(self.max_workers)
        
        async def process_single_document(doc: DocumentContext) -> DocumentContext:
            async with semaphore:
                # Step 1: Code analysis
                analyzer = self.analysis_agents[self.processed_count % len(self.analysis_agents)]
                await analyzer.analyze_document(doc)
                
                # Step 2: Embedding generation
                embedder = self.embedding_agents[self.processed_count % len(self.embedding_agents)]
                await embedder.generate_embedding(doc)
                
                self.processed_count += 1
                
                # Log progress
                if self.processed_count % 50 == 0:
                    elapsed = time.time() - self.start_time
                    rate = self.processed_count / elapsed
                    self.logger.info(f"Processed {self.processed_count}/{self.total_count} documents ({rate:.1f} docs/sec)")
                
                return doc
        
        # Process all documents concurrently
        tasks = [process_single_document(doc) for doc in documents]
        processed_documents = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        valid_documents = [doc for doc in processed_documents if isinstance(doc, DocumentContext)]
        
        return valid_documents
    
    def _generate_statistics(self, documents: List[DocumentContext]) -> Dict[str, Any]:
        """Generate processing statistics"""
        if not documents:
            return {}
        
        total_lines = sum(doc.analysis.get('lines_of_code', 0) if doc.analysis else 0 
                         for doc in documents)
        
        languages = {}
        for doc in documents:
            languages[doc.language] = languages.get(doc.language, 0) + 1
        
        avg_complexity = sum(doc.complexity_score for doc in documents) / len(documents)
        avg_importance = sum(doc.importance_score for doc in documents) / len(documents)
        
        embedded_count = sum(1 for doc in documents if doc.embedding)
        
        return {
            "total_documents": len(documents),
            "total_lines_of_code": total_lines,
            "language_distribution": languages,
            "average_complexity": avg_complexity,
            "average_importance": avg_importance,
            "documents_with_embeddings": embedded_count,
            "processing_time": time.time() - self.start_time
        }

class AutoGenOrchestrator:
    """Main orchestrator that manages the multi-agent workflow"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config = self._load_config(config_path)
        self.coordinator = CoordinatorAgent(
            max_workers=self.config.get('max_workers', 8)
        )
        self.logger = logging.getLogger("AutoGenOrchestrator")
        
        # WebSocket server for real-time updates
        self.websocket_clients = set()
        
    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        """Load configuration from file or use defaults"""
        default_config = {
            "max_workers": 8,
            "ollama_url": "http://localhost:11434",
            "websocket_port": 8083,
            "batch_size": 50,
            "enable_real_time_updates": True
        }
        
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    file_config = json.load(f)
                    default_config.update(file_config)
            except Exception as e:
                self.logger.warning(f"Failed to load config from {config_path}: {e}")
        
        return default_config
    
    async def start_indexing(self, root_path: str) -> List[DocumentContext]:
        """Start the complete indexing process"""
        self.logger.info(f"AutoGen orchestrator starting indexing of {root_path}")
        
        try:
            # Start WebSocket server for real-time updates
            if self.config.get("enable_real_time_updates"):
                asyncio.create_task(self._start_websocket_server())
            
            # Process the codebase
            documents = await self.coordinator.process_codebase(root_path)
            
            # Save results
            await self._save_results(documents, root_path)
            
            self.logger.info("AutoGen orchestration completed successfully")
            return documents
            
        except Exception as e:
            self.logger.error(f"Orchestration failed: {e}")
            raise
    
    async def _save_results(self, documents: List[DocumentContext], root_path: str):
        """Save processing results to JSON file"""
        output_file = os.path.join(os.path.dirname(root_path), "indexing_results.json")
        
        # Convert documents to serializable format
        results = {
            "metadata": {
                "total_documents": len(documents),
                "processing_time": time.time(),
                "root_path": root_path
            },
            "documents": []
        }
        
        for doc in documents:
            doc_data = {
                "file_path": doc.file_path,
                "language": doc.language,
                "size": doc.size,
                "complexity_score": doc.complexity_score,
                "importance_score": doc.importance_score,
                "analysis": doc.analysis,
                "has_embedding": bool(doc.embedding),
                "embedding_size": len(doc.embedding) if doc.embedding else 0
            }
            results["documents"].append(doc_data)
        
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        self.logger.info(f"Results saved to {output_file}")
    
    async def _start_websocket_server(self):
        """Start WebSocket server for real-time updates"""
        async def handle_client(websocket, path):
            self.websocket_clients.add(websocket)
            try:
                await websocket.wait_closed()
            finally:
                self.websocket_clients.remove(websocket)
        
        port = self.config.get("websocket_port", 8083)
        self.logger.info(f"Starting WebSocket server on port {port}")
        
        await websockets.serve(handle_client, "localhost", port)

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="AutoGen Codebase Indexing Orchestrator")
    parser.add_argument("path", help="Root path to index")
    parser.add_argument("--config", help="Configuration file path")
    parser.add_argument("--workers", type=int, default=8, help="Number of worker agents")
    
    args = parser.parse_args()
    
    # Override config with command line args
    config_overrides = {
        "max_workers": args.workers
    }
    
    orchestrator = AutoGenOrchestrator(args.config)
    orchestrator.config.update(config_overrides)
    
    try:
        documents = await orchestrator.start_indexing(args.path)
        print(f"\n✅ Successfully processed {len(documents)} documents")
        
        # Print summary statistics
        stats = orchestrator.coordinator._generate_statistics(documents)
        print(f"📊 Statistics:")
        print(f"   Total lines of code: {stats.get('total_lines_of_code', 0):,}")
        print(f"   Language distribution: {stats.get('language_distribution', {})}")
        print(f"   Average complexity: {stats.get('average_complexity', 0):.2f}")
        print(f"   Documents with embeddings: {stats.get('documents_with_embeddings', 0)}")
        print(f"   Processing time: {stats.get('processing_time', 0):.1f} seconds")
        
    except KeyboardInterrupt:
        print("\n⏹️ Indexing interrupted by user")
    except Exception as e:
        print(f"\n❌ Indexing failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))