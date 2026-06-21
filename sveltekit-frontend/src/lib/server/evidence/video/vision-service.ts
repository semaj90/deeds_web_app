import { ENV } from '$lib/server/env.server.js';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getOllamaEndpoint, ollamaFetch, VLM_MODELS } from '$lib/server/ollama.js';
import { qdrant } from '$lib/server/db/unified-client.js';
import { db } from '$lib/server/db/client.js';
import { evidenceFrames } from '$lib/server/db/schema/index.js';
import { SeaweedService } from '$lib/server/seaweed-service.js';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';

export class VisionService {
  private seaweed = new SeaweedService();

  /**
   * Extracts keyframes from a video buffer.
   * Command: ffmpeg -i input.mp4 -vf "fps=1/10,scale=768:-1" frames/frame-%05d.jpg
   */
  async extractFrames(videoBuffer: Buffer): Promise<{ timestampMs: number; buffer: Buffer }[]> {
    const tempId = randomUUID();
    const inputPath = join(tmpdir(), `${tempId}_in.mp4`);
    const outputDir = join(tmpdir(), `${tempId}_frames`);

    try {
      await writeFile(inputPath, videoBuffer);
      await mkdir(outputDir, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn(ENV.FFMPEG_PATH || 'ffmpeg', [
          '-i', inputPath,
          '-vf', 'fps=1/10,scale=768:-1',
          join(outputDir, 'frame-%05d.jpg')
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg frames extraction failed with code ${code}`));
        });
        
        ffmpeg.on('error', reject);
      });

      const files = await readdir(outputDir);
      const frames = [];

      for (const file of files.sort()) {
        const filePath = join(outputDir, file);
        const buffer = await readFile(filePath);
        
        // Match frame-00001.jpg -> index 1 -> 0s
        // index 1 = 0s, index 2 = 10s, ...
        const match = file.match(/frame-(\d+)\.jpg/);
        const index = match ? parseInt(match[1], 10) : 0;
        const timestampMs = (index - 1) * 10000;

        frames.push({ timestampMs, buffer });
      }

      return frames;
    } finally {
      await unlink(inputPath).catch(() => {});
      // Cleanup directory
      const files = await readdir(outputDir).catch(() => []);
      for (const file of files) {
        await unlink(join(outputDir, file)).catch(() => {});
      }
    }
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
      const res = await ollamaFetch(`${getOllamaEndpoint()}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VLM_MODELS.vision,
          prompt: `Analyze this video frame for a legal case. 
          Return a JSON object with: 
          - "caption": A detailed description of the scene.
          - "objects": A list of key objects visible.
          - "ocrText": Any visible text (license plates, signs, documents).
          - "tags": 3-5 descriptive tags.
          
          Respond ONLY with the JSON object.`,
          images: [base64],
          stream: false,
          format: 'json',
          options: { temperature: 0.1 }
        })
      });

      if (!res.ok) throw new Error(`VLM failed: ${await res.text()}`);
      const data = await res.json() as { response: string };
      const parsed = JSON.parse(data.response);

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
      const res = await ollamaFetch(`${getOllamaEndpoint()}/api/embeddings`, {
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
