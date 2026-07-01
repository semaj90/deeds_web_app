/**
 * Gemma4 RotorQuant Summary Wrapper
 *
 * Handles:
 * - Streaming summarization requests to llama-server :8090
 * - Stripping <|channel>thought blocks from output
 * - Timeout handling (30s per request)
 * - Graceful fallback to Ollama
 */

interface SummarizeRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

interface SummarizeResponse {
  summary: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/**
 * Strip <|channel>thought blocks from model output
 * Handles two formats:
 * 1. <|channel>thought<channel|>...content...<channel|>
 * 2. <|channel>thought...content...<|channel>
 */
function stripThoughtBlocks(text: string): string {
  // Remove <|channel>thought...content...<channel|> blocks
  let result = text.replace(/<\|channel>thought<channel\|>[\s\S]*?<channel\|>/g, '');

  // Remove any remaining <|channel>thought...content...</|channel> format
  result = result.replace(/<\|channel>thought[\s\S]*?<\|channel>/g, '');

  // Clean up extra whitespace
  return result.trim();
}

/**
 * Summarize via Gemma4 RotorQuant with thought block stripping
 */
export async function summarizeWithGemma4(req: SummarizeRequest): Promise<SummarizeResponse> {
  const {
    prompt,
    maxTokens = 768,  // Increased to accommodate thinking block + answer
    temperature = 0.3,
    timeout = 30000
  } = req;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content: 'You are a legal AI assistant. Provide clear, concise summaries.'
          },
          { role: 'user', content: prompt }
        ],
        stream: false,
        max_tokens: maxTokens,
        temperature,
        cache_prompt: true,
        cache_reuse: 256
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`llama-server error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    let content = data.choices?.[0]?.message?.content || '';

    // Strip thought blocks
    content = stripThoughtBlocks(content);

    return {
      summary: content,
      model: 'gemma4-rotorquant:iq4_xs',
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens
    };
  } catch (error) {
    if ((error as any).name === 'AbortError') {
      throw new Error('Gemma4 summarization timed out');
    }
    // Fall through to Ollama fallback
    console.warn('Gemma4 summarization failed:', error);
    return summarizeWithOllama(req);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fallback summarization via Ollama
 */
async function summarizeWithOllama(req: SummarizeRequest): Promise<SummarizeResponse> {
  const { prompt, maxTokens = 512, temperature = 0.3 } = req;

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      messages: [
        {
          role: 'system',
          content: 'You are a legal AI assistant. Provide clear, concise summaries.'
        },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  return {
    summary: data.message?.content || '',
    model: 'gemma3-legal:latest',
    totalTokens: data.prompt_eval_count + data.eval_count
  };
}

/**
 * Batch summarization with job tracking
 */
export async function summarizeBatchPackets(
  packets: Array<{ id: string; content: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<{ id: string; summary: string }>> {
  const results: Array<{ id: string; summary: string }> = [];

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    try {
      const response = await summarizeWithGemma4({
        prompt: `Summarize this code/feature in 50-100 words:\n\n${packet.content}`
      });
      results.push({
        id: packet.id,
        summary: response.summary
      });
    } catch (error) {
      console.error(`Failed to summarize packet ${packet.id}:`, error);
      results.push({
        id: packet.id,
        summary: `[Error: ${(error as Error).message}]`
      });
    }

    if (onProgress) {
      onProgress(i + 1, packets.length);
    }
  }

  return results;
}
