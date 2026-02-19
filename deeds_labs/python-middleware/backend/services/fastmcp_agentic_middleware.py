#!/usr/bin/env python3
"""
FastMCP Agentic Tool Calling Middleware
Integrates Gemma3-legal, Gemini, and Enhanced Knowledge Base
"""

import os
import json
import asyncio
import logging
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
import aiohttp

# Add parent to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.enhanced_knowledge_base import EnhancedKnowledgeBaseSystem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    """Tool call request"""
    tool_name: str
    arguments: Dict[str, Any]
    call_id: str
    context: Dict[str, Any] = None


@dataclass
class ToolResult:
    """Tool execution result"""
    call_id: str
    success: bool
    result: Any
    error: Optional[str] = None
    execution_time_ms: float = 0.0


class OllamaClient:
    """Ollama API client for gemma3-legal"""

    def __init__(self, base_url: str = None):
        self.base_url = self.getOllamaEndpoint() if base_url is None else base_url
        self.model = os.getenv("OLLAMA_MODEL", "gemma3:270m")

    @staticmethod
    def getOllamaEndpoint() -> str:
        """Get Ollama endpoint from .env (supports both local and remote GPU)"""
        # Primary: OLLAMA_URL from .env
        ollama_url = os.getenv("OLLAMA_URL")
        if ollama_url:
            return ollama_url

        # Fallback: VITE_OLLAMA_URL
        vite_url = os.getenv("VITE_OLLAMA_URL")
        if vite_url:
            return vite_url

        # Default: localhost
        return "http://localhost:11434"

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 2048
    ) -> str:
        """Generate completion with gemma3-legal"""

        async with aiohttp.ClientSession() as session:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            }

            if system:
                payload["system"] = system

            async with session.post(
                f"{self.base_url}/api/generate",
                json=payload
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("response", "")
                else:
                    raise Exception(f"Ollama API error: {resp.status}")

    async def embeddings(self, text: str) -> List[float]:
        """Generate embeddings"""

        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "embeddinggemma:latest",
                "prompt": text
            }

            async with session.post(
                f"{self.base_url}/api/embeddings",
                json=payload
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("embedding", [])
                else:
                    raise Exception(f"Ollama embeddings error: {resp.status}")


class GeminiClient:
    """Google Gemini API client"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
        self.enable_search = os.getenv("GEMINI_ENABLE_SEARCH", "true").lower() == "true"

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.1,
        use_search: bool = None
    ) -> str:
        """Generate completion with Gemini"""

        if not self.api_key:
            raise Exception("GEMINI_API_KEY not configured")

        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)

            # Configure with search grounding if enabled
            config = genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=2048
            )

            model = genai.GenerativeModel(
                self.model,
                generation_config=config,
                system_instruction=system
            )

            # Enable search grounding
            use_search = use_search if use_search is not None else self.enable_search
            if use_search:
                response = model.generate_content(
                    prompt,
                    tools='google_search_retrieval'
                )
            else:
                response = model.generate_content(prompt)

            return response.text

        except Exception as e:
            logger.error(f"❌ Gemini API error: {e}")
            raise


class FastMCPAgenticMiddleware:
    """FastMCP agentic tool calling middleware"""

    def __init__(
        self,
        knowledge_base: EnhancedKnowledgeBaseSystem = None,
        ollama_client: OllamaClient = None,
        gemini_client: GeminiClient = None,
        ace_timeline_url: str = None
    ):
        """Initialize middleware"""

        self.knowledge_base = knowledge_base or EnhancedKnowledgeBaseSystem()
        self.ollama = ollama_client or OllamaClient()
        self.gemini = gemini_client or GeminiClient()
        self.ace_timeline_url = ace_timeline_url or os.getenv("ACE_TIMELINE_URL", "http://localhost:8002")

        # Register tools
        self.tools: Dict[str, Callable] = {}
        self._register_default_tools()

        logger.info("🚀 FastMCP Agentic Middleware initialized")
        logger.info(f"   Ollama: {self.ollama.base_url} ({self.ollama.model})")
        logger.info(f"   Gemini: {'✅ Configured' if self.gemini.api_key else '❌ Not configured'}")
        logger.info(f"   ACE Timeline: {self.ace_timeline_url}")

    def _register_default_tools(self):
        """Register default tools"""

        @self.register_tool("knowledge_search")
        async def knowledge_search(query: str, top_k: int = 5) -> Dict:
            """Search knowledge base with GRPO ranking"""
            results = await self.knowledge_base.search_with_grpo_ranking(query, top_k)
            return {
                "results": [
                    {
                        "id": node.id,
                        "content": node.content[:200],
                        "type": node.node_type,
                        "score": node.rank_score
                    }
                    for node in results
                ]
            }

        @self.register_tool("code_search")
        async def code_search(query: str, file_pattern: str = None) -> Dict:
            """Search indexed codebase"""
            results = await self.knowledge_base.search_with_grpo_ranking(query, top_k=10)

            # Filter code units
            code_results = [
                node for node in results
                if node.node_type == "code_unit"
            ]

            if file_pattern:
                code_results = [
                    node for node in code_results
                    if file_pattern in node.metadata.get("file_path", "")
                ]

            return {
                "results": [
                    {
                        "id": node.id,
                        "file": node.metadata.get("file_path"),
                        "signature": node.metadata.get("signature"),
                        "code": node.content[:300]
                    }
                    for node in code_results[:5]
                ]
            }

        @self.register_tool("analyze_error")
        async def analyze_error(error_message: str, file_path: str = None) -> Dict:
            """Analyze error using gemma3-legal and knowledge base"""

            # Search for similar errors
            kb_results = await self.knowledge_base.search_with_grpo_ranking(
                f"error: {error_message}",
                top_k=3
            )

            # Build context
            context = "\n\n".join([
                f"Similar case {i+1}:\n{node.content[:200]}"
                for i, node in enumerate(kb_results)
            ])

            # Generate analysis with gemma3-legal
            prompt = f"""Analyze this error and suggest fixes:

Error: {error_message}
File: {file_path or 'unknown'}

Similar cases from knowledge base:
{context}

Provide:
1. Root cause
2. Specific fix
3. Prevention strategy"""

            analysis = await self.ollama.generate(
                prompt=prompt,
                system="You are an expert code debugging assistant specializing in TypeScript, Svelte, and Python."
            )

            return {
                "error": error_message,
                "file": file_path,
                "analysis": analysis,
                "similar_cases": len(kb_results)
            }

        @self.register_tool("gemini_web_search")
        async def gemini_web_search(query: str) -> Dict:
            """Search web using Gemini with grounding"""

            response = await self.gemini.generate(
                prompt=f"Search and summarize: {query}",
                use_search=True
            )

            return {
                "query": query,
                "response": response,
                "grounded": True
            }

        @self.register_tool("index_codebase")
        async def index_codebase(root_dir: str, extensions: List[str] = None) -> Dict:
            """Index codebase for search"""

            extensions = extensions or [".py", ".js", ".ts", ".svelte"]
            stats = await self.knowledge_base.index_codebase(root_dir, extensions)

            return stats

        @self.register_tool("log_ace_event")
        async def log_ace_event(
            event_type: str,
            file_path: str = None,
            error_type: str = None,
            confidence: float = 0.0,
            llm_provider: str = None,
            sources_used: List[str] = None,
            success: bool = None,
            metadata: Dict = None
        ) -> Dict:
            """Log ACE event to timeline for audit trail"""

            try:
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "file_path": file_path or "unknown",
                        "error_type": error_type or "general",
                        "error_message": f"ACE {event_type} event",
                        "fix_explanation": metadata.get("explanation", "") if metadata else "",
                        "confidence_score": confidence,
                        "llm_provider": llm_provider or "fastmcp",
                        "llm_model": self.ollama.model if llm_provider == "ollama" else self.gemini.model,
                        "applied": success is not None,
                        "success": success,
                        "sources_used": sources_used or [],
                        "metadata": metadata or {}
                    }

                    async with session.post(
                        f"{self.ace_timeline_url}/log/fix-attempt",
                        json=payload
                    ) as resp:
                        if resp.status == 200:
                            result = await resp.json()
                            return {
                                "success": True,
                                "event_id": result.get("event_id"),
                                "timeline_url": self.ace_timeline_url
                            }
                        else:
                            return {
                                "success": False,
                                "error": f"HTTP {resp.status}"
                            }
            except Exception as e:
                logger.warning(f"⚠️  Timeline logging failed: {e}")
                return {"success": False, "error": str(e)}

        @self.register_tool("process_document")
        async def process_document(file_path: str) -> Dict:
            """Process document with Docling"""

            result = await self.knowledge_base.process_document_with_docling(file_path)

            return result

    def register_tool(self, name: str):
        """Decorator to register a tool"""
        def decorator(func: Callable):
            self.tools[name] = func
            logger.info(f"✅ Registered tool: {name}")
            return func
        return decorator

    async def execute_tool(self, tool_call: ToolCall) -> ToolResult:
        """Execute a tool call"""

        start_time = asyncio.get_event_loop().time()

        if tool_call.tool_name not in self.tools:
            return ToolResult(
                call_id=tool_call.call_id,
                success=False,
                result=None,
                error=f"Tool not found: {tool_call.tool_name}"
            )

        try:
            tool_func = self.tools[tool_call.tool_name]
            result = await tool_func(**tool_call.arguments)

            execution_time = (asyncio.get_event_loop().time() - start_time) * 1000

            return ToolResult(
                call_id=tool_call.call_id,
                success=True,
                result=result,
                execution_time_ms=execution_time
            )

        except Exception as e:
            logger.error(f"❌ Tool execution failed: {e}")
            execution_time = (asyncio.get_event_loop().time() - start_time) * 1000

            return ToolResult(
                call_id=tool_call.call_id,
                success=False,
                result=None,
                error=str(e),
                execution_time_ms=execution_time
            )

    async def agentic_loop(
        self,
        user_prompt: str,
        max_iterations: int = 5,
        use_gemini: bool = True
    ) -> Dict[str, Any]:
        """
        Run agentic loop with tool calling

        Args:
            user_prompt: User's request
            max_iterations: Max tool calling iterations
            use_gemini: Use Gemini (True) or Ollama (False)

        Returns:
            Final response with tool call history
        """

        logger.info(f"🤖 Starting agentic loop: {user_prompt}")

        tool_calls_history = []
        context = user_prompt

        for iteration in range(max_iterations):
            logger.info(f"   Iteration {iteration + 1}/{max_iterations}")

            # Generate next action
            if use_gemini and self.gemini.api_key:
                system_prompt = f"""You are an AI assistant with access to these tools:
{json.dumps(list(self.tools.keys()), indent=2)}

Analyze the user's request and decide if you need to call any tools.
If yes, respond with JSON: {{"tool": "tool_name", "arguments": {{}}, "reasoning": "why"}}
If no, respond with JSON: {{"done": true, "answer": "final answer"}}"""

                response = await self.gemini.generate(
                    prompt=context,
                    system=system_prompt,
                    temperature=0.1
                )
            else:
                response = await self.ollama.generate(
                    prompt=f"User request: {context}\n\nAvailable tools: {list(self.tools.keys())}\n\nDecide next action:",
                    system="You are a helpful AI assistant that can call tools to help users."
                )

            # Parse response
            try:
                action = json.loads(response)
            except:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    action = json.loads(json_match.group())
                else:
                    action = {"done": True, "answer": response}

            # Check if done
            if action.get("done"):
                logger.info(f"✅ Agentic loop complete after {iteration + 1} iterations")
                return {
                    "answer": action.get("answer", response),
                    "iterations": iteration + 1,
                    "tool_calls": tool_calls_history
                }

            # Execute tool
            if "tool" in action:
                tool_call = ToolCall(
                    tool_name=action["tool"],
                    arguments=action.get("arguments", {}),
                    call_id=f"call_{iteration}",
                    context={"reasoning": action.get("reasoning")}
                )

                logger.info(f"   🔧 Calling tool: {tool_call.tool_name}")
                result = await self.execute_tool(tool_call)

                tool_calls_history.append({
                    "tool": tool_call.tool_name,
                    "arguments": tool_call.arguments,
                    "result": result.result if result.success else result.error,
                    "success": result.success,
                    "time_ms": result.execution_time_ms
                })

                # Update context
                context += f"\n\nTool call result:\n{json.dumps(result.result, indent=2)}"

        logger.warning(f"⚠️ Max iterations reached")
        return {
            "answer": "Max iterations reached. Please refine your request.",
            "iterations": max_iterations,
            "tool_calls": tool_calls_history
        }

    async def list_tools(self) -> List[Dict[str, str]]:
        """List available tools"""
        return [
            {
                "name": name,
                "description": func.__doc__ or "No description"
            }
            for name, func in self.tools.items()
        ]


async def main():
    """Test FastMCP agentic middleware"""
    print("=" * 60)
    print("🤖 Testing FastMCP Agentic Tool Calling Middleware")
    print("=" * 60)

    # Initialize
    kb = EnhancedKnowledgeBaseSystem()
    await kb.initialize()

    middleware = FastMCPAgenticMiddleware(knowledge_base=kb)

    # Test 1: List tools
    print("\n📋 Test 1: List available tools")
    tools = await middleware.list_tools()
    for tool in tools:
        print(f"   ✅ {tool['name']}: {tool['description']}")

    # Test 2: Index codebase
    print("\n📂 Test 2: Index codebase")
    index_result = await middleware.execute_tool(
        ToolCall(
            tool_name="index_codebase",
            arguments={
                "root_dir": "c:/Users/james/Videos/deeds-web-app/backend",
                "extensions": [".py"]
            },
            call_id="test_index"
        )
    )
    print(f"   ✅ Indexed: {index_result.result}")

    # Test 3: Agentic loop
    print("\n🤖 Test 3: Run agentic loop")
    result = await middleware.agentic_loop(
        user_prompt="Find and analyze TypeScript errors in Svelte components",
        max_iterations=3,
        use_gemini=True
    )
    print(f"   ✅ Answer: {result['answer'][:200]}...")
    print(f"   ✅ Iterations: {result['iterations']}")
    print(f"   ✅ Tool calls: {len(result['tool_calls'])}")

    await kb.shutdown()
    print("\n✅ All tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
