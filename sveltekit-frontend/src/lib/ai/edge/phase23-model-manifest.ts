/** Phase 23 experimental manifests. URLs are provenance, never automatic downloads. */
export interface EdgeAsset {
  id: string;
  localUrl: string;
  sourceUrl: string;
  expectedSha256?: string;
  mediaType: 'onnx' | 'litertlm' | 'tokenizer';
}

export interface EdgeManifest {
  id: string;
  runtime: 'onnx-web' | 'litert-lm-web';
  revision: string;
  assets: readonly EdgeAsset[];
}

export const EDGE_EXPERIMENTAL_MANIFESTS: readonly EdgeManifest[] = [
  {
    id: 'gemma4-e2b-onnx-experiment',
    runtime: 'onnx-web',
    revision: 'UNPINNED',
    assets: [
      { id: 'model', localUrl: '/gemma4_e2b_onnx/onnx/decoder_model_merged_q4f16.onnx', sourceUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX', mediaType: 'onnx' },
      { id: 'tokenizer', localUrl: '/gemma4_e2b_onnx/tokenizer.json', sourceUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX', mediaType: 'tokenizer' },
    ],
  },
  {
    id: 'gemma4-e2b-litert-web-experiment',
    runtime: 'litert-lm-web',
    revision: 'UNPINNED',
    assets: [
      { id: 'model', localUrl: '/models/gemma4-e2b/model.litertlm', sourceUrl: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm', mediaType: 'litertlm' },
    ],
  },
];

export const PHASE23_BROWSER_MODEL_MANIFEST = {
  activePrimary: {
    id: 'gemma4-e2b-onnx-q4f16',
    engine: 'onnx-webgpu' as const,
    decoderUrl: '/gemma4_e2b_onnx/onnx/decoder_model_merged_q4f16.onnx',
    externalData: [
      'decoder_model_merged_q4f16.onnx_data',
      'embed_tokens_q4f16.onnx_data'
    ],
    sizeMb: 2940,
    mtpSupported: false,
    onDiskVerified: true
  },
  optionalProbes: [
    {
      id: 'gemma4-e2b-litert-mtp',
      engine: 'litert-webgpu' as const,
      artifactUrl: '/models/gemma-4-E2B-it.litertlm',
      probeClassification: 'FILTERED_OPTIONAL_PROBE' as const,
      mtpSupported: true, // Single-Position MTP speculative decoding (2.2x speedup)
      sizeMb: 1510
    },
    {
      id: 'gemma4-e2b-onnx-q4-legacy-probe',
      engine: 'onnx-webgpu' as const,
      artifactUrl: '/gemma4_e2b_onnx/decoder_model_merged_q4.onnx_data',
      probeClassification: 'FILTERED_OPTIONAL_PROBE' as const,
      mtpSupported: false
    }
  ]
} as const;

// TODO(EDGE-03): pin asset revisions and SHA256 before permitting load.
// TODO(EDGE-04): reconcile tokenizer dependencies and ONNX model graph compatibility.
