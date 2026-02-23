import { Ollama } from 'ollama';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';
// Construct Ollama client using the named export
const ollama = new Ollama({ host: env.ollama.baseUrl } as any);

export async function summarizeText(text: string, maxLength: number = 500): Promise<string> {
  try {
    logger.info('Generating summary', { textLength: text.length, maxLength });

    const prompt = `Summarize the following legal document in ${maxLength} words or less. Focus on key facts, dates, parties, and legal issues:\n\n${text}`;

    const response = await ollama.generate({
      model: env.ollama.chatModel,
      prompt,
      stream: false,
      options: {
        // Flash-attention-2 optimizations for Gemma3 (configured in Modelfile)
        num_gpu: 30, // Use 30 GPU layers
        use_mmap: true,
        temperature: 0.3, // Lower temperature for factual summaries
        top_p: 0.9,
      } as any, // Ollama types don't include flash_attention yet
    });

    if (!response.response) {
      throw new Error('Empty response from Ollama');
    }

    logger.info('Summary generated', { summaryLength: response.response.length });
    return response.response;
  } catch (error) {
    logger.error('Summarization failed', { error });
    // Fallback to simple truncation
    return text.substring(0, maxLength) + '...';
  }
}

export async function extractKeyPoints(text: string): Promise<string[]> {
  try {
    const prompt = `Extract 5-10 key points from this legal document as a bullet list:\n\n${text}`;

    const response = await ollama.generate({
      model: env.ollama.chatModel,
      prompt,
      stream: false,
      options: {
        num_gpu: 30,
        temperature: 0.3,
      } as any,
    });

    // Parse bullet points from response
    const points = response.response
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•'))
      .map((line: string) => line.trim().replace(/^[-•]\s*/, ''));

    return points;
  } catch (error) {
    logger.error('Key point extraction failed', { error });
    return [];
  }
}
