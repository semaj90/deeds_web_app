import { ENV } from '$lib/server/env.server.js';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getOllamaEndpoint, embedOrChatFetch, VLM_MODELS } from '$lib/server/ollama.js';
import { getLlamaServerUrl } from '$lib/server/config/llama-server.js';
import { qdrant } from '$lib/server/db/unified-client.js';
import { db } from '$lib/server/db/client.js';
import { evidenceFrames } from '$lib/server/db/schema/index.js';
import { SeaweedService } from '$lib/server/seaweed-service.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import {
  DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1,
  searchKeyframesByBitsetTopKV1,
  selectSceneCutKeyframesV1,
  sliceRawGray9x8StreamV1,
  type SceneCutKeyframeResultV1
} from './dhash-keyframe-filter-v1.js';
import { parseFfmpegPresentationTimestampsV1 } from '$lib/server/features/evidence/video/ffmpeg-presentation-timestamps-v1.js';

export class VisionService {
  private seaweed = new SeaweedService();

  /**
   * Extracts keyframes from a video buffer.
   * Default command: ffmpeg -i input.mp4 -vf "fps=1,scale=768:-1" frames/frame-%05d.jpg
   * Produces 1 frame per second (50 frames for a 50s video) up to maxFrames.
   */
  async extractFrames(
    videoBuffer: Buffer,
    options?: { fps?: number; maxFrames?: number; scaleWidth?: number }
  ): Promise<{ timestampMs: number; buffer: Buffer }[]> {
    const fps = Math.min(4, Math.max(0.01, options?.fps ?? 1));
    const maxFrames = Math.min(120, Math.max(1, options?.maxFrames ?? 60));
    const scaleWidth = Math.min(2048, Math.max(64, options?.scaleWidth ?? 768));

    const tempId = randomUUID();
    const inputPath = join(tmpdir(), `${tempId}_in.mp4`);
    const outputDir = join(tmpdir(), `${tempId}_frames`);
    let extractedTimestamps: number[] = [];

    try {
      await writeFile(inputPath, videoBuffer);
      await mkdir(outputDir, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn(ENV.FFMPEG_PATH || 'ffmpeg', [
          '-hide_banner', '-loglevel', 'info',
          '-i', inputPath,
          '-vf', `fps=${fps},scale=${scaleWidth}:-1,showinfo`,
          join(outputDir, 'frame-%05d.jpg')
        ], { shell: false, windowsHide: true });

        let stderr = '';
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          ffmpeg.kill('SIGKILL');
          reject(new Error('FFmpeg frame extraction timed out'));
        }, 5 * 60 * 1000);
        ffmpeg.stderr?.on('data', (chunk: Buffer | string) => {
          if (stderr.length < 2 * 1024 * 1024) stderr += chunk.toString();
        });

        ffmpeg.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          extractedTimestamps = parseFfmpegPresentationTimestampsV1(stderr);
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg frames extraction failed with code ${code}: ${stderr.slice(-500)}`));
        });

        ffmpeg.on('error', (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });

      });

      const files = await readdir(outputDir);
      const frames = [];

      for (const file of files.sort()) {
        if (frames.length >= maxFrames) break;
        const filePath = join(outputDir, file);
        const buffer = await readFile(filePath);
        
        const timestampMs = Math.round(extractedTimestamps[frames.length] * 1000);
        if (!Number.isFinite(timestampMs) || timestampMs < 0) {
          throw new Error('FFMPEG_FRAME_PRESENTATION_TIMESTAMP_MISSING');
        }

        frames.push({ timestampMs, buffer });
      }

      return frames;
    } finally {
      await unlink(inputPath).catch(() => {});
      // Cleanup directory
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Extracts 9x8 grayscale strips via FFmpeg and filters scene cuts with 64-bit dHash Hamming distance.
   */
  async extractSceneCutDhashes(
    videoBuffer: Buffer,
    options?: { intervalMs?: number; minHammingDistance?: number }
  ): Promise<SceneCutKeyframeResultV1> {
    const intervalMs = options?.intervalMs ?? 1000;
    const minHammingDistance = options?.minHammingDistance ?? DEFAULT_SCENE_CUT_HAMMING_THRESHOLD_V1;
    const tempDir = await mkdtemp(join(tmpdir(), 'vision-dhash-'));
    const inputPath = join(tempDir, 'input.mp4');

    try {
      await writeFile(inputPath, videoBuffer);

      const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const ffmpeg = spawn(ENV.FFMPEG_PATH || 'ffmpeg', [
          '-v', 'error',
          '-i', inputPath,
          '-vf', `fps=1000/${intervalMs},scale=9:8:flags=area,format=gray`,
          '-f', 'rawvideo',
          'pipe:1'
        ]);

        ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve(Buffer.concat(chunks));
          } else {
            const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
            reject(
              new Error(
                stderrText
                  ? `FFmpeg raw9x8 extraction failed with code ${code}: ${stderrText}`
                  : `FFmpeg raw9x8 extraction failed with code ${code}`
              )
            );
          }
        });

        ffmpeg.on('error', reject);
      });

      const candidates = sliceRawGray9x8StreamV1(rawBuffer, { intervalMs });
      return selectSceneCutKeyframesV1(candidates, { minHammingDistance });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Ranks keyframe bitsets by Hamming distance using turbovec-napi SIMD POPCNT with TS fallback.
   */
  rankKeyframesByHamming(
    queryWords: BigUint64Array | Uint8Array,
    corpusFlatWords: BigUint64Array | Uint8Array,
    wordsPerVec = 1,
    topK = 5
  ): Array<{ index: number; distance: number }> {
    return searchKeyframesByBitsetTopKV1(queryWords, corpusFlatWords, wordsPerVec, topK);
  }

  /**
   * Analyzes a frame using Gemma4 VLM.
   */
  async analyzeFrame(frameBuffer: Buffer): Promise<{
    caption: string;
    objects: string[];
    ocrText: string;
    tags: string[];
  }> {
    const base64 = frameBuffer.toString('base64');

    try {
      const res = await fetch(`${getLlamaServerUrl('/v1')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VLM_MODELS.vision,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              {
                type: 'text',
                text: `Analyze this video frame for a legal case. 
          Return a JSON object with: 
          - "caption": A detailed description of the scene.
          - "objects": A list of key objects visible.
          - "ocrText": Any visible text (license plates, signs, documents).
          - "tags": 3-5 descriptive tags.
          
          Respond ONLY with the JSON object.`,
              },
            ],
          }],
          stream: false,
          temperature: 0.1,
          max_tokens: 512,
        })
      });

      if (!res.ok) throw new Error(`VLM failed: ${await res.text()}`);
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');

      return {
        caption: parsed.caption || '',
        objects: parsed.objects || [],
        ocrText: parsed.ocrText || '',
        tags: parsed.tags || []
      };
    } catch (error) {
      console.error('[VisionService] Frame analysis failed:', error);
      return { caption: 'Analysis failed.', objects: [], ocrText: '', tags: [] };
    }
  }

  /**
   * Indexes frame into Qdrant.
   */
  async indexFrame(
    evidenceId: string,
    frameId: string,
    timestampMs: number,
    analysis: any,
    storageUri: string
  ) {
    if (!qdrant) return;

    const embedding = await this.getEmbedding(analysis.caption);
    if (!embedding) return;

    await qdrant.upsert('evidence_visual_chunks', {
      points: [{
        id: randomUUID(),
        vector: embedding,
        payload: {
          evidence_id: evidenceId,
          frame_id: frameId,
          modality: 'video',
          view: 'frame_caption',
          timestamp_ms: timestampMs,
          text: analysis.caption,
          objects: analysis.objects,
          ocr_text: analysis.ocrText,
          source_uri: storageUri,
          trust_tier: 'vlm_inference'
        }
      }]
    });
  }

  private async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const res = await embedOrChatFetch(`${getOllamaEndpoint()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VLM_MODELS.embedding,
          prompt: text
        })
      });

      if (!res.ok) return null;
      const data = await res.json() as { embedding: number[] };
      return data.embedding;
    } catch {
      return null;
    }
  }

  /**
   * Links frame in Neo4j.
   */
  async linkInGraph(evidenceId: string, frameId: string, timestampMs: number, analysis: any) {
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      await session.executeWrite(tx => tx.run(`
        MATCH (e:Evidence {id: $evidenceId})
        MERGE (f:Frame {id: $frameId})
        SET f.timestampMs = $timestampMs,
            f.caption = $caption,
            f.ocrText = $ocrText
        MERGE (e)-[:HAS_FRAME]->(f)
        WITH f
        UNWIND $objects as objName
        MERGE (o:Entity {name: objName, type: 'Object'})
        MERGE (f)-[:DEPICTS]->(o)
        WITH f
        UNWIND $tags as tagName
        MERGE (t:Tag {name: tagName})
        MERGE (f)-[:TAGGED]->(t)
      `, {
        evidenceId,
        frameId,
        timestampMs,
        caption: analysis.caption,
        ocrText: analysis.ocrText,
        objects: analysis.objects,
        tags: analysis.tags
      }));
    } finally {
      await session.close();
    }
  }
}
