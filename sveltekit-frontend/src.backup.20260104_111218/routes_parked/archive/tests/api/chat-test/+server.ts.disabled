// Simple chat test without database dependencies
import { json } from '@sveltejs/kit';;
import type { RequestHandler } from './$types';

const CUDA_SERVER_URL = 'http://localhost:8096';

interface ChatRequest {
  messages: Array<any>;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    console.log('🔥 Chat test API called');
    const body: ChatRequest = await request.json();
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return json({ error: 'Messages array required' }, { status: 400 });
    }

    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMessage) {
      return json({ error: 'No user message found' }, { status: 400 });
    }

    console.log('🔥 User message: ', lastUserMessage.content);

    // Submit task to CUDA service
    const submitResponse = await fetch(`${CUDA_SERVER_URL}/api/v1/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'inference',
        priority: 5,
        payload: { prompt: lastUserMessage.content }
      })
    });

    if (!submitResponse.ok) {
      throw new Error(`CUDA server error: ${submitResponse.status}`);
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.task_id;
    console.log('🔥 CUDA task submitted: ', taskId);

    if (!taskId) {
      throw new Error('No task ID returned from CUDA service');
    }

    // Wait a bit then get result
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const resultResponse = await fetch(`${CUDA_SERVER_URL}/api/v1/result/${taskId}`);
    if (!resultResponse.ok) {
      throw new Error(`Failed to get result: ${resultResponse.status}`);
    }

    const resultData = await resultResponse.json();
    console.log('🔥 CUDA result: ', resultData);

    if (resultData.completed_at && resultData.result) {
      // Task completed successfully
      const result = resultData.result;
      return json({
        message: (result as { text?: any; tokens_per_second?: unknown }).text || 'Generated response',
        confidence: 0.8,
        tokensPerSecond: (result as { text?: unknown; tokens_per_second?: unknown }).tokens_per_second || 0,
        taskId: resultData
      });
    }

    if (resultData.error) {
      throw new Error(`CUDA task failed: ${resultData.error}`);
    }

    return json({ message: 'Task is still processing', taskId, status: 'processing' });
  } catch (error: Error | unknown) {
    console.error('❌ Chat test API error: ', error);
    return json(
      {
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
};