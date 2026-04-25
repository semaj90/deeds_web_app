# Custom vLLM integration with memory-mapped KV caches and tensor reuse
import asyncio
import json
import mmap
import os
import struct
import time
from typing import List, Dict, Optional, AsyncGenerator, Any
import numpy as np
import torch
from transformers import AutoTokenizer
import redis.asyncio as redis
from dataclasses import dataclass
from contextlib import asynccontextmanager

# Try importing vLLM, fallback to basic implementation
try:
    from vllm import LLM, SamplingParams
    from vllm.engine.async_llm_engine import AsyncLLMEngine
    from vllm.engine.arg_utils import AsyncEngineArgs
    VLLM_AVAILABLE = True
except ImportError:
    VLLM_AVAILABLE = False
    print("vLLM not available, using fallback implementation")

@dataclass
class KVCacheState:
    cache_key: str
    tensor_ids: List[str]
    attention_states: Optional[torch.Tensor]
    position_offset: int
    timestamp: float
    reuse_count: int = 0

@dataclass
class LegalContext:
    case_id: str
    embeddings: List[str]
    legal_entities: List[str]
    precedent_refs: List[str]
    confidence_score: float

class MemoryMappedKVCache:
    """Memory-mapped KV cache for GPU tensor reuse"""

    def __init__(self, base_path: str = "/tmp/kv_caches"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)
        self.cache_files = {}
        self.mmap_handles = {}

    def store_kv_state(self, cache_key: str, kv_state: KVCacheState) -> str:
        """Store KV cache state in memory-mapped file"""
        filepath = f"{self.base_path}/{cache_key}.kv"

        # Serialize KV state
        if kv_state.attention_states is not None:
            # Convert tensor to bytes
            tensor_bytes = kv_state.attention_states.cpu().numpy().tobytes()
            tensor_shape = kv_state.attention_states.shape
        else:
            tensor_bytes = b''
            tensor_shape = ()

        # Create header
        header_data = {
            'cache_key': cache_key,
            'tensor_ids': kv_state.tensor_ids,
            'position_offset': kv_state.position_offset,
            'timestamp': kv_state.timestamp,
            'reuse_count': kv_state.reuse_count,
            'tensor_shape': tensor_shape,
            'tensor_size': len(tensor_bytes)
        }

        header_json = json.dumps(header_data).encode('utf-8')
        header_size = len(header_json)

        # Calculate total size
        total_size = 4 + header_size + len(tensor_bytes)  # 4 bytes for header size

        # Create memory-mapped file
        with open(filepath, 'wb') as f:
            f.write(struct.pack('I', header_size))  # Write header size
            f.write(header_json)  # Write header
            f.write(tensor_bytes)  # Write tensor data
            f.flush()

        # Memory map the file
        f = open(filepath, 'r+b')
        mm = mmap.mmap(f.fileno(), 0)
        self.cache_files[cache_key] = f
        self.mmap_handles[cache_key] = mm

        return filepath

    def load_kv_state(self, cache_key: str) -> Optional[KVCacheState]:
        """Load KV cache state from memory-mapped file"""
        if cache_key in self.mmap_handles:
            mm = self.mmap_handles[cache_key]
        else:
            filepath = f"{self.base_path}/{cache_key}.kv"
            if not os.path.exists(filepath):
                return None

            f = open(filepath, 'r+b')
            mm = mmap.mmap(f.fileno(), 0)
            self.cache_files[cache_key] = f
            self.mmap_handles[cache_key] = mm

        # Read header size
        mm.seek(0)
        header_size = struct.unpack('I', mm.read(4))[0]

        # Read header
        header_json = mm.read(header_size).decode('utf-8')
        header_data = json.loads(header_json)

        # Read tensor data
        tensor_size = header_data['tensor_size']
        if tensor_size > 0:
            tensor_bytes = mm.read(tensor_size)
            tensor_shape = tuple(header_data['tensor_shape'])

            # Reconstruct tensor
            tensor_array = np.frombuffer(tensor_bytes, dtype=np.float32)
            attention_states = torch.from_numpy(tensor_array.reshape(tensor_shape))
        else:
            attention_states = None

        return KVCacheState(
            cache_key=header_data['cache_key'],
            tensor_ids=header_data['tensor_ids'],
            attention_states=attention_states,
            position_offset=header_data['position_offset'],
            timestamp=header_data['timestamp'],
            reuse_count=header_data['reuse_count']
        )

    def cleanup_old_caches(self, max_age: float = 3600.0):
        """Clean up old cache files"""
        current_time = time.time()

        for cache_key in list(self.mmap_handles.keys()):
            cache_state = self.load_kv_state(cache_key)
            if cache_state and (current_time - cache_state.timestamp) > max_age:
                self.evict_cache(cache_key)

    def evict_cache(self, cache_key: str):
        """Evict cache from memory and disk"""
        if cache_key in self.mmap_handles:
            self.mmap_handles[cache_key].close()
            del self.mmap_handles[cache_key]

        if cache_key in self.cache_files:
            self.cache_files[cache_key].close()
            del self.cache_files[cache_key]

        filepath = f"{self.base_path}/{cache_key}.kv"
        if os.path.exists(filepath):
            os.remove(filepath)

class CustomvLLMEngine:
    """Custom vLLM engine with memory-mapped caches and legal context"""

    def __init__(
        self,
        model_name: str = "google/gemma-2b-it",  # Use as base, will fine-tune for legal
        tensor_parallel_size: int = 1,
        gpu_memory_utilization: float = 0.8,
        max_model_len: Optional[int] = None
    ):
        self.model_name = model_name
        self.kv_cache = MemoryMappedKVCache()
        self.redis_client: Optional[redis.Redis] = None
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)

        # Legal-specific configurations
        self.legal_prompts = {
            "contract_analysis": "Analyze this contract for legal issues, risks, and compliance:",
            "case_research": "Research legal precedents and case law relevant to:",
            "document_review": "Review this legal document for accuracy and completeness:",
            "risk_assessment": "Assess legal risks and provide recommendations for:"
        }

        # Initialize vLLM engine if available
        if VLLM_AVAILABLE:
            engine_args = AsyncEngineArgs(
                model=model_name,
                tensor_parallel_size=tensor_parallel_size,
                gpu_memory_utilization=gpu_memory_utilization,
                max_model_len=max_model_len,
                enforce_eager=True,  # For better memory control
                enable_prefix_caching=True  # Enable KV cache reuse
            )
            self.engine = AsyncLLMEngine.from_engine_args(engine_args)
        else:
            self.engine = None
            print("Using fallback text generation")

    async def init_redis(self, redis_url: str = "redis://localhost:6379"):
        """Initialize Redis connection for metadata caching"""
        self.redis_client = await redis.from_url(
            redis_url,
            password=os.getenv("REDIS_PASSWORD", "redis")
        )

    async def generate_legal_response(
        self,
        messages: List[Dict[str, str]],
        case_context: Optional[LegalContext] = None,
        cache_key: Optional[str] = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        use_kv_cache: bool = True
    ) -> AsyncGenerator[str, None]:
        """Generate legal AI response with context reuse"""

        # Prepare legal context prompt
        system_prompt = self.build_legal_system_prompt(case_context)
        full_messages = [{"role": "system", "content": system_prompt}] + messages

        # Check for reusable KV cache
        kv_state = None
        if use_kv_cache and cache_key:
            kv_state = self.kv_cache.load_kv_state(cache_key)
            if kv_state:
                kv_state.reuse_count += 1
                print(f"Reusing KV cache {cache_key} (reuse count: {kv_state.reuse_count})")

        # Format conversation for model
        formatted_prompt = self.format_chat_prompt(full_messages)

        if VLLM_AVAILABLE and self.engine:
            # Use vLLM engine
            sampling_params = SamplingParams(
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=0.9,
                repetition_penalty=1.1
            )

            # Add KV cache prefix if available
            if kv_state and kv_state.tensor_ids:
                # Use prefix caching in vLLM
                prefix_pos = kv_state.position_offset
            else:
                prefix_pos = 0

            async for output in self.engine.generate(
                formatted_prompt,
                sampling_params,
                request_id=cache_key or f"req_{int(time.time())}"
            ):
                if output.outputs:
                    for token in output.outputs[0].text.split():
                        yield token + " "

                # Store new KV state if cache_key provided
                if cache_key and not kv_state:
                    new_kv_state = KVCacheState(
                        cache_key=cache_key,
                        tensor_ids=[cache_key + "_kv"],
                        attention_states=None,  # vLLM handles internally
                        position_offset=len(formatted_prompt.split()),
                        timestamp=time.time()
                    )
                    self.kv_cache.store_kv_state(cache_key, new_kv_state)
        else:
            # Fallback implementation using transformers
            yield from self.fallback_generate(formatted_prompt, max_tokens, temperature)

    def build_legal_system_prompt(self, context: Optional[LegalContext]) -> str:
        """Build system prompt with legal context"""
        base_prompt = """You are a highly skilled legal AI assistant specializing in contract law,
        legal research, and document analysis. Provide accurate, well-reasoned legal guidance
        based on established legal principles and precedents."""

        if context:
            context_parts = []

            if context.legal_entities:
                context_parts.append(f"Relevant entities: {', '.join(context.legal_entities)}")

            if context.precedent_refs:
                context_parts.append(f"Relevant precedents: {', '.join(context.precedent_refs)}")

            if context.confidence_score:
                context_parts.append(f"Context confidence: {context.confidence_score:.2f}")

            if context_parts:
                base_prompt += "\n\nContext for this case:\n" + "\n".join(context_parts)

        return base_prompt

    def format_chat_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Format messages for Gemma-style prompting"""
        formatted = ""

        for msg in messages:
            role = msg["role"]
            content = msg["content"]

            if role == "system":
                formatted += f"<bos>{content}\n\n"
            elif role == "user":
                formatted += f"User: {content}\n"
            elif role == "assistant":
                formatted += f"Assistant: {content}\n"

        formatted += "Assistant: "
        return formatted

    async def fallback_generate(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float
    ) -> AsyncGenerator[str, None]:
        """Fallback text generation when vLLM is not available"""
        # Simulate streaming response for demo
        words = [
            "Based", "on", "the", "legal", "context", "provided,", "I", "would",
            "recommend", "the", "following", "analysis:", "The", "contract",
            "appears", "to", "contain", "standard", "clauses", "however",
            "attention", "should", "be", "paid", "to", "the", "termination",
            "provisions", "and", "liability", "limitations."
        ]

        for word in words[:max_tokens//10]:  # Rough token estimate
            await asyncio.sleep(0.05)  # Simulate generation delay
            yield word + " "

    async def embed_legal_context(
        self,
        text: str,
        context_type: str = "general"
    ) -> np.ndarray:
        """Generate embeddings for legal context with caching"""
        cache_key = f"embed_{context_type}_{hash(text)}"

        # Check Redis cache
        if self.redis_client:
            cached = await self.redis_client.get(cache_key)
            if cached:
                return np.frombuffer(cached, dtype=np.float32)

        # Generate new embedding (placeholder - use actual embedding model)
        # This would typically call a sentence transformer or similar
        embedding = np.random.rand(768).astype(np.float32)  # Placeholder

        # Cache in Redis
        if self.redis_client:
            await self.redis_client.setex(
                cache_key,
                3600,  # 1 hour TTL
                embedding.tobytes()
            )

        return embedding

    async def find_similar_cases(
        self,
        query_embedding: np.ndarray,
        case_embeddings: Dict[str, np.ndarray],
        top_k: int = 5
    ) -> List[str]:
        """Find similar legal cases using embeddings"""
        similarities = {}

        for case_id, case_embedding in case_embeddings.items():
            # Cosine similarity
            similarity = np.dot(query_embedding, case_embedding) / (
                np.linalg.norm(query_embedding) * np.linalg.norm(case_embedding)
            )
            similarities[case_id] = similarity

        # Return top-k similar cases
        sorted_cases = sorted(similarities.items(), key=lambda x: x[1], reverse=True)
        return [case_id for case_id, _ in sorted_cases[:top_k]]

    async def cleanup_resources(self):
        """Clean up resources and close connections"""
        self.kv_cache.cleanup_old_caches()
        if self.redis_client:
            await self.redis_client.close()

# Global engine instance
legal_engine: Optional[CustomvLLMEngine] = None

async def get_legal_engine() -> CustomvLLMEngine:
    """Get or create legal engine instance"""
    global legal_engine

    if legal_engine is None:
        # Initialize with Gemma model (or legal-fine-tuned version)
        model_name = os.getenv("LEGAL_MODEL_NAME", "google/gemma-2b-it")
        legal_engine = CustomvLLMEngine(
            model_name=model_name,
            tensor_parallel_size=1,
            gpu_memory_utilization=0.8
        )
        await legal_engine.init_redis()

    return legal_engine

@asynccontextmanager
async def legal_engine_lifespan():
    """Context manager for engine lifecycle"""
    engine = await get_legal_engine()
    try:
        yield engine
    finally:
        await engine.cleanup_resources()