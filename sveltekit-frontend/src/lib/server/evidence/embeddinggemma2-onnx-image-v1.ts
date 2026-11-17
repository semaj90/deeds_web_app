import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as onnxRuntimeNode from 'onnxruntime-node';
import sharp from 'sharp';
import { resizeForVLM } from '$lib/server/image/resize-for-vlm.js';
import {
	digestSemantic768OutputV1,
	validateSemantic768OutputV1,
} from '$lib/server/atlas/embedding/embedding-runtime-v1.js';

export const EMBEDDINGGEMMA2_ONNX_MODEL_ID_V1 = 'onnx-community/embeddinggemma-2-ONNX' as const;
export const EMBEDDINGGEMMA2_ONNX_REVISION_V1 = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0' as const;
export const EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1 = 'q8' as const;
export const EMBEDDINGGEMMA2_ONNX_PREPROCESSING_REVISION_V1 = 'atlas.embeddinggemma2.image-sharp-vlm-2048-gemma4-processor-q8.v1' as const;
export const EMBEDDINGGEMMA2_ONNX_AUDIO_PREPROCESSING_REVISION_V1 = 'atlas.embeddinggemma2.audio-pcm-f32le-16khz-mono-gemma4-processor-q8.v1' as const;
export const EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1 = 16_000 as const;
export const EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1 = 480_000 as const;
export const EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1 = {
	'chat_template.jinja': '4b852efc0b9960283e735363331e6f325b33bc74bdbaa076f595bc4e9b94d85e',
	'config.json': '8d011bfe08b5e345bbe0b81e5c6fd02c381920b345b986047bc2a33ce7b90d1d',
	'config_sentence_transformers.json': '031e56a498d33c349ab489a21885bcfe25b4fcba841149dc99e1e90d4a7c28f5',
	'preprocessor_config.json': '9344893f8d0573a46ebb2ca54c03f56d044cea194c8dcfb1f4d652240ac21daa',
	'processor_config.json': '168f6a08522f3ce5dea596d94d003af2fd691742d4f41fe1f9d8cce76bfbf69c',
	'tokenizer.json': '4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4',
	'tokenizer_config.json': '17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874',
	'onnx/model_quantized.onnx': 'd06edd601f851c633a2519304cbeb8dc6170d7ceb61b436625c17fb9b6e74953',
	'onnx/model_quantized.onnx_data': '278a7ff1248c3618e4bd11a607fc54f7bdc7778854230f3956d3f86bd9db4f3b',
	'onnx/vision_encoder_quantized.onnx': 'bb0de2df53a2448a32dc7908a187c168c8afd514d4d6f674f7f46024875fa4e3',
	'onnx/vision_encoder_quantized.onnx_data': '3dabd69c0a36e9a8771ad82030dde74daa5a0e02b7047a5d3f3382b1137bab89',
	'onnx/audio_encoder_quantized.onnx': '04a9a9094ba76fb169e4c69be45a4b621580188654d6be59eab860eadcd42d3c',
	'onnx/audio_encoder_quantized.onnx_data': 'aa6361d898e1f1d6303f8dd2b5fabf4fd3629e15fd709e9cb06ac5cb9416a030',
} as const;

const MODEL_ARTIFACT_SHA256 = createHash('sha256')
	.update(`${EMBEDDINGGEMMA2_ONNX_MODEL_ID_V1}@${EMBEDDINGGEMMA2_ONNX_REVISION_V1}\n`)
	.update(Object.entries(EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1).map(([name, sha]) => `${name} ${sha}\n`).join(''))
	.digest('hex');

export const EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1 = `sha256:${MODEL_ARTIFACT_SHA256}` as const;

/** Text recipes from the model's config_sentence_transformers.json ("document" and "query" prompts). */
export const EMBEDDINGGEMMA2_ONNX_TEXT_RECIPES_V1 = {
	document: { prefix: 'title: none | text: ', revision: 'atlas.embeddinggemma2.text-document-title-none-q8.v1' },
	query: { prefix: 'task: search result | query: ', revision: 'atlas.embeddinggemma2.text-search-query-q8.v1' },
} as const;
export type EmbeddingGemma2TextKindV1 = keyof typeof EMBEDDINGGEMMA2_ONNX_TEXT_RECIPES_V1;
export const EMBEDDINGGEMMA2_ONNX_TEXT_MAX_TOKENS_V1 = 2048 as const;
const TEXT_MAX_CHARS = 32_000;

type OrtTensor = { data: Float32Array | BigInt64Array | Uint8Array; dims: number[] };
type OrtSession = {
	run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};
type OrtModule = {
	InferenceSession: { create(path: string, options: Record<string, unknown>): Promise<OrtSession> };
	Tensor: new (type: string, data: Float32Array | BigInt64Array | Uint8Array, dims: number[]) => unknown;
};
type Runtime = {
	processor: (text: string, image?: unknown, audio?: Float32Array) => Promise<Record<string, OrtTensor>>;
	tokenize: (text: string) => Promise<Record<string, OrtTensor>>;
	imageFactory: (pixels: Uint8Array, width: number, height: number, channels: number) => unknown;
	ort: OrtModule;
	textSession: OrtSession;
	visionSession: OrtSession;
	audioSession: OrtSession;
};

export type EmbeddingGemma2ImageVectorV1 = {
	embedding: number[];
	model: string;
	modelArtifactSha256: string;
	modelRevision: string;
	preprocessingRevision: string;
	inputSha256: string;
	outputSha256: string;
	width: number;
	height: number;
};

export type EmbeddingGemma2AudioVectorV1 = {
	embedding: number[];
	model: string;
	modelArtifactSha256: string;
	modelRevision: string;
	preprocessingRevision: string;
	inputSha256: string;
	outputSha256: string;
	sampleRate: number;
	durationMs: number;
};

export type Pcm16MonoWavInfoV1 = {
	sampleRate: 16_000;
	sampleCount: number;
	dataOffset: number;
};

/** Read one bounded PCM window from FFmpeg's canonical mono 16 kHz PCM16 WAV output. */
export function readPcm16MonoWavWindowV1(
	wav: Uint8Array,
	startSample: number,
	maxSamples = EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1,
): { info: Pcm16MonoWavInfoV1; pcm: Float32Array } {
	if (!wav || typeof wav.byteLength !== 'number' || wav.byteLength < 44) throw new Error('EMBEDDINGGEMMA2_AUDIO_WAV_INVALID');
	const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
	const ascii = (offset: number, length: number) => String.fromCharCode(...wav.subarray(offset, offset + length));
	if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('EMBEDDINGGEMMA2_AUDIO_WAV_INVALID');
	let offset = 12;
	let format: { encoding: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
	let dataOffset = -1;
	let dataLength = 0;
	while (offset + 8 <= wav.byteLength) {
		const chunkName = ascii(offset, 4);
		const chunkLength = view.getUint32(offset + 4, true);
		const chunkStart = offset + 8;
		const chunkEnd = chunkStart + chunkLength;
		if (chunkEnd > wav.byteLength || chunkEnd < chunkStart) throw new Error('EMBEDDINGGEMMA2_AUDIO_WAV_INVALID');
		if (chunkName === 'fmt ' && chunkLength >= 16) {
			format = {
				encoding: view.getUint16(chunkStart, true),
				channels: view.getUint16(chunkStart + 2, true),
				sampleRate: view.getUint32(chunkStart + 4, true),
				bitsPerSample: view.getUint16(chunkStart + 14, true),
			};
		} else if (chunkName === 'data') {
			dataOffset = chunkStart;
			dataLength = chunkLength;
		}
		offset = chunkEnd + (chunkLength & 1);
	}
	if (!format || format.encoding !== 1 || format.channels !== 1 || format.sampleRate !== EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1 || format.bitsPerSample !== 16 || dataOffset < 0 || dataLength % 2 !== 0) {
		throw new Error('EMBEDDINGGEMMA2_AUDIO_WAV_FORMAT_UNSUPPORTED');
	}
	const sampleCount = dataLength / 2;
	if (!Number.isSafeInteger(startSample) || startSample < 0 || !Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1 || startSample >= sampleCount) {
		throw new Error('EMBEDDINGGEMMA2_AUDIO_WINDOW_INVALID');
	}
	const endSample = Math.min(sampleCount, startSample + maxSamples);
	const pcm = new Float32Array(endSample - startSample);
	for (let index = 0; index < pcm.length; index += 1) {
		pcm[index] = view.getInt16(dataOffset + (startSample + index) * 2, true) / 32768;
	}
	return { info: { sampleRate: EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1, sampleCount, dataOffset }, pcm };
}

let runtimePromise: Promise<Runtime> | null = null;
let verifiedModelDir: string | null = null;
const nodeRequire = createRequire(import.meta.url);

function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
	return hash.digest('hex');
}

async function verifyPinnedArtifacts(modelDir: string): Promise<void> {
	if (verifiedModelDir === modelDir) return;
	for (const [relativePath, expectedSha256] of Object.entries(EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1)) {
		const path = join(modelDir, relativePath);
		await access(path);
		if (await hashFile(path) !== expectedSha256) {
			throw new Error(`EMBEDDINGGEMMA2_ONNX_ARTIFACT_CHECKSUM_MISMATCH:${relativePath}`);
		}
	}
	verifiedModelDir = modelDir;
}

async function loadRuntime(modelDir: string): Promise<Runtime> {
	await verifyPinnedArtifacts(modelDir);
	const transformers = nodeRequire('@huggingface/transformers') as {
			Gemma4Processor: { from_pretrained(path: string, options: Record<string, unknown>): Promise<(text: string, image?: unknown, audio?: Float32Array) => Promise<Record<string, OrtTensor>>> };
			RawImage: new (pixels: Uint8Array, width: number, height: number, channels: number) => unknown;
			env: { allowLocalModels: boolean; allowRemoteModels: boolean };
		};
	// Use the app's direct ONNX Runtime dependency. The nested Transformers.js
	// runtime is older and cannot load the Q8 audio graph's required API version.
	const ort = onnxRuntimeNode as unknown as OrtModule;
	transformers.env.allowLocalModels = true;
	transformers.env.allowRemoteModels = false;
	const { Gemma4Processor, RawImage } = transformers;
	const processor = await Gemma4Processor.from_pretrained(modelDir, { local_files_only: true });
	const [textSession, visionSession, audioSession] = await Promise.all([
		ort.InferenceSession.create(join(modelDir, 'onnx', 'model_quantized.onnx'), { executionProviders: ['cpu'] }),
		ort.InferenceSession.create(join(modelDir, 'onnx', 'vision_encoder_quantized.onnx'), { executionProviders: ['cpu'] }),
		ort.InferenceSession.create(join(modelDir, 'onnx', 'audio_encoder_quantized.onnx'), { executionProviders: ['cpu'] }),
	]);
	const tokenizer = (processor as unknown as {
		tokenizer?: (text: string, options: Record<string, unknown>) => Promise<Record<string, OrtTensor>> | Record<string, OrtTensor>;
	}).tokenizer;
	if (typeof tokenizer !== 'function') throw new Error('EMBEDDINGGEMMA2_TOKENIZER_UNAVAILABLE');
	return {
		processor: (text, image, audio) => processor(text, image, audio) as Promise<Record<string, OrtTensor>>,
		tokenize: async (text) => tokenizer(text, { truncation: true, max_length: EMBEDDINGGEMMA2_ONNX_TEXT_MAX_TOKENS_V1 }),
		imageFactory: (pixels, width, height, channels) => new RawImage(pixels, width, height, channels),
		ort,
		textSession,
		visionSession,
		audioSession,
	};
}

async function getRuntime(modelDir: string): Promise<Runtime> {
	if (runtimePromise && verifiedModelDir !== modelDir) runtimePromise = null;
	if (!runtimePromise) runtimePromise = loadRuntime(modelDir).catch((error) => {
		runtimePromise = null;
		throw error;
	});
	return runtimePromise;
}

/**
 * Produce an EmbeddingGemma 2 image vector from an admitted source image.
 * The source bytes are only read; the Sharp/VLM derivative is in-memory and is never stored over the source.
 */
export async function embedEvidenceImageWithEmbeddingGemma2OnnxV1(input: {
	buffer: Buffer;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2ImageVectorV1> {
	if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0 || input.buffer.length > 32 * 1024 * 1024) {
		throw new Error('EMBEDDINGGEMMA2_IMAGE_INPUT_SIZE_INVALID');
	}
	const modelDir = input.modelDir?.trim();
	if (!modelDir) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	const [runtime, resized] = await Promise.all([
		getRuntime(modelDir),
		resizeForVLM(input.buffer),
	]);
	const decoded = await sharp(resized.buffer, { limitInputPixels: 16_777_216 })
		.rotate()
		.toColourspace('srgb')
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	if (decoded.info.width < 1 || decoded.info.height < 1 || decoded.info.channels !== 3 || decoded.data.length > 48 * 1024 * 1024) {
		throw new Error('EMBEDDINGGEMMA2_DECODED_IMAGE_INVALID');
	}
	const image = runtime.imageFactory(decoded.data, decoded.info.width, decoded.info.height, 3);
	const processed = await runtime.processor('<|image|>', image);
	const imagePositionIds = processed.image_position_ids ?? processed.pixel_position_ids;
	if (!processed.input_ids || !processed.attention_mask || !processed.pixel_values || !imagePositionIds) {
		throw new Error('EMBEDDINGGEMMA2_PROCESSOR_OUTPUT_INVALID');
	}
	const vision = await runtime.visionSession.run({
		pixel_values: new runtime.ort.Tensor('float32', processed.pixel_values.data as Float32Array, processed.pixel_values.dims),
		pixel_position_ids: new runtime.ort.Tensor('int64', imagePositionIds.data as BigInt64Array, imagePositionIds.dims),
	});
	const imageFeatures = vision.image_features;
	if (!imageFeatures || imageFeatures.dims.length !== 2 || imageFeatures.dims[1] !== 512) {
		throw new Error('EMBEDDINGGEMMA2_VISION_OUTPUT_INVALID');
	}
	const emptyFeatures = new runtime.ort.Tensor('float32', new Float32Array(0), [0, 512]);
	const encoded = await runtime.textSession.run({
		input_ids: new runtime.ort.Tensor('int64', processed.input_ids.data as BigInt64Array, processed.input_ids.dims),
		attention_mask: new runtime.ort.Tensor('int64', processed.attention_mask.data as BigInt64Array, processed.attention_mask.dims),
		image_features: new runtime.ort.Tensor('float32', imageFeatures.data as Float32Array, imageFeatures.dims),
		video_features: emptyFeatures,
		audio_features: emptyFeatures,
	});
	const rawVector = encoded.sentence_embedding?.data;
	if (!(rawVector instanceof Float32Array) || rawVector.length !== 768) {
		throw new Error('EMBEDDINGGEMMA2_IMAGE_EMBEDDING_DIMENSION_INVALID');
	}
	const vector = validateSemantic768OutputV1(rawVector);
	return {
		embedding: Array.from(vector),
		model: `${EMBEDDINGGEMMA2_ONNX_MODEL_ID_V1}@${EMBEDDINGGEMMA2_ONNX_REVISION_V1}:${EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1}`,
		modelArtifactSha256: EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
		modelRevision: EMBEDDINGGEMMA2_ONNX_REVISION_V1,
		preprocessingRevision: EMBEDDINGGEMMA2_ONNX_PREPROCESSING_REVISION_V1,
		inputSha256: `sha256:${sha256Hex(input.buffer)}`,
		outputSha256: digestSemantic768OutputV1(vector),
		width: decoded.info.width,
		height: decoded.info.height,
	};
}

/**
 * Produce an EmbeddingGemma 2 audio vector from bounded mono float32 PCM.
 * The model processor creates Gemma 4 log-mel features; the audio tower output
 * is then passed through the shared text encoder to obtain the normalized 768-D
 * retrieval vector. This does not transcribe speech or replace timestamped ASR.
 */
export async function embedEvidenceAudioWithEmbeddingGemma2OnnxV1(input: {
	pcm: Float32Array;
	sampleRate: number;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2AudioVectorV1> {
	if (
		!(input.pcm instanceof Float32Array)
		|| input.pcm.length === 0
		|| input.pcm.length > EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1
		|| input.sampleRate !== EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1
	) throw new Error('EMBEDDINGGEMMA2_AUDIO_INPUT_INVALID');
	for (const sample of input.pcm) {
		if (!Number.isFinite(sample) || sample < -1 || sample > 1) throw new Error('EMBEDDINGGEMMA2_AUDIO_PCM_SAMPLE_INVALID');
	}
	const modelDir = input.modelDir?.trim();
	if (!modelDir) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	const runtime = await getRuntime(modelDir);
	const processed = await runtime.processor('<|audio|>', undefined, input.pcm);
	if (
		!(processed.input_ids?.data instanceof BigInt64Array)
		|| !(processed.attention_mask?.data instanceof BigInt64Array)
		|| !(processed.input_features?.data instanceof Float32Array)
		|| !(processed.input_features_mask?.data instanceof Uint8Array)
		|| processed.input_features.dims.length !== 3
		|| processed.input_features.dims[0] !== 1
		|| processed.input_features.dims[2] !== 128
		|| processed.input_features_mask.dims.length !== 2
	) throw new Error('EMBEDDINGGEMMA2_AUDIO_PROCESSOR_OUTPUT_INVALID');

	const audioEncoded = await runtime.audioSession.run({
		input_features: new runtime.ort.Tensor('float32', processed.input_features.data, processed.input_features.dims),
		input_features_mask: new runtime.ort.Tensor('bool', processed.input_features_mask.data, processed.input_features_mask.dims),
	});
	const audioFeatures = audioEncoded.audio_features;
	if (
		!(audioFeatures?.data instanceof Float32Array)
		|| audioFeatures.dims.length !== 2
		|| audioFeatures.dims[0] < 1
		|| audioFeatures.dims[1] !== 512
	) throw new Error('EMBEDDINGGEMMA2_AUDIO_ENCODER_OUTPUT_INVALID');
	const emptyFeatures = new runtime.ort.Tensor('float32', new Float32Array(0), [0, 512]);
	const encoded = await runtime.textSession.run({
		input_ids: new runtime.ort.Tensor('int64', processed.input_ids.data, processed.input_ids.dims),
		attention_mask: new runtime.ort.Tensor('int64', processed.attention_mask.data, processed.attention_mask.dims),
		image_features: emptyFeatures,
		video_features: emptyFeatures,
		audio_features: new runtime.ort.Tensor('float32', audioFeatures.data, audioFeatures.dims),
	});
	const rawVector = encoded.sentence_embedding?.data;
	if (!(rawVector instanceof Float32Array) || rawVector.length !== 768) {
		throw new Error('EMBEDDINGGEMMA2_AUDIO_EMBEDDING_DIMENSION_INVALID');
	}
	const vector = validateSemantic768OutputV1(rawVector);
	const pcmBytes = Buffer.allocUnsafe(input.pcm.length * 4);
	for (let index = 0; index < input.pcm.length; index += 1) pcmBytes.writeFloatLE(input.pcm[index], index * 4);
	const inputSha256 = `sha256:${createHash('sha256')
		.update(`f32le-mono:${input.sampleRate}\n`, 'utf8')
		.update(pcmBytes)
		.digest('hex')}`;
	return {
		embedding: Array.from(vector),
		model: `${EMBEDDINGGEMMA2_ONNX_MODEL_ID_V1}@${EMBEDDINGGEMMA2_ONNX_REVISION_V1}:${EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1}`,
		modelArtifactSha256: EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
		modelRevision: EMBEDDINGGEMMA2_ONNX_REVISION_V1,
		preprocessingRevision: EMBEDDINGGEMMA2_ONNX_AUDIO_PREPROCESSING_REVISION_V1,
		inputSha256,
		outputSha256: digestSemantic768OutputV1(vector),
		sampleRate: input.sampleRate,
		durationMs: Math.round((input.pcm.length / input.sampleRate) * 1000),
	};
}

export type EmbeddingGemma2TextVectorV1 = {
	embedding: number[];
	model: string;
	modelArtifactSha256: string;
	modelRevision: string;
	preprocessingRevision: string;
	/** SHA-256 of the exact UTF-8 text supplied by the caller (before the recipe prefix). */
	inputSha256: string;
	outputSha256: string;
	tokenCount: number;
};

/**
 * Produce an EmbeddingGemma 2 text vector in the same 768-D space as the image vectors.
 * `document` is for stored chunks, `query` for search text; the two recipes are not interchangeable.
 * Runs on CPU in this process; the model is loaded once and reused.
 */
export async function embedEvidenceTextWithEmbeddingGemma2OnnxV1(input: {
	text: string;
	kind: EmbeddingGemma2TextKindV1;
	modelDir?: string | null;
}): Promise<EmbeddingGemma2TextVectorV1> {
	const recipe = EMBEDDINGGEMMA2_ONNX_TEXT_RECIPES_V1[input.kind];
	if (!recipe) throw new Error('EMBEDDINGGEMMA2_TEXT_KIND_INVALID');
	if (typeof input.text !== 'string' || input.text.trim().length === 0 || input.text.length > TEXT_MAX_CHARS) {
		throw new Error('EMBEDDINGGEMMA2_TEXT_INPUT_INVALID');
	}
	const modelDir = input.modelDir?.trim();
	if (!modelDir) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	const runtime = await getRuntime(modelDir);
	const tokens = await runtime.tokenize(`${recipe.prefix}${input.text}`);
	if (!(tokens.input_ids?.data instanceof BigInt64Array) || !(tokens.attention_mask?.data instanceof BigInt64Array)) {
		throw new Error('EMBEDDINGGEMMA2_TOKENIZER_OUTPUT_INVALID');
	}
	const emptyFeatures = () => new runtime.ort.Tensor('float32', new Float32Array(0), [0, 512]);
	const encoded = await runtime.textSession.run({
		input_ids: new runtime.ort.Tensor('int64', tokens.input_ids.data, tokens.input_ids.dims),
		attention_mask: new runtime.ort.Tensor('int64', tokens.attention_mask.data, tokens.attention_mask.dims),
		image_features: emptyFeatures(),
		video_features: emptyFeatures(),
		audio_features: emptyFeatures(),
	});
	const rawVector = encoded.sentence_embedding?.data;
	if (!(rawVector instanceof Float32Array) || rawVector.length !== 768) {
		throw new Error('EMBEDDINGGEMMA2_TEXT_EMBEDDING_DIMENSION_INVALID');
	}
	const vector = validateSemantic768OutputV1(rawVector);
	return {
		embedding: Array.from(vector),
		model: `${EMBEDDINGGEMMA2_ONNX_MODEL_ID_V1}@${EMBEDDINGGEMMA2_ONNX_REVISION_V1}:${EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1}`,
		modelArtifactSha256: EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
		modelRevision: EMBEDDINGGEMMA2_ONNX_REVISION_V1,
		preprocessingRevision: recipe.revision,
		inputSha256: `sha256:${createHash('sha256').update(input.text, 'utf8').digest('hex')}`,
		outputSha256: digestSemantic768OutputV1(vector),
		tokenCount: tokens.input_ids.data.length,
	};
}
