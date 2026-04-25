import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const TENSORRT_SERVER = 'http://localhost:8100';

interface TensorRTHealth {
  status: string;
  tensorrt_available?: boolean;
  cuda_available?: boolean;
  gpu_name?: string;
  error?: string;
}

interface TensorRTRequest {
  text: string;
  model?: string;
}

interface TensorRTResponse {
  result?: string;
  embedding?: number[];
  dimensions?: number;
  processing_time_ms?: number;
  inference_time_ms?: number;
  status: string;
}

export const GET: RequestHandler = async () => {
  try {
    const response = await fetch(`${TENSORRT_SERVER}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TensorRT server returned ${response.status}`);
    }

    const health: TensorRTHealth = await response.json();

    return json({
      status: 'connected',
      tensorrt_server: TENSORRT_SERVER,
      timestamp: new Date().toISOString(),
      ...health,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return json(
      {
        status: 'disconnected',
        tensorrt_server: TENSORRT_SERVER,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        help: 'Start TensorRT-LLM server with: wsl bash -c "cd ~/legal-ai-system && source tensorrt_env/bin/activate && python3 legal_api_server.py"',
      },
      { status: 503 }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: TensorRTRequest = await request.json();
    const { text, model = 'gemma3-legal' } = body;

    if (!text?.trim()) {
      return error(400, { message: 'Text is required and cannot be empty' });
    }

    // Call WSL2 TensorRT-LLM server
    const startTime = Date.now();
    const response = await fetch(`${TENSORRT_SERVER}/inference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ text: text.trim(), model }),
      // Add timeout for better error handling
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown server error');
      throw new Error(`TensorRT server error (${response.status}): ${errorText}`);
    }

    const result: TensorRTResponse = await response.json();
    const totalTime = Date.now() - startTime;

    return json({
      success: true,
      model,
      text,
      total_time_ms: totalTime,
      server_endpoint: TENSORRT_SERVER,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('TensorRT inference error:', err);

    const errorMessage = err instanceof Error ? err.message : 'TensorRT inference failed';

    return json(
      {
        success: false,
        error: errorMessage,
        server_endpoint: TENSORRT_SERVER,
        timestamp: new Date().toISOString(),
        help:
          err instanceof TypeError && err.message.includes('fetch')
            ? 'TensorRT server appears to be down. Please start it first.'
            : 'Check TensorRT server logs for details',
      },
      { status: 500 }
    );
  }
};
