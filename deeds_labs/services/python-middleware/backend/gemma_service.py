"""
Gemma Service: Gemma-3-Legal model integration with streaming

Provides:
- Model loading and initialization
- Prompt formatting
- Streaming token generation
- Latency monitoring
"""

import asyncio
import logging
import time
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class GemmaService:
    """Gemma-3-Legal streaming service"""

    def __init__(
        self,
        model_name: str = "gemma3-legal:latest",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ):
        self.model_name = model_name
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.model = None
        self.tokenizer = None

        logger.info(f"✅ Gemma Service initialized")
        logger.info(f"   Model: {model_name}")
        logger.info(f"   Temperature: {temperature}")
        logger.info(f"   Max Tokens: {max_tokens}")

    async def load_model(self):
        """Load Gemma model"""
        try:
            logger.info(f"Loading model: {self.model_name}")

            # Try to load using ollama or transformers
            try:
                import ollama

                # Test connection to ollama
                response = ollama.list()
                logger.info("✅ Connected to Ollama")

                self.model = "ollama"  # Use ollama for inference
            except Exception as e:
                logger.warning(f"Ollama not available: {e}")

                # Fallback to transformers
                try:
                    from transformers import AutoTokenizer, AutoModelForCausalLM
                    import torch

                    logger.info("Loading model with transformers...")
                    self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_name,
                        torch_dtype=torch.float16,
                        device_map="auto",
                    )
                    logger.info("✅ Model loaded with transformers")

                except Exception as e2:
                    logger.error(f"Failed to load model: {e2}")
                    raise

        except Exception as e:
            logger.error(f"Error loading model: {e}")
            raise

    async def stream_response(
        self,
        prompt: str,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens"""
        start_time = time.time()

        try:
            if self.model == "ollama":
                # Use ollama streaming
                import ollama

                logger.info("Streaming response via Ollama...")

                stream = ollama.generate(
                    model=self.model_name,
                    prompt=prompt,
                    stream=True,
                    options={
                        "temperature": self.temperature,
                        "num_predict": self.max_tokens,
                    },
                )

                for chunk in stream:
                    token = chunk.get("response", "")
                    if token:
                        yield token
                        await asyncio.sleep(0.01)  # Small delay for streaming effect

            else:
                # Use transformers streaming
                import torch

                logger.info("Streaming response via Transformers...")

                inputs = self.tokenizer(prompt, return_tensors="pt")
                inputs = {k: v.to(self.model.device) for k, v in inputs.items()}

                with torch.no_grad():
                    output_ids = self.model.generate(
                        **inputs,
                        max_new_tokens=self.max_tokens,
                        temperature=self.temperature,
                        do_sample=True,
                        top_p=0.9,
                    )

                # Decode tokens one by one
                response_ids = output_ids[0][inputs["input_ids"].shape[1] :]

                for token_id in response_ids:
                    token = self.tokenizer.decode([token_id], skip_special_tokens=True)
                    if token:
                        yield token
                        await asyncio.sleep(0.01)

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ Streaming completed in {latency_ms}ms")

        except Exception as e:
            logger.error(f"Error streaming response: {e}")
            yield f"Error: {str(e)}"

    async def generate_response(self, prompt: str) -> str:
        """Generate complete response (non-streaming)"""
        try:
            response_tokens = []

            async for token in self.stream_response(prompt):
                response_tokens.append(token)

            response = "".join(response_tokens)
            logger.info(f"✅ Generated response ({len(response)} chars)")

            return response

        except Exception as e:
            logger.error(f"Error generating response: {e}")
            raise

    async def format_prompt(
        self,
        query: str,
        context_window: str = "",
        evidence_context: str = "",
    ) -> str:
        """Format prompt for Gemma"""
        try:
            prompt_parts = [
                "You are a legal assistant helping analyze evidence and statutes.",
                "Provide analysis based on the evidence and legal context provided.",
                "Always cite sources and verify conclusions.",
                "Do not make definitive statements about guilt or innocence.",
                "",
            ]

            if context_window:
                prompt_parts.append("CONVERSATION HISTORY:")
                prompt_parts.append(context_window)
                prompt_parts.append("")

            if evidence_context:
                prompt_parts.append(evidence_context)
                prompt_parts.append("")

            prompt_parts.append("USER QUERY:")
            prompt_parts.append(query)
            prompt_parts.append("")
            prompt_parts.append("RESPONSE:")

            prompt = "\n".join(prompt_parts)
            logger.info(f"✅ Formatted prompt ({len(prompt)} chars)")

            return prompt

        except Exception as e:
            logger.error(f"Error formatting prompt: {e}")
            return query

    async def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        try:
            if self.tokenizer:
                tokens = self.tokenizer.encode(text)
                return len(tokens)
            else:
                # Rough approximation: 1 token ≈ 4 characters
                return len(text) // 4

        except Exception as e:
            logger.error(f"Error counting tokens: {e}")
            return len(text) // 4

    async def close(self):
        """Close service"""
        logger.info("✅ Gemma Service closed")


# Global gemma service instance
gemma_service: Optional[GemmaService] = None


async def get_gemma_service() -> GemmaService:
    """Get or create gemma service instance"""
    global gemma_service

    if gemma_service is None:
        gemma_service = GemmaService()
        await gemma_service.load_model()

    return gemma_service


async def close_gemma_service():
    """Close gemma service"""
    global gemma_service

    if gemma_service:
        await gemma_service.close()
        gemma_service = None
