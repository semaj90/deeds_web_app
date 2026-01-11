
import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request }) => {
  try {
    const { prompt } = await request.json();
    if (!prompt || prompt.trim() === "") {
      return json({ error: "Prompt is required" }, { status: 400 });
    }
    // Call Ollama API for Gemma3 model
    const ollamaRes = await fetch("http://localhost:11436/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gemma3-legal:latest", prompt }),
    });

    if (!ollamaRes.ok) {
      const errorText = await ollamaRes.text();
      return json(
        { error: "Ollama error", details: errorText },
        { status: 500 },
      );
    }
    const data = await ollamaRes.json();
    return json({ response: data.response, model: "gemma3-legal:latest" });
  } catch (error: any) {
    console.error("Ollama Gemma3 error:", error);
    return json({ error: "Failed to call Ollama Gemma3" }, { status: 500 });
  }
};
