/**
 * POST /api/ai/tensorrt/vlm
 *
 * Vision-Language inference via Triton ensemble pipeline:
 *   SigLIP vision encoder → Projector → VLM challenger
 *
 * Accepts multipart form data with an image + text prompt.
 * Falls back to the canonical Ornith llama.cpp VLM when Triton is unavailable.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { ENV } from '$lib/server/env.server.js';

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
const getOrnithUrl = () => (ENV.LLAMA_SERVER_URL ?? ENV.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const ORNITH_MODEL = 'ornith-1.5-9b';

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

async function callOrnithVlm(input: {
  prompt: string;
  imageBase64: string;
  maxTokens: number;
  temperature: number;
}): Promise<{ text: string; model: string }> {
  const baseUrl = getOrnithUrl();
  const propsResponse = await fetch(`${baseUrl}/props`, { signal: AbortSignal.timeout(3000) });
  if (!propsResponse.ok) throw new Error(`ORNITH_PROPS_HTTP_${propsResponse.status}`);
  const props = await propsResponse.json() as { modalities?: { vision?: boolean }; model_alias?: string };
  if (props.modalities?.vision !== true) throw new Error('ORNITH_VISION_PROJECTOR_UNAVAILABLE');
  const model = props.model_alias?.startsWith('ornith-') ? props.model_alias : ORNITH_MODEL;
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [
        { type: 'text', text: input.prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${input.imageBase64}` } },
      ] }],
      stream: false,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`ORNITH_VLM_HTTP_${response.status}`);
  const data = await response.json() as { model?: string; choices?: Array<{ message?: { content?: string } }> };
  return { text: data.choices?.[0]?.message?.content ?? '', model: data.model ?? model };
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

  // Triton is a challenger. The canonical fallback is Ornith llama.cpp with
  // its matching projector; Ollama is deliberately not a VLM provider here.
  const tritonReady = await checkTritonHealth();
  if (!tritonReady) {
    try {
      const ornith = await callOrnithVlm({ prompt, imageBase64, maxTokens, temperature });
      return json({
        text: ornith.text,
        model: ornith.model,
        pipeline: ['ornith-llama.cpp-vlm'],
        tritonAvailable: false,
      });
    } catch (error) {
      return json(
        {
          error: 'Triton unavailable and Ornith VLM unavailable',
          fallback: 'none',
          hint: 'Start llama.cpp on :8090 with the Ornith model and matching mmproj projector',
          details: error instanceof Error ? error.message : 'ORNITH_VLM_UNAVAILABLE',
        },
        { status: 503 },
      );
    }
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

    // Call the Triton challenger ensemble: SigLIP → Projector → VLM decoder
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
