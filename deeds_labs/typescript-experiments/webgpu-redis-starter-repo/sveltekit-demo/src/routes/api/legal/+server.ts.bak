// Enhanced SvelteKit API routes for legal AI integration
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lucia } from '$lib/auth/lucia';
import Redis from 'ioredis';

// Redis client for coordination with MCP server
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// MCP server endpoint
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || 'http://orchestrator:3000';

interface LegalJobRequest {
  case_id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    message_id?: string;
  }>;
  model_config?: {
    model_type?: 'gemma3' | 'gemma-local' | 'autogen' | 'crewai';
    temperature?: number;
    max_tokens?: number;
    use_rl_optimization?: boolean;
    enable_cache?: boolean;
  };
  legal_context?: {
    case_type?: string;
    priority?: string;
    legal_entities?: string[];
  };
  workflow_config?: {
    workflow_type?: 'autogen' | 'crewai' | 'sequential';
    agents?: Array<{
      agent_type: string;
      system_prompt: string;
    }>;
  };
}

// POST /api/legal - Submit legal AI job
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    // Authentication check
    const sessionId = cookies.get('lucia_session');
    let user = null;

    if (sessionId) {
      const { session } = await lucia.validateSession(sessionId);
      if (session) {
        user = session.user;
      }
    }

    const requestData: LegalJobRequest = await request.json();

    // Validate required fields
    if (!requestData.case_id || !requestData.messages || requestData.messages.length === 0) {
      throw error(400, 'Missing required fields: case_id and messages');
    }

    // Create legal job payload
    const jobPayload = {
      case_id: requestData.case_id,
      user_id: user?.id || 'anonymous',
      messages: requestData.messages.map(msg => ({
        ...msg,
        message_id: msg.message_id || generateMessageId(),
        timestamp: Date.now()
      })),
      model_config: {
        model_type: requestData.model_config?.model_type || 'gemma3',
        temperature: requestData.model_config?.temperature || 0.7,
        max_tokens: requestData.model_config?.max_tokens || 1024,
        use_rl_optimization: requestData.model_config?.use_rl_optimization ?? true,
        enable_cache: requestData.model_config?.enable_cache ?? true,
        enable_kv_reuse: true,
        compression_type: 'float16'
      },
      legal_context: {
        case_id: requestData.case_id,
        case_type: requestData.legal_context?.case_type || 'general',
        priority: requestData.legal_context?.priority || 'medium',
        legal_entities: requestData.legal_context?.legal_entities || [],
        precedent_refs: [],
        confidence_score: 0.8
      },
      workflow_config: requestData.workflow_config || null,
      store_embeddings: true,
      cache_strategy: 'rl_optimized'
    };

    // Submit job to MCP server
    const mcpResponse = await fetch(`${MCP_ENDPOINT}/api/legal/job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobPayload)
    });

    if (!mcpResponse.ok) {
      throw error(500, 'Failed to submit job to processing server');
    }

    const mcpResult = await mcpResponse.json();

    // Store job metadata for tracking
    await redis.setex(
      `job_tracking:${mcpResult.job_id}`,
      3600, // 1 hour TTL
      JSON.stringify({
        job_id: mcpResult.job_id,
        case_id: requestData.case_id,
        user_id: user?.id || 'anonymous',
        status: 'submitted',
        submitted_at: Date.now(),
        estimated_completion: mcpResult.estimated_completion
      })
    );

    return json({
      success: true,
      job_id: mcpResult.job_id,
      status: 'submitted',
      estimated_completion_ms: mcpResult.estimated_completion - Date.now(),
      polling_url: `/api/legal/status/${mcpResult.job_id}`,
      result_url: `/api/legal/result/${mcpResult.job_id}`
    });

  } catch (err) {
    console.error('Legal API error:', err);

    if (err.status) {
      throw err; // Re-throw SvelteKit errors
    }

    throw error(500, 'Internal server error');
  }
};

// GET /api/legal - Get job status or results
export const GET: RequestHandler = async ({ url }) => {
  const jobId = url.searchParams.get('job_id');
  const caseId = url.searchParams.get('case_id');

  if (jobId) {
    // Get specific job status
    const jobTracking = await redis.get(`job_tracking:${jobId}`);
    if (!jobTracking) {
      throw error(404, 'Job not found');
    }

    const jobData = JSON.parse(jobTracking);

    // Check if result is available
    const result = await redis.getBuffer(`legal:result:${jobId}`);
    if (result) {
      // Parse protobuf result (simplified - would use actual protobuf parser)
      return json({
        job_id: jobId,
        status: 'completed',
        result: {
          // This would be parsed from protobuf
          response: 'Legal analysis completed',
          confidence: 0.9,
          processing_time: Date.now() - jobData.submitted_at
        },
        completed_at: Date.now()
      });
    } else {
      return json({
        job_id: jobId,
        status: 'processing',
        submitted_at: jobData.submitted_at,
        estimated_completion: jobData.estimated_completion
      });
    }
  } else if (caseId) {
    // Get all jobs for a case
    const caseKeys = await redis.keys(`job_tracking:*`);
    const caseJobs = [];

    for (const key of caseKeys) {
      const jobData = await redis.get(key);
      if (jobData) {
        const parsed = JSON.parse(jobData);
        if (parsed.case_id === caseId) {
          caseJobs.push(parsed);
        }
      }
    }

    return json({
      case_id: caseId,
      jobs: caseJobs.sort((a, b) => b.submitted_at - a.submitted_at)
    });
  } else {
    throw error(400, 'Must provide job_id or case_id parameter');
  }
};

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}