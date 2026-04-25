// Ollama service for Gemma3 Q4_K_M integration
// Handles local LLM inference with proper error handling and streaming support

import { browser } from "$app/environment";
import { LOCAL_LLM_PATHS, checkLocalInstallations } from "../config/local-llm";

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    family: string;
    format: string;
    parameter_size: string;
    quantization_level: string;
  };
}
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
  stream?: boolean;
}
export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}
class OllamaService {
  private baseUrl: string;
  private isAvailable: boolean = false;
  private availableModels: OllamaModelInfo[] = [];
  private gemma3Model: string | null = null;

  constructor(baseUrl: string = LOCAL_LLM_PATHS.ollama.baseUrl) {
    this.baseUrl = baseUrl;
  }
  // Initialize and check if Ollama is running
  async initialize(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        this.isAvailable = true;
        await this.loadAvailableModels();
        await this.detectGemma3Model();
        console.log("✅ Ollama service initialized successfully");

        // Try to import Gemma model if available but not loaded
        if (
          !this.gemma3Model &&
          checkLocalInstallations().gemmaModel.available
        ) {
          console.log("🔄 Attempting to import Gemma3 model...");
          await this.importGGUF(
            LOCAL_LLM_PATHS.gemmaModel.path,
            LOCAL_LLM_PATHS.gemmaModel.name,
          );
        }
        return true;
      }
    } catch (error) {
      console.warn("⚠️ Ollama not available:", error);
      this.isAvailable = false;
    }
    return false;
  }
  // Load list of available models
  private async loadAvailableModels(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        this.availableModels = data.models || [];
        console.log(`📦 Found ${this.availableModels.length} Ollama models`);
      }
    } catch (error) {
      console.error("Failed to load Ollama models:", error);
    }
  }
  // Detect Gemma3 model (look for custom legal model first, then fallbacks)
  private async detectGemma3Model(): Promise<void> {
    // First check for our custom legal model
    const customLegalModel = this.availableModels.find(
      (model) => model.name === "gemma3-legal",
    );

    if (customLegalModel) {
      this.gemma3Model = "gemma3-legal";
      console.log(`🏛️ Using custom legal AI model: ${this.gemma3Model}`);
      return;
    }
    // Fallback to any Gemma models
    const gemmaModels = this.availableModels.filter(
      (model) =>
        model.name.toLowerCase().includes("gemma") ||
        model.name.toLowerCase().includes("gemma3") ||
        model.details?.family?.toLowerCase().includes("gemma"),
    );

    if (gemmaModels.length > 0) {
      // Prefer Q4_K_M quantization if available
      const q4Model = gemmaModels.find(
        (m) =>
          m.name.includes("q4") ||
          m.name.includes("Q4_K_M") ||
          m.details?.quantization_level?.includes("Q4"),
      );

      this.gemma3Model = q4Model ? q4Model.name : gemmaModels[0].name;
      console.log(`🤖 Using Gemma3 model: ${this.gemma3Model}`);
    } else {
      console.warn(
        "⚠️ No Gemma3 model found in Ollama. Available models:",
        this.availableModels.map((m) => m.name),
      );
    }
  }
  // Import a GGUF model file into Ollama
  async importGGUF(
    modelPath: string,
    modelName: string = "gemma3-legal",
  ): Promise<boolean> {
    try {
      const modelfile = `FROM ${modelPath}
TEMPLATE """<start_of_turn>user
{{ .Prompt "<end_of_turn>
<start_of_turn>model
{{ .Response "<end_of_turn>"""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1

SYSTEM """You are a specialized legal AI assistant with expertise in case law analysis, legal research, and document review. Provide accurate, well-reasoned responses that would be helpful to legal professionals."""`;

      const response = await fetch(`${this.baseUrl}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modelName,
          modelfile: modelfile,
          stream: false,
        }),
      });

      if (response.ok) {
        console.log(`✅ Successfully imported GGUF model as: ${modelName}`);
        await this.loadAvailableModels(); // Refresh model list
        this.gemma3Model = modelName;
        return true;
      } else {
        const error = await response.text();
        console.error("Failed to import GGUF model:", error);
        return false;
      }
    } catch (error) {
      console.error("Error importing GGUF model:", error);
      return false;
    }
  }
  // Generate text using Gemma3
  async generate(
    prompt: string,
    options: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
      stream?: boolean;
    } = {},
  ): Promise<string> {
    if (!this.isAvailable || !this.gemma3Model) {
      throw new Error("Ollama or Gemma3 model not available");
    }
    const requestBody: OllamaGenerateRequest = {
      model: this.gemma3Model,
      prompt: prompt,
      system: options.system,
      stream: options.stream || false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        top_k: options.topK || 40,
        repeat_penalty: options.repeatPenalty || 1.1,
        num_predict: options.maxTokens || 512,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      const data: OllamaGenerateResponse = await response.json();
      return data.response || "";
    } catch (error) {
      console.error("Ollama generation failed:", error);
      throw error;
    }
  }
  // Generate streaming response
  async *generateStream(
    prompt: string,
    options: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    } = {},
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isAvailable || !this.gemma3Model) {
      throw new Error("Ollama or Gemma3 model not available");
    }
    const requestBody: OllamaGenerateRequest = {
      model: this.gemma3Model,
      prompt: prompt,
      system: options.system,
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        top_k: options.topK || 40,
        repeat_penalty: options.repeatPenalty || 1.1,
        num_predict: options.maxTokens || 512,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No readable stream available");
      }
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line);
            if (data.response) {
              yield data.response;
            }
            if (data.done) {
              return;
            }
          } catch (e) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    } catch (error) {
      console.error("Ollama streaming failed:", error);
      throw error;
    }
  }
  // Chat completion with conversation context
  async chat(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    } = {},
  ): Promise<string> {
    const systemMessage =
      messages.find((m) => m.role === "system")?.content || "";
    const conversationHistory = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const lastUserMessage =
      messages.filter((m) => m.role === "user").pop()?.content || "";

    return this.generate(lastUserMessage, {
      system: systemMessage || "You are a helpful AI assistant.",
      ...options,
    });
  }
  // Get available models
  getAvailableModels(): OllamaModelInfo[] {
    return this.availableModels;
  }
  // Get current Gemma3 model name
  getGemma3Model(): string | null {
    return this.gemma3Model;
  }
  // Check if service is available
  getIsAvailable(): boolean {
    return this.isAvailable;
  }
  // Public method to check if service is available
  public checkAvailability(): boolean {
    return this.isAvailable;
  }
  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  // Model management
  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to pull model:", error);
      return false;
    }
  }
  async deleteModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });
      return response.ok;
    } catch (error) {
      console.error("Failed to delete model:", error);
      return false;
    }
  }
}
// Singleton instance
export const ollamaService = new OllamaService();

// Initialize on module load (only in browser)
if (browser) {
  ollamaService.initialize().catch(console.error);
}
export default ollamaService;
