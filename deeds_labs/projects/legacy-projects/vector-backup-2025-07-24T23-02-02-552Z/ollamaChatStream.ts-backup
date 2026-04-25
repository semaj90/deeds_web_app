// ollamaChatStream.ts - Ollama Chat Stream with Langchain integration
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { db } from "$lib/server/db/index";
import { chatEmbeddings, evidenceVectors, caseEmbeddings } from "$lib/server/db/schema-postgres";
import { eq, sql } from "drizzle-orm";

export interface ChatStreamOptions {
  message: string;
  context?: any[];
  conversationId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  useVectorSearch?: boolean;
  searchThreshold?: number;
}

export interface StreamChunk {
  text: string;
  metadata?: {
    type: 'text' | 'thinking' | 'sources' | 'final';
    sources?: any[];
    confidence?: number;
  };
}

export class OllamaChatStreamService {
  private ollama: ChatOllama;
  private outputParser: StringOutputParser;

  constructor() {
    this.ollama = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: "gemma2:7b", // Default to Gemma 2
      temperature: 0.7,
      numPredict: 2048,
    });
    this.outputParser = new StringOutputParser();
  }

  async *streamChat(options: ChatStreamOptions): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      // Vector search for relevant context if enabled
      let vectorContext: any[] = [];
      if (options.useVectorSearch) {
        vectorContext = await this.performVectorSearch(options.message, options.searchThreshold || 0.7);
        
        if (vectorContext.length > 0) {
          yield {
            text: "",
            metadata: {
              type: 'sources',
              sources: vectorContext,
              confidence: 0.85
            }
          };
        }
      }

      // Build context-aware prompt
      const contextPrompt = this.buildContextPrompt(
        options.message,
        vectorContext,
        options.context,
        options.systemPrompt
      );

      // Configure model for this request
      const llm = new ChatOllama({
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        model: options.model || "gemma2:7b",
        temperature: options.temperature || 0.7,
        numPredict: options.maxTokens || 2048,
      });

      // Create the chain
      const chain = contextPrompt.pipe(llm).pipe(this.outputParser);

      // Stream the response
      const stream = await chain.stream({
        human_input: options.message,
        context: this.formatContextForPrompt(vectorContext, options.context),
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        fullResponse += chunk;
        
        yield {
          text: chunk,
          metadata: {
            type: 'text',
            confidence: 0.9
          }
        };
      }

      // Store the conversation in embeddings for future reference
      if (options.conversationId) {
        await this.storeChatEmbedding(
          options.conversationId,
          options.message,
          fullResponse
        );
      }

      // Final metadata
      yield {
        text: "",
        metadata: {
          type: 'final',
          confidence: 0.9
        }
      };

    } catch (error) {
      console.error("Chat stream error:", error);
      yield {
        text: "I apologize, but I encountered an error processing your request. Please try again.",
        metadata: {
          type: 'text',
          confidence: 0.0
        }
      };
    }
  }

  private async performVectorSearch(query: string, threshold: number = 0.7): Promise<any[]> {
    try {
      // Generate embedding for the query (simplified - you'd use actual embedding service)
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) return [];

      // Search evidence vectors
      const evidenceResults = await db
        .select()
        .from(evidenceVectors)
        .where(
          sql`1 - (${evidenceVectors.embedding}::vector <=> ${JSON.stringify(queryEmbedding)}::vector) > ${threshold}`
        )
        .limit(5);

      // Search case embeddings
      const caseResults = await db
        .select()
        .from(caseEmbeddings)
        .where(
          sql`1 - (${caseEmbeddings.embedding}::vector <=> ${JSON.stringify(queryEmbedding)}::vector) > ${threshold}`
        )
        .limit(3);

      return [
        ...evidenceResults.map(r => ({ ...r, type: 'evidence' })),
        ...caseResults.map(r => ({ ...r, type: 'case' }))
      ];
    } catch (error) {
      console.error("Vector search error:", error);
      return [];
    }
  }

  private buildContextPrompt(
    message: string,
    vectorContext: any[],
    chatContext?: any[],
    systemPrompt?: string
  ): ChatPromptTemplate {
    const baseSystemPrompt = systemPrompt || `You are a specialized legal AI assistant with expertise in criminal law, evidence analysis, and case management. 

INSTRUCTIONS:
- Provide accurate, professional legal analysis
- Reference relevant laws, procedures, and precedents
- Maintain confidentiality and professional standards
- If context is provided, use it to enhance your response
- Always consider chain of custody and evidence admissibility
- Provide practical, actionable guidance when appropriate

IMPORTANT: Base your responses on the provided context when available, but clearly indicate when you're making inferences or when additional verification is needed.`;

    return ChatPromptTemplate.fromMessages([
      ["system", baseSystemPrompt],
      ["human", `Context Information:
{context}

User Question: {human_input}

Please provide a detailed, professional response based on the context and your legal expertise.`]
    ]);
  }

  private formatContextForPrompt(vectorContext: any[], chatContext?: any[]): string {
    let contextText = "";

    if (vectorContext.length > 0) {
      contextText += "Relevant Case/Evidence Information:\n";
      vectorContext.forEach((item, index) => {
        contextText += `${index + 1}. [${item.type.toUpperCase()}] ${item.content}\n`;
      });
      contextText += "\n";
    }

    if (chatContext && chatContext.length > 0) {
      contextText += "Previous Conversation:\n";
      chatContext.slice(-5).forEach((msg, index) => {
        contextText += `${msg.role}: ${msg.content}\n`;
      });
    }

    return contextText || "No specific context provided.";
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      // This is a placeholder - implement actual embedding generation
      // You would call your embedding service here (OpenAI, local model, etc.)
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.embedding;
    } catch (error) {
      console.error("Embedding generation error:", error);
      return null;
    }
  }

  private async storeChatEmbedding(
    conversationId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    try {
      const userEmbedding = await this.generateEmbedding(userMessage);
      const aiEmbedding = await this.generateEmbedding(aiResponse);

      if (userEmbedding) {
        await db.insert(chatEmbeddings).values({
          conversationId,
          messageId: `user_${Date.now()}`,
          content: userMessage,
          embedding: JSON.stringify(userEmbedding),
          role: 'user',
          metadata: { timestamp: new Date().toISOString() }
        });
      }

      if (aiEmbedding) {
        await db.insert(chatEmbeddings).values({
          conversationId,
          messageId: `assistant_${Date.now()}`,
          content: aiResponse,
          embedding: JSON.stringify(aiEmbedding),
          role: 'assistant',
          metadata: { timestamp: new Date().toISOString() }
        });
      }
    } catch (error) {
      console.error("Error storing chat embeddings:", error);
    }
  }
}

// Export the main function for backwards compatibility
export async function* ollamaChatStream(options: ChatStreamOptions): AsyncGenerator<StreamChunk, void, unknown> {
  const service = new OllamaChatStreamService();
  yield* service.streamChat(options);
}

export default ollamaChatStream;
