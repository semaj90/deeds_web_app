import os
import requests
from typing import List, Dict, Any

class LLMService:
    def __init__(self):
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = os.getenv("OLLAMA_MODEL", "llama3")

    async def generate_response(self, message: str, history: List[Dict[str, str]], context: List[Dict[str, Any]]) -> str:
        """
        Generate a response using Ollama, incorporating retrieved context.
        """

        # Format context
        context_str = "\n\n".join([f"Source: {doc.get('payload', {}).get('title', 'Unknown')}\nContent: {doc.get('payload', {}).get('content', '')}" for doc in context])

        system_prompt = f"""You are a helpful legal assistant. Use the following context to answer the user's question.

        Context:
        {context_str}

        If the answer is not in the context, say so, but try to be helpful based on general knowledge if appropriate, while flagging it as general knowledge.
        """

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history)
        messages.append({"role": "user", "content": message})

        try:
            response = requests.post(f"{self.ollama_url}/api/chat", json={
                "model": self.model,
                "messages": messages,
                "stream": False
            })

            if response.status_code == 200:
                return response.json().get("message", {}).get("content", "")
            else:
                return f"Error from LLM: {response.text}"

        except Exception as e:
            return f"Error calling LLM: {str(e)}"
