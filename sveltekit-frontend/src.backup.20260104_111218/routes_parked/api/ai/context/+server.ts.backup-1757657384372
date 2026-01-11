import { URL } from "url";

import { ContextService } from "$lib/services/context-service";
import type { RequestHandler } from './$types';


// Environment variables fallback
const env = process.env || {};

/*
 * AI Context API Server
 * Provides comprehensive context for the local Gemma3 Legal LLM model
 * Integrates with enhanced legal AI index and documentation system
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ url }): Promise<any> {
  try {
    // Get query parameters for context filtering
    const contextType = url.searchParams.get("type") || "legal";
    const includeDocumentation = url.searchParams.get("docs") === "true";
    const includeCaseData = url.searchParams.get("cases") === "true";

    // Get current application context
    const currentContext = await ContextService.getCurrentContext();

    // Enhanced context for Gemma3 Legal LLM
    const enhancedContext: any = {
      // Core application context
      application: currentContext,

      // AI Model configuration
      aiModel: {
        name: "gemma3-legal",
        endpoint: env.OLLAMA_URL || "http://ollama:11434",
        type: "local_llm",
        capabilities: [
          "legal_document_analysis",
          "case_strategy_recommendations",
          "evidence_evaluation",
          "contract_review",
          "chain_of_custody_analysis",
        ],
        configuration: {
          temperature: 0.1,
          maxTokens: 2048,
          contextWindow: 8192,
          streamingEnabled: true,
        },
      },

      // System architecture context
      architecture: {
        frontend: "SvelteKit 2 with Svelte 5 runes",
        backend: "Drizzle ORM + PostgreSQL",
        aiInfrastructure: "Ollama GPU + Docker",
        vectorSearch: "Qdrant + pgvector",
        caching: "Redis",
        messaging: "RabbitMQ",
      },

      // Development guidelines
      guidelines: {
        svelte: {
          runesRequired: true,
          stateDeclaration: "let (never const)",
          derivedFunctions: "$derived.by(() => ...)",
          errorBoundaries: "component rendering only",
        },
        aiIntegration: {
          priorityIndex: "enhanced_legal_ai_index",
          contextBoost: 0.2,
          mcpActive: true,
          fallbackChain: ["gemma3-legal", "gemma3:12b", "mock"],
        },
      },
    };

    // Add documentation context if requested
    if (includeDocumentation) {
      enhancedContext.documentation = {
        copilotContext: "Enhanced Legal AI Index with Context7 MCP",
        claudeContext: "Comprehensive legal AI system documentation",
        errorResolution: "SvelteKit troubleshooting and best practices",
      };
    }

    // Add case-specific context if requested
    if (includeCaseData && contextType === "legal") {
      enhancedContext.legalDomain = {
        focus: "prosecutor_case_management",
        features: [
          "evidence_timeline_construction",
          "witness_interview_analysis",
          "legal_precedent_research",
          "case_strategy_development",
          "compliance_verification",
        ],
        aiPromptTemplate: "specialized_legal_assistant_prompt",
      };
    }

    return json({
      success: true,
      context: enhancedContext,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  } catch (error: any) {
    console.error("Context API error:", error);
    return json(
      {
        success: false,
        error: "Failed to retrieve AI context",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/*
 * POST endpoint for updating context with AI interactions
 */
export async function POST({ request }): Promise<any> {
  try {
    const { contextUpdate, interactionType } = await request.json();

    // Update context based on AI interaction
    if (interactionType === "chat_message") {
      await ContextService.updateChatContext(contextUpdate);
    } else if (interactionType === "case_analysis") {
      await ContextService.updateCaseContext(contextUpdate);
    }

    return json({
      success: true,
      message: "Context updated successfully",
    });
  } catch (error: any) {
    console.error("Context update error:", error);
    return json(
      {
        success: false,
        error: "Failed to update context",
      },
      { status: 500 },
    );
  }
}
