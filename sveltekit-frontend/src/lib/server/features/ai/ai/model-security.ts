import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { db } from '$lib/server/db/client';
import { modelArtifacts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

const QUARANTINE_DIR = path.join(process.cwd(), 'models/quarantine');
const APPROVED_DIR = path.join(process.cwd(), 'models/approved');

/**
 * ModelSecurityService
 * 
 * Implements a staged workflow for model weight ingestion.
 * Prevents execution of arbitrary binaries or overwriting active weights.
 */
export class ModelSecurityService {
  /**
   * Stage a candidate GGUF model for review.
   */
  static async stageModel(sourcePath: string, name: string): Promise<string> {
    await fs.mkdir(QUARANTINE_DIR, { recursive: true });
    
    // 1. Check extension
    if (!sourcePath.toLowerCase().endsWith('.gguf')) {
      throw new Error('Only GGUF model weights are permitted.');
    }

    // 2. Compute SHA256
    const fileBuffer = await fs.readFile(sourcePath);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    // 3. Check for duplicates
    const existing = await db.select().from(modelArtifacts).where(eq(modelArtifacts.sha256, hash));
    if (existing.length > 0) {
      throw new Error(`Model with hash ${hash.slice(0, 8)} already exists.`);
    }

    // 4. Copy to quarantine
    const targetPath = path.join(QUARANTINE_DIR, `${hash}.gguf`);
    await fs.copyFile(sourcePath, targetPath);

    // 5. Register in DB
    await db.insert(modelArtifacts).values({
      name,
      path: targetPath,
      sha256: hash,
      approved: false,
    });

    return hash;
  }

  /**
   * Approve and activate a model artifact.
   */
  static async approveAndActivate(hash: string): Promise<boolean> {
    const artifact = await db.select().from(modelArtifacts).where(eq(modelArtifacts.sha256, hash)).then(r => r[0]);
    if (!artifact) throw new Error('Artifact not found');

    // 1. Move to approved directory
    await fs.mkdir(APPROVED_DIR, { recursive: true });
    const finalPath = path.join(APPROVED_DIR, `${artifact.name}-${hash.slice(0, 8)}.gguf`);
    await fs.rename(artifact.path, finalPath);

    // 2. Update DB
    await db.update(modelArtifacts)
      .set({ 
        path: finalPath, 
        approved: true, 
        activatedAt: new Date() 
      })
      .where(eq(modelArtifacts.sha256, hash));

    console.log(`✅ Model ${artifact.name} approved and activated at ${finalPath}`);
    return true;
  }

  /**
   * List approved models for Hermes tools.
   */
  static async listApprovedModels() {
    return await db.select().from(modelArtifacts).where(eq(modelArtifacts.approved, true));
  }
}
