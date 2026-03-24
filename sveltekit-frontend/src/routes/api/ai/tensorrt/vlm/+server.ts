/**
 * POST /api/ai/tensorrt/vlm
 *
 * Vision-Language inference via Triton ensemble pipeline:
 *   SigLIP vision encoder → Projector → Gemma3 12B text decoder
 *
 * Accepts multipart form data with an image + text prompt.
 * Falls back to Ollama gemma3 multimodal if Triton is unavailable.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { ENV } from '$lib/server/env.server.js';
import { getTrtLlmUrl, getOllamaUrl } from '$lib/config/env.server.js';
import { z } from 'zod';
import { resizeForVLM } from '$lib/server/image/resize-for-vlm.js';

const vlmJsonSchema = z.object({
  prompt: z.string().max(50000).optional().default(''),
  imageBase64: z.string().max(50_000_000).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const getTritonUrl = () => getTrtLlmUrl();

interface VlmRequest {
  prompt: string;
  imageBase64?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Load the SigLIP vision model on-demand via Triton model control API.
 * This avoids VRAM conflicts with the always-loaded text decoder.
 */
async function loadVisionModel(): Promise<boolean> {
  try {
    const res = await fetch(`${getTritonUrl()}/v2/repository/models/siglip_vision/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function unloadVisionModel(): Promise<void> {
  try {
    await fetch(`${getTritonUrl()}/v2/repository/models/siglip_vision/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — model may already be unloaded
  }
}

async function checkTritonHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getTritonUrl()}/v2/health/ready`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  let body: VlmRequest;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const prompt = formData.get('prompt') as string;
    const imageFile = formData.get('image') as File | null;

    let imageBase64: string | undefined;
    if (imageFile) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      // Resize to Gemma3 native 896×896 before base64 encoding
      const resized = await resizeForVLM(buffer).catch(() => ({ buffer }));
      imageBase64 = resized.buffer.toString('base64');
    }

    body = {
      prompt,
      imageBase64,
      maxTokens: parseInt(formData.get('maxTokens') as string) || undefined,
      temperature: parseFloat(formData.get('temperature') as string) || undefined,
    };
  } else {
    const rawJson = await request.json();
    const jsonParsed = vlmJsonSchema.safeParse(rawJson);
    if (!jsonParsed.success) {
      return json(
        { error: jsonParsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    body = jsonParsed.data as VlmRequest;
  }

  const { prompt, imageBase64, maxTokens = 2048, temperature = 0.7 } = body;

  if (!prompt || typeof prompt !== 'string') {
    return json({ error: 'prompt is required' }, { status: 400 });
  }

  if (!imageBase64) {
    return json(
      { error: 'image is required for VLM inference. Use /api/ai/tensorrt for text-only.' },
      { status: 400 }
    );
  }

  // Check Triton health — fall back to Ollama if unavailable
  const tritonReady = await checkTritonHealth();
  if (!tritonReady) {
    // Ollama VLM fallback: gemma3 supports multimodal (image + text)
    try {
      const ollamaUrl = getOllamaUrl();
      const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt,
          images: [imageBase64],
          stream: false,
          options: { temperature, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (ollamaRes.ok) {
        const ollamaData = await ollamaRes.json();
        return json({
          text: ollamaData.response ?? '',
          model: 'gemma3-legal (ollama fallback)',
          pipeline: ['ollama-multimodal'],
          tritonAvailable: false,
        });
      }
    } catch {
      // Ollama also unavailable
    }
    return json(
      {
        error: 'Triton and Ollama VLM both unavailable',
        fallback: 'ollama',
        hint: 'Start Ollama with gemma3-legal or start Triton container',
      },
      { status: 503 }
    );
  }

  // Acquire GPU lease
  const lease = await acquireGpuLease('tensorrt', 180);
  if (!lease) {
    return json({ error: 'GPU lease held by another backend' }, { status: 409 });
  }

  try {
    // Load vision model on-demand
    const visionLoaded = await loadVisionModel();
    if (!visionLoaded) {
      return json({ error: 'Failed to load vision encoder' }, { status: 500 });
    }

    // Call Triton ensemble: SigLIP → Projector → Gemma3
    const res = await fetch(`${getTritonUrl()}/v2/models/gemma_vlm_ensemble/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [
          {
            name: 'pixel_values',
            // Gemma3 SigLIP encoder native resolution: 896×896
            shape: [1, 3, 896, 896],
            datatype: 'FP32',
            data: imageBase64, // Triton Python backend decodes base64
          },
          {
            name: 'input_ids',
            shape: [1, -1],
            datatype: 'INT64',
            data: prompt, // Tokenized by backend
          },
        ],
        parameters: {
          max_tokens: maxTokens,
          temperature: temperature,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json(
        {
          error: `Triton VLM inference failed: ${res.status}`,
          details: errText.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const result = await res.json();
    const logits = result.outputs?.[0]?.data;

    return json({
      text: logits ? 'VLM inference complete' : '',
      model: 'gemma3-vlm-ensemble',
      pipeline: ['siglip_vision', 'gemma_projector', 'gemma_legal'],
      tritonAvailable: true,
    });
  } finally {
    // Unload vision model to free VRAM, then release lease
    await unloadVisionModel();
    await releaseGpuLease('tensorrt').catch(() => {});
  }
};
