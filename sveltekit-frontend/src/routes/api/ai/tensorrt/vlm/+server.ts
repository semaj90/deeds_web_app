/**
 * POST /api/ai/tensorrt/vlm
 *
 * Explicit TensorRT/Triton VLM challenger route with one canonical local
 * fallback: Ornith 1.5 VLM served by llama.cpp on :8090 with the matching
 * Ornith mmproj. Ollama is intentionally not a VLM provider here.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { resizeForVLM } from '$lib/server/image/resize-for-vlm.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import {
  LLAMA_SERVER_BASE_URL,
  getActiveLocalVlmModel,
} from '$lib/server/ai/local-llama-provider.js';

const vlmJsonSchema = z.object({
  prompt: z.string().max(50_000).optional().default(''),
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

interface LlamaProps {
  model_alias?: string;
  modalities?: { vision?: boolean; audio?: boolean };
}

async function loadVisionModel(): Promise<boolean> {
  try {
    const res = await fetch(
      `${getTritonUrl()}/v2/repository/models/${encodeURIComponent(getVisionModel())}/load`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(30_000),
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
        signal: AbortSignal.timeout(5_000),
      }
    );
  } catch {
    // Non-fatal — model may already be unloaded.
  }
}

async function checkTritonHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getTritonUrl()}/v2/health/ready`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function llamaRootUrl(): string {
  return LLAMA_SERVER_BASE_URL.replace(/\/v1\/?$/, '');
}

async function assertOrnithVisionReady(): Promise<{ model: string; props: LlamaProps }> {
  const propsRes = await fetch(`${llamaRootUrl()}/props`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!propsRes.ok) {
    throw new Error(`ORNITH_VLM_PROPS_UNAVAILABLE: HTTP ${propsRes.status}`);
  }

  const props = (await propsRes.json()) as LlamaProps;
  const model = await getActiveLocalVlmModel(true);
  const modelIsOrnith15 = model === 'ornith-1.5' || model.startsWith('ornith-1.5-');
  if (!modelIsOrnith15) {
    throw new Error(`ORNITH_VLM_MODEL_MISMATCH: loaded=${model}`);
  }
  if (props.modalities?.vision !== true) {
    throw new Error(
      'ORNITH_VLM_PROJECTOR_NOT_LOADED: start llama-server with StartupProfile ornith-1.5-vlm'
    );
  }

  return { model, props };
}

async function runOrnithVision(input: Required<Pick<VlmRequest, 'prompt' | 'imageBase64'>> & {
  maxTokens: number;
  temperature: number;
}): Promise<{ text: string; model: string }> {
  const { model } = await assertOrnithVisionReady();
  const response = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${input.imageBase64}` },
            },
          ],
        },
      ],
      stream: false,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ORNITH_VLM_INFERENCE_FAILED: HTTP ${response.status} ${detail.slice(0, 300)}`);
  }

  const rawText = await response.text();
  const data = fastJsonParse<{
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  }>(rawText);
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model: data.model ?? model,
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = request.headers.get('content-type') ?? '';
  let body: VlmRequest;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const prompt = String(formData.get('prompt') ?? '');
    const imageFile = formData.get('image') as File | null;

    let imageBase64: string | undefined;
    if (imageFile) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const resized = await resizeForVLM(buffer).catch(() => ({ buffer }));
      imageBase64 = resized.buffer.toString('base64');
    }

    const formParsed = vlmJsonSchema.safeParse({
      prompt,
      imageBase64,
      maxTokens: Number(formData.get('maxTokens')) || undefined,
      temperature: Number(formData.get('temperature')) || undefined,
    });
    if (!formParsed.success) {
      return json({ error: formParsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    body = formParsed.data;
  } else {
    const parsed = vlmJsonSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    body = parsed.data;
  }

  const prompt = body.prompt;
  const imageBase64 = body.imageBase64;
  const maxTokens = body.maxTokens ?? 2048;
  const temperature = body.temperature ?? 0.7;

  if (!prompt) return json({ error: 'prompt is required' }, { status: 400 });
  if (!imageBase64) {
    return json(
      { error: 'image is required for VLM inference. Use a text endpoint for text-only.' },
      { status: 400 }
    );
  }

  // This endpoint is a TensorRT challenger. If Triton is unavailable, fall
  // directly to the admitted local Ornith VLM. There is deliberately no
  // Ollama/Gemma4 VLM fallback.
  if (!(await checkTritonHealth())) {
    try {
      const result = await runOrnithVision({ prompt, imageBase64, maxTokens, temperature });
      return json({
        text: result.text,
        model: result.model,
        pipeline: ['ornith-1.5', 'official-mmproj', 'llama.cpp'],
        tritonAvailable: false,
        vlmOwner: 'ornith-1.5-vlm',
      });
    } catch (error) {
      return json(
        {
          error: 'Triton unavailable and Ornith VLM is not ready',
          blocker: error instanceof Error ? error.message : String(error),
          hint: 'Launch scripts/launch-turboquant.ps1 -StartupProfile ornith-1.5-vlm -Detached and verify GET :8090/props reports modalities.vision=true.',
        },
        { status: 503 }
      );
    }
  }

  const lease = await acquireGpuLease('tensorrt', 180);
  if (!lease) return json({ error: 'GPU lease held by another backend' }, { status: 409 });

  try {
    const visionLoaded = await loadVisionModel();
    if (!visionLoaded) {
      // A failed challenger load does not promote another Gemma/Ollama path.
      try {
        const result = await runOrnithVision({ prompt, imageBase64, maxTokens, temperature });
        return json({
          text: result.text,
          model: result.model,
          pipeline: ['ornith-1.5', 'official-mmproj', 'llama.cpp'],
          tritonAvailable: true,
          tritonVisionLoadFailed: true,
          vlmOwner: 'ornith-1.5-vlm',
        });
      } catch (error) {
        return json(
          {
            error: 'Triton vision encoder failed to load and Ornith VLM is not ready',
            blocker: error instanceof Error ? error.message : String(error),
          },
          { status: 503 }
        );
      }
    }

    const res = await fetch(`${getTritonUrl()}/v2/models/${encodeURIComponent(getVlmModel())}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [
          {
            name: 'pixel_values',
            shape: [1, 3, 896, 896],
            datatype: 'FP32',
            data: imageBase64,
          },
          {
            name: 'input_ids',
            shape: [1, -1],
            datatype: 'INT64',
            data: prompt,
          },
        ],
        parameters: { max_tokens: maxTokens, temperature },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return json(
        { error: `Triton VLM inference failed: ${res.status}`, details: errText.slice(0, 500) },
        { status: 500 }
      );
    }

    const rawText = await res.text();
    const result = fastJsonParse<{
      outputs?: Array<{ name?: string; datatype?: string; data?: unknown }>;
    }>(rawText);

    const textOutput =
      result.outputs?.find(
        (output) =>
          output.name === 'text_output' ||
          output.name === 'output' ||
          output.datatype === 'BYTES'
      ) ?? result.outputs?.[0];

    const generatedText = textOutput?.data
      ? Array.isArray(textOutput.data)
        ? textOutput.data.map(String).join('')
        : String(textOutput.data)
      : '';

    return json({
      text: generatedText,
      model: getVlmModel(),
      pipeline: [getVisionModel(), 'projector', getVlmModel()],
      tritonAvailable: true,
      vlmOwner: 'tensorrt-challenger',
      fallbackOwner: 'ornith-1.5-vlm',
    });
  } finally {
    await unloadVisionModel();
    await releaseGpuLease('tensorrt').catch((error) =>
      console.warn('[vlm] GPU lease release failed:', error)
    );
  }
};
