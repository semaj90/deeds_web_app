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
      { id: 'model', localUrl: '/gemma4_e2b_onnx/model.onnx', sourceUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX', mediaType: 'onnx' },
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
// TODO(EDGE-03): pin asset revisions and SHA256 before permitting load.
// TODO(EDGE-04): reconcile tokenizer dependencies and ONNX model graph compatibility.
