# Legal AI Model Orchestrator - vLLM, WebASM, AutoGen, CrewAI integration
import asyncio
import json
import logging
import os
import time
from typing import List, Dict, Optional, AsyncGenerator, Any, Union
from dataclasses import dataclass, asdict
from enum import Enum
import numpy as np
import torch
from contextlib import asynccontextmanager
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, update

# Multi-model imports
try:
    from vllm import LLM, SamplingParams
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.engine.arg_utils import AsyncEngineArgs
    VLLM_AVAILABLE = True
except ImportError:
    VLLM_AVAILABLE = False
    logging.warning("vLLM not available")

try:
    import autogen
    from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager
    AUTOGEN_AVAILABLE = True
except ImportError:
    AUTOGEN_AVAILABLE = False
    logging.warning("AutoGen not available")

try:
    from crewai import Agent, Task, Crew, Process
    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False
    logging.warning("CrewAI not available")

from .memory_mapper import MemoryMappedTensorCache
from .rl_optimizer import ReinforcementLearningOptimizer

class AIModelType(Enum):
    GEMMA3_LEGAL = "gemma3-legal-latest"
    GEMMA_LOCAL = "gemma-270mb-wasm"
    AUTOGEN = "autogen-multi-agent"
    CREWAI = "crew-ai-workflow"

@dataclass
class ModelConfig:
    model_type: AIModelType
    model_path: str
    max_tokens: int = 1024
    temperature: float = 0.7
    gpu_layers: int = 35
    context_length: int = 4096
    enable_kv_cache: bool = True
    enable_rl_optimization: bool = True

@dataclass
class InferenceRequest:
    user_id: str
    case_id: str
    messages: List[Dict[str, str]]
    model_preference: AIModelType
    use_cache: bool = True
    enable_rl: bool = True
    agent_config: Optional[Dict] = None
    workflow_config: Optional[Dict] = None

@dataclass
class InferenceResponse:
    response: str
    model_used: str
    processing_time: float
    token_count: int
    cache_hit: bool
    rl_improvement: Optional[float] = None
    agent_chain: Optional[List[str]] = None
    tensor_ids: List[str] = None

class LegalModelOrchestrator:
    """Main orchestrator for all AI models and workflows"""

    def __init__(self):
        self.models: Dict[AIModelType, Any] = {}
        self.memory_cache = MemoryMappedTensorCache()
        self.rl_optimizer = ReinforcementLearningOptimizer()
        self.redis_client: Optional[redis.Redis] = None
        self.db_session: Optional[AsyncSession] = None

        # Model configurations
        self.model_configs = {
            AIModelType.GEMMA3_LEGAL: ModelConfig(
                model_type=AIModelType.GEMMA3_LEGAL,
                model_path="unsloth/gemma-2-2b-it-bnb-4bit",  # Legal fine-tuned
                max_tokens=2048,
                temperature=0.7,
                gpu_layers=35
            ),
            AIModelType.GEMMA_LOCAL: ModelConfig(
                model_type=AIModelType.GEMMA_LOCAL,
                model_path="./models/gemma-270mb.onnx",
                max_tokens=512,
                temperature=0.8,
                gpu_layers=0  # CPU only for WASM
            )
        }

    async def initialize(self, redis_url: str = "redis://localhost:6379"):
        """Initialize all models and connections"""
        self.redis_client = await redis.from_url(
            redis_url,
            password=os.getenv("REDIS_PASSWORD", "redis")
        )

        # Initialize vLLM Gemma3 legal model
        if VLLM_AVAILABLE:
            await self._init_vllm_model()

        # Initialize local WebASM model
        await self._init_webasm_model()

        # Initialize multi-agent systems
        if AUTOGEN_AVAILABLE:
            await self._init_autogen()

        if CREWAI_AVAILABLE:
            await self._init_crewai()

        # Initialize RL optimizer
        await self.rl_optimizer.initialize(self.memory_cache)

        logging.info("Legal Model Orchestrator initialized successfully")

    async def _init_vllm_model(self):
        """Initialize vLLM with Gemma3 legal model"""
        config = self.model_configs[AIModelType.GEMMA3_LEGAL]

        engine_args = AsyncEngineArgs(
            model=config.model_path,
            tensor_parallel_size=1,
            gpu_memory_utilization=0.8,
            max_model_len=config.context_length,
            enable_prefix_caching=True,
            enforce_eager=False,
            quantization="bitsandbytes",  # 4-bit quantization for efficiency
            load_format="auto",
            trust_remote_code=True
        )

        self.models[AIModelType.GEMMA3_LEGAL] = await AsyncLLMEngine.from_engine_args(engine_args)
        logging.info("vLLM Gemma3 legal model initialized")

    async def _init_webasm_model(self):
        """Initialize WebAssembly local model interface"""
        # This will be called by the frontend WebAssembly module
        self.models[AIModelType.GEMMA_LOCAL] = {
            "type": "webasm",
            "model_path": "./models/gemma-270mb.onnx",
            "initialized": True
        }
        logging.info("WebAssembly local model interface initialized")

    async def _init_autogen(self):
        """Initialize AutoGen multi-agent system"""
        if not AUTOGEN_AVAILABLE:
            return

        # Define legal specialist agents
        legal_researcher = AssistantAgent(
            name="legal_researcher",
            system_message="""You are a legal research specialist. Your role is to:
            1. Research relevant case law and precedents
            2. Identify applicable statutes and regulations
            3. Provide comprehensive legal context
            4. Flag potential legal risks and opportunities""",
            llm_config={"model": "gpt-4", "temperature": 0.3}
        )

        contract_analyst = AssistantAgent(
            name="contract_analyst",
            system_message="""You are a contract analysis expert. Your role is to:
            1. Review contract terms and conditions
            2. Identify potential risks and liabilities
            3. Suggest improvements and modifications
            4. Ensure compliance with relevant laws""",
            llm_config={"model": "gpt-4", "temperature": 0.2}
        )

        compliance_checker = AssistantAgent(
            name="compliance_checker",
            system_message="""You are a compliance verification specialist. Your role is to:
            1. Check regulatory compliance
            2. Identify potential violations
            3. Recommend corrective actions
            4. Ensure adherence to industry standards""",
            llm_config={"model": "gpt-4", "temperature": 0.1}
        )

        coordinator = UserProxyAgent(
            name="legal_coordinator",
            human_input_mode="NEVER",
            max_consecutive_auto_reply=10,
            code_execution_config=False
        )

        self.models[AIModelType.AUTOGEN] = {
            "agents": [legal_researcher, contract_analyst, compliance_checker],
            "coordinator": coordinator,
            "group_chat": None  # Will be created per session
        }

        logging.info("AutoGen multi-agent system initialized")

    async def _init_crewai(self):
        """Initialize CrewAI workflow system"""
        if not CREWAI_AVAILABLE:
            return

        # Define CrewAI agents for legal workflows
        legal_analyst = Agent(
            role="Legal Analyst",
            goal="Analyze legal documents and provide comprehensive insights",
            backstory="Expert legal analyst with 10+ years in contract law",
            verbose=True,
            allow_delegation=False
        )

        research_specialist = Agent(
            role="Legal Researcher",
            goal="Research relevant case law and legal precedents",
            backstory="Specialized in legal research and precedent analysis",
            verbose=True,
            allow_delegation=False
        )

        risk_assessor = Agent(
            role="Risk Assessment Specialist",
            goal="Identify and evaluate legal risks",
            backstory="Expert in legal risk assessment and mitigation strategies",
            verbose=True,
            allow_delegation=False
        )

        self.models[AIModelType.CREWAI] = {
            "agents": [legal_analyst, research_specialist, risk_assessor],
            "crew": None  # Will be created per workflow
        }

        logging.info("CrewAI workflow system initialized")

    async def generate_response(self, request: InferenceRequest) -> AsyncGenerator[InferenceResponse, None]:
        """Main orchestration method - routes to appropriate model/agent system"""
        start_time = time.time()

        # Check cache first
        cache_key = self._generate_cache_key(request)
        cached_response = None

        if request.use_cache:
            cached_response = await self._get_cached_response(cache_key)
            if cached_response:
                yield InferenceResponse(
                    response=cached_response["response"],
                    model_used=cached_response["model_used"],
                    processing_time=0.1,
                    token_count=cached_response["token_count"],
                    cache_hit=True,
                    tensor_ids=cached_response.get("tensor_ids", [])
                )
                return

        # Route to appropriate model/system
        if request.model_preference == AIModelType.GEMMA3_LEGAL:
            async for response in self._generate_vllm_response(request):
                yield response

        elif request.model_preference == AIModelType.GEMMA_LOCAL:
            async for response in self._generate_webasm_response(request):
                yield response

        elif request.model_preference == AIModelType.AUTOGEN:
            async for response in self._generate_autogen_response(request):
                yield response

        elif request.model_preference == AIModelType.CREWAI:
            async for response in self._generate_crewai_response(request):
                yield response

        else:
            # Default to Gemma3 legal
            async for response in self._generate_vllm_response(request):
                yield response

    async def _generate_vllm_response(self, request: InferenceRequest) -> AsyncGenerator[InferenceResponse, None]:
        """Generate response using vLLM Gemma3 legal model"""
        if AIModelType.GEMMA3_LEGAL not in self.models:
            raise ValueError("vLLM Gemma3 model not available")

        engine = self.models[AIModelType.GEMMA3_LEGAL]
        config = self.model_configs[AIModelType.GEMMA3_LEGAL]

        # Format legal prompt
        formatted_prompt = self._format_legal_prompt(request.messages, request.case_id)

        # Apply RL optimizations if enabled
        sampling_params = SamplingParams(
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=0.9,
            repetition_penalty=1.1
        )

        if request.enable_rl:
            rl_adjustments = await self.rl_optimizer.get_optimized_params(
                request.case_id, formatted_prompt
            )
            if rl_adjustments:
                sampling_params.temperature = rl_adjustments.get("temperature", config.temperature)
                sampling_params.top_p = rl_adjustments.get("top_p", 0.9)

        # Generate response
        request_id = f"{request.case_id}_{int(time.time())}"

        async for output in engine.generate(formatted_prompt, sampling_params, request_id=request_id):
            if output.outputs:
                for output_obj in output.outputs:
                    # Stream tokens
                    tokens = output_obj.text.split()
                    for i, token in enumerate(tokens):
                        yield InferenceResponse(
                            response=token + " ",
                            model_used="gemma3-legal-latest",
                            processing_time=time.time() - time.time(),
                            token_count=i + 1,
                            cache_hit=False
                        )

    async def _generate_webasm_response(self, request: InferenceRequest) -> AsyncGenerator[InferenceResponse, None]:
        """Generate response using WebAssembly local model"""
        # This method coordinates with the frontend WebAssembly module
        # The actual inference happens in the browser

        yield InferenceResponse(
            response="[LOCAL_MODEL_REQUEST]",
            model_used="gemma-270mb-wasm",
            processing_time=0.0,
            token_count=1,
            cache_hit=False,
            tensor_ids=[f"webasm_{request.case_id}_{int(time.time())}"]
        )

        # Signal frontend to use local model
        await self._send_webasm_request(request)

    async def _generate_autogen_response(self, request: InferenceRequest) -> AsyncGenerator[InferenceResponse, None]:
        """Generate response using AutoGen multi-agent system"""
        if AIModelType.AUTOGEN not in self.models:
            raise ValueError("AutoGen not available")

        agents_config = self.models[AIModelType.AUTOGEN]
        agents = agents_config["agents"]
        coordinator = agents_config["coordinator"]

        # Create group chat for this session
        group_chat = GroupChat(
            agents=agents + [coordinator],
            messages=[],
            max_round=10
        )

        manager = GroupChatManager(groupchat=group_chat, llm_config={"model": "gpt-4"})

        # Format the legal query
        query = self._format_autogen_query(request.messages)

        # Run multi-agent conversation
        chat_result = coordinator.initiate_chat(
            manager,
            message=query
        )

        # Stream the collaborative response
        agent_responses = []
        for message in chat_result.chat_history:
            if message["role"] == "assistant":
                agent_responses.append(message["content"])

                yield InferenceResponse(
                    response=message["content"],
                    model_used="autogen-multi-agent",
                    processing_time=time.time() - time.time(),
                    token_count=len(message["content"].split()),
                    cache_hit=False,
                    agent_chain=[message.get("name", "unknown")]
                )

    async def _generate_crewai_response(self, request: InferenceRequest) -> AsyncGenerator[InferenceResponse, None]:
        """Generate response using CrewAI workflow system"""
        if AIModelType.CREWAI not in self.models:
            raise ValueError("CrewAI not available")

        crew_config = self.models[AIModelType.CREWAI]
        agents = crew_config["agents"]

        # Create tasks for the workflow
        analysis_task = Task(
            description=f"Analyze the legal query: {request.messages[-1]['content']}",
            agent=agents[0]  # Legal analyst
        )

        research_task = Task(
            description="Research relevant precedents and case law",
            agent=agents[1]  # Research specialist
        )

        risk_task = Task(
            description="Assess legal risks and provide recommendations",
            agent=agents[2]  # Risk assessor
        )

        # Create crew
        crew = Crew(
            agents=agents,
            tasks=[analysis_task, research_task, risk_task],
            process=Process.sequential
        )

        # Execute workflow
        result = crew.kickoff()

        yield InferenceResponse(
            response=str(result),
            model_used="crew-ai-workflow",
            processing_time=time.time() - time.time(),
            token_count=len(str(result).split()),
            cache_hit=False,
            agent_chain=["legal_analyst", "research_specialist", "risk_assessor"]
        )

    def _format_legal_prompt(self, messages: List[Dict[str, str]], case_id: str) -> str:
        """Format messages for legal AI context"""
        system_prompt = """You are an expert legal AI assistant specializing in contract law,
        legal research, and document analysis. Provide accurate, well-reasoned legal guidance
        based on established legal principles and precedents. Always cite relevant laws and cases when applicable."""

        formatted = f"<bos>{system_prompt}\n\n"

        for message in messages:
            role = message["role"]
            content = message["content"]

            if role == "user":
                formatted += f"Legal Query: {content}\n"
            elif role == "assistant":
                formatted += f"Legal Analysis: {content}\n"

        formatted += "Legal Analysis: "
        return formatted

    def _format_autogen_query(self, messages: List[Dict[str, str]]) -> str:
        """Format query for AutoGen multi-agent system"""
        latest_message = messages[-1]["content"] if messages else ""

        return f"""
        Legal Analysis Request:

        Query: {latest_message}

        Please provide a comprehensive legal analysis involving:
        1. Legal research and precedent analysis
        2. Contract review and risk assessment
        3. Compliance verification and recommendations

        Collaborate to provide the most thorough legal guidance.
        """

    async def _send_webasm_request(self, request: InferenceRequest):
        """Send request to WebAssembly frontend for local processing"""
        webasm_request = {
            "type": "LOCAL_INFERENCE",
            "case_id": request.case_id,
            "messages": request.messages,
            "model": "gemma-270mb",
            "max_tokens": 512
        }

        # Store in Redis for frontend polling
        await self.redis_client.setex(
            f"webasm_request:{request.case_id}",
            300,  # 5 minute TTL
            json.dumps(webasm_request)
        )

    def _generate_cache_key(self, request: InferenceRequest) -> str:
        """Generate cache key for request"""
        messages_hash = hash(str(request.messages))
        return f"legal_response:{request.case_id}:{request.model_preference.value}:{messages_hash}"

    async def _get_cached_response(self, cache_key: str) -> Optional[Dict]:
        """Retrieve cached response"""
        if not self.redis_client:
            return None

        cached = await self.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
        return None

    async def _cache_response(self, cache_key: str, response: Dict, ttl: int = 3600):
        """Cache response with TTL"""
        if self.redis_client:
            await self.redis_client.setex(
                cache_key,
                ttl,
                json.dumps(response)
            )

    async def get_model_status(self) -> Dict[str, Any]:
        """Get status of all models"""
        status = {}

        for model_type in AIModelType:
            if model_type in self.models:
                status[model_type.value] = {
                    "available": True,
                    "config": asdict(self.model_configs.get(model_type, {}))
                }
            else:
                status[model_type.value] = {"available": False}

        status["memory_cache"] = await self.memory_cache.get_status()
        status["rl_optimizer"] = await self.rl_optimizer.get_status()

        return status

    async def cleanup(self):
        """Cleanup resources"""
        if self.redis_client:
            await self.redis_client.close()

        await self.memory_cache.cleanup()
        await self.rl_optimizer.cleanup()

# Global orchestrator instance
orchestrator: Optional[LegalModelOrchestrator] = None

async def get_orchestrator() -> LegalModelOrchestrator:
    """Get or create orchestrator instance"""
    global orchestrator

    if orchestrator is None:
        orchestrator = LegalModelOrchestrator()
        await orchestrator.initialize()

    return orchestrator

@asynccontextmanager
async def orchestrator_lifespan():
    """Context manager for orchestrator lifecycle"""
    orch = await get_orchestrator()
    try:
        yield orch
    finally:
        await orch.cleanup()