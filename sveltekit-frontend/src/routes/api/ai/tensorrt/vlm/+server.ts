/**
 * POST /api/ai/tensorrt/vlm
 *
 * Vision-Language inference via Triton ensemble pipeline:
 *   SigLIP vision encoder → Projector → Gemma4 text decoder
 *
 * Accepts multipart form data with an image + text prompt.
 * Falls back to Ollama gemma4 multimodal if Triton is unavailable.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { routeInference } from '$lib/server/inference/inference-router.js';
import { ENV } from '$lib/server/env.server.js';

import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';
import { resizeForVLM } from '$lib/server/image/resize-for-vlm.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

const vlmJsonSchema = z.object({
  prompt: z.string().max(50000).optional().default(''),
  imageBase64: z.string().max(50_000_000).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const getTritonUrl = () => ENV.TRITON_URL.replace(/\/$/, '');
const getVlmModel = () => ENV.TRITON_VLM_MODEL;
const getVisionModel = () => ENV.TRITON_VISION_MODEL;

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
    const res = await fetch(
      `${getTritonUrl()}/v2/repository/models/${encodeURIComponent(getVisionModel())}/load`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function unloadVisionModel(): Promise<void> {
  try {
    await fetch(
      `${getTritonUrl()}/v2/repository/models/${encodeURIComponent(getVisionModel())}/unload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      }
    );
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

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const contentType = request.headers.get('content-type') ?? '';
  let body: VlmRequest;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const prompt = formData.get('prompt') as string;
    const imageFile = formData.get('image') as File | null;

    let imageBase64: string | undefined;
    if (imageFile) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      // resizeForVLM clamps to GEMMA4_VLM_MAX_EDGE (2048); Triton SigLIP re-resizes server-side
      const resized = await resizeForVLM(buffer).catch(() => ({ buffer }));
      imageBase64 = resized.buffer.toString('base64');
    }

    body = {
      prompt,
      imageBase64,
      maxTokens: parseInt(formData.get('maxTokens') as string) || undefined,
      temperature: parseFloat(formData.get('temperature') as string) || undefined,
    };
    // Validate formdata fields with the same schema as JSON path
    const formParsed = vlmJsonSchema.safeParse(body);
    if (!formParsed.success) {
      return json(
        { error: formParsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    body = formParsed.data as VlmRequest;
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

  // Check Triton health — fall back to Ollama VLM cascade if unavailable
  const tritonReady = await checkTritonHealth();
  if (!tritonReady) {
    // Fast path: try direct Ollama VLM first (works when VRAM is free)
    try {
      const ollamaUrl = ENV.OLLAMA_BASE_URL;
      const vlmModel = ENV.GEMMA4_MODEL ?? 'gemma4:e4b-it-q4_K_M';
      const ollamaRes = await ollamaFetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: vlmModel,
          messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
          stream: false,
          keep_alive: '24h',
          options: { temperature, num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (ollamaRes.ok) {
        const rawText = await ollamaRes.text();
        const ollamaData = fastJsonParse<{ message?: { content?: string } }>(rawText);
        return json({
          text: ollamaData.message?.content ?? '',
          model: `${vlmModel} (ollama fallback)`,
          pipeline: ['ollama-multimodal'],
          tritonAvailable: false,
        });
      }
    } catch {
      // Ollama direct failed — try inference router (has VRAM swap)
    }

    // Slow path: inference router with VRAM swap (stops llama-server, runs VLM, restarts)
    const routed = await routeInference({ prompt, imageBase64, maxTokens, temperature });
    if (!routed.error) {
      return json({
        text: routed.text,
        model: `${routed.model} (${routed.backend} fallback)`,
        pipeline: [routed.backend],
        tritonAvailable: false,
        latencyMs: routed.latencyMs,
      });
    }

    return json(
      {
        error: 'Triton and Ollama VLM both unavailable',
        fallback: 'inference-router',
        hint: 'Start Ollama with gemma4 VLM model or start Triton container',
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

    // Call Triton ensemble: SigLIP → Projector → Gemma4
    const res = await fetch(
      `${getTritonUrl()}/v2/models/${encodeURIComponent(getVlmModel())}/infer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: [
            {
              name: 'pixel_values',
              // SigLIP vision encoder trained at 896×896 (Triton resizes from input)
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
      }
    );

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

    const rawText = await res.text();
    const result = fastJsonParse<{
      outputs?: Array<{ name?: string; datatype?: string; data?: unknown }>;
    }>(rawText);

    // Extract generated text from Triton v2 inference response
    // TRT-LLM backends return text in an output named 'text_output' (BYTES datatype)
    let generatedText = '';
    if (result.outputs && Array.isArray(result.outputs)) {
      const textOutput =
        result.outputs.find(
          (o: { name?: string; datatype?: string }) =>
            o.name === 'text_output' || o.name === 'output' || o.datatype === 'BYTES'
        ) ?? result.outputs[0];

      if (textOutput?.data) {
        generatedText = Array.isArray(textOutput.data)
          ? textOutput.data.map(String).join('')
          : String(textOutput.data);
      }
    }

    return json({
      text: generatedText,
      model: getVlmModel(),
      pipeline: [getVisionModel(), 'gemma_projector', getVlmModel()],
      tritonAvailable: true,
    });
  } finally {
    // Unload vision model to free VRAM, then release lease
    await unloadVisionModel();
    await releaseGpuLease('tensorrt').catch((e) =>
      console.warn('[vlm] GPU lease release failed:', e)
    );
  }
};
