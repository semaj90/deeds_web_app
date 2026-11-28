/**
 * Exact EmbeddingGemma 2 token counter for Node (no network, no model weights).
 *
 * Uses the Hugging Face tokenizer.json already in models/embeddinggemma2/onnx-q8.
 * Counts match the Python `tokenizers` reference token for token.
 * Set EG2_TOKENIZER_DIR to override the directory.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';

const DEFAULT_DIR = resolve(process.cwd(), '..', 'models', 'embeddinggemma2', 'onnx-q8');

let cached: Tokenizer | null = null;

function load(): Tokenizer {
	if (cached) return cached;
	const dir = process.env.EG2_TOKENIZER_DIR?.trim() || DEFAULT_DIR;
	const json = JSON.parse(readFileSync(resolve(dir, 'tokenizer.json'), 'utf8'));
	const cfg = JSON.parse(readFileSync(resolve(dir, 'tokenizer_config.json'), 'utf8'));
	cached = new Tokenizer(json, cfg);
	return cached;
}

/** Exact token count, including special tokens, for the text as given. */
export function countEg2Tokens(text: string): number {
	const enc = load().encode(text, { add_special_tokens: true }) as { ids?: number[] };
	if (!enc.ids) throw new Error('EG2_TOKENIZER_NO_IDS');
	return enc.ids.length;
}

/** Canonical document recipe, as used for embedding. */
export function countEg2DocumentTokens(path: string, content: string): number {
	return countEg2Tokens(`title: ${path || 'none'} | text: ${content.trim()}`);
}
