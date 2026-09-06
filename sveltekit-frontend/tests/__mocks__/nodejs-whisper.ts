// nodejs-whisper is an optional native package (bundled whisper.cpp binary +
// model download) not installed in this dev/test environment. It's only used
// by src/routes/api/whisper/transcribe/+server.ts's Tier 2 in-process
// fallback path (WHISPER_USE_SERVER=false), which test files exercise via
// the fetch-based whisper-server path instead. Vite's import-analysis still
// needs this bare specifier to resolve at transform time even when the
// fallback branch never executes at runtime, so this stub exists purely to
// satisfy that resolution — matching the existing @huggingface/transformers
// and onnxruntime-web precedent in this same directory.
export const nodewhisper = async () => '';
