/**
 * Rune-to-Tensor UUID Generator
 *
 * Generates unique tensor UUIDs for each rune symbol, along with
 * FP16 embeddings, INT4 quantization, and tile indices.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Rune bank entry containing all mappings for a single rune
 */
export interface RuneBank {
  rune: string;              // Unicode symbol
  tensor_uuid: string;       // Hex UUID
  embedding_fp16: number[];  // 768-dim FP16 vector
  latent_int4: string;       // Hex INT4 quantization
  tile_index: number;        // Atlas position (0-25)
}

/**
 * Base set of 26 runes representing legal concepts
 */
const BASE_RUNES: string[] = [
  "𓂀", "✶", "◎", "⚖", "◈", "❂", "𓇳", "✧",
  "⚕", "✤", "☉", "◐", "𓅓", "◉", "●", "✱",
  "⚚", "𓃠", "✺", "⚔", "✦", "𓁹", "❖", "✴",
  "𓋹", "❉"
];

/**
 * Rune bank storage (in-memory cache)
 */
let runeBank: Map<string, RuneBank> = new Map();
let runeBySymbol: Map<string, RuneBank> = new Map();

/**
 * Generate a random FP16 embedding (768-dim)
 * In production, this would use a pre-trained model
 */
function generateFP16Embedding(): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < 768; i++) {
    // Generate random normal distribution value
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    embedding.push(z);
  }
  return embedding;
}

/**
 * Normalize embedding to unit vector
 */
function normalizeEmbedding(embedding: number[]): number[] {
  let norm = 0;
  for (const val of embedding) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return embedding;

  return embedding.map(val => val / norm);
}

/**
 * Quantize FP32 embedding to INT4 (4-bit integers)
 * Simplified version: scale to [0, 15] range
 */
function quantizeToINT4(embedding: number[]): string {
  const quantized: number[] = [];

  // Find min/max for scaling
  let min = Math.min(...embedding);
  let max = Math.max(...embedding);
  const range = max - min || 1;

  // Quantize each value to [0, 15]
  for (const val of embedding) {
    const scaled = Math.round(((val - min) / range) * 15);
    quantized.push(Math.max(0, Math.min(15, scaled)));
  }

  // Pack two 4-bit values into one byte
  const bytes: number[] = [];
  for (let i = 0; i < quantized.length; i += 2) {
    const high = quantized[i] & 0xF;
    const low = (quantized[i + 1] || 0) & 0xF;
    bytes.push((high << 4) | low);
  }

  // Convert to hex string
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the complete rune bank with all 26 runes
 */
export function buildRunes(): RuneBank[] {
  runeBank.clear();
  runeBySymbol.clear();

  const bank: RuneBank[] = [];

  for (let idx = 0; idx < BASE_RUNES.length; idx++) {
    const rune = BASE_RUNES[idx];

    // Generate embeddings
    const embedding = generateFP16Embedding();
    const normalized = normalizeEmbedding(embedding);

    // Quantize to INT4
    const latent = quantizeToINT4(normalized);

    // Create rune bank entry
    const entry: RuneBank = {
      rune,
      tensor_uuid: uuidv4(),
      embedding_fp16: normalized,
      latent_int4: latent,
      tile_index: idx,
    };

    bank.push(entry);
    runeBank.set(entry.tensor_uuid, entry);
    runeBySymbol.set(rune, entry);
  }

  return bank;
}

/**
 * Get rune by UUID
 */
export function getRuneByUUID(uuid: string): RuneBank | null {
  return runeBank.get(uuid) || null;
}

/**
 * Get rune by symbol
 */
export function getRuneBySymbol(rune: string): RuneBank | null {
  return runeBySymbol.get(rune) || null;
}

/**
 * Get all runes in the bank
 */
export function getAllRunes(): RuneBank[] {
  return Array.from(runeBank.values());
}

/**
 * Get rune by tile index
 */
export function getRuneByTileIndex(index: number): RuneBank | null {
  if (index < 0 || index >= BASE_RUNES.length) {
    return null;
  }
  return runeBySymbol.get(BASE_RUNES[index]) || null;
}

/**
 * Verify rune bank integrity
 */
export function verifyRuneBankIntegrity(bank: RuneBank[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const uuids = new Set<string>();
  const symbols = new Set<string>();
  const indices = new Set<number>();

  for (const entry of bank) {
    // Check UUID uniqueness
    if (uuids.has(entry.tensor_uuid)) {
      errors.push(`Duplicate UUID: ${entry.tensor_uuid}`);
    }
    uuids.add(entry.tensor_uuid);

    // Check symbol uniqueness
    if (symbols.has(entry.rune)) {
      errors.push(`Duplicate rune: ${entry.rune}`);
    }
    symbols.add(entry.rune);

    // Check tile index bounds
    if (entry.tile_index < 0 || entry.tile_index >= BASE_RUNES.length) {
      errors.push(`Invalid tile index: ${entry.tile_index}`);
    }
    indices.add(entry.tile_index);

    // Check embedding dimensions
    if (entry.embedding_fp16.length !== 768) {
      errors.push(`Invalid embedding dimension: ${entry.embedding_fp16.length}`);
    }

    // Check INT4 format (should be hex string)
    if (!/^[0-9a-f]*$/.test(entry.latent_int4)) {
      errors.push(`Invalid INT4 format: ${entry.latent_int4}`);
    }
  }

  // Check all indices are present
  if (indices.size !== BASE_RUNES.length) {
    errors.push(`Missing tile indices: expected ${BASE_RUNES.length}, got ${indices.size}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export rune bank to JSON
 */
export function exportRuneBankToJSON(bank: RuneBank[]): string {
  return JSON.stringify(bank, null, 2);
}

/**
 * Import rune bank from JSON
 */
export function importRuneBankFromJSON(json: string): RuneBank[] {
  const bank = JSON.parse(json) as RuneBank[];

  // Rebuild in-memory maps
  runeBank.clear();
  runeBySymbol.clear();

  for (const entry of bank) {
    runeBank.set(entry.tensor_uuid, entry);
    runeBySymbol.set(entry.rune, entry);
  }

  return bank;
}

/**
 * Get base runes list
 */
export function getBaseRunes(): string[] {
  return [...BASE_RUNES];
}

/**
 * Get rune count
 */
export function getRuneCount(): number {
  return BASE_RUNES.length;
}
