#!/usr/bin/env node
/**
 * Materialize the local Gemma4 E2B q4f16 ONNX files into a Triton model
 * repository layout.
 *
 * This does not convert GGUF and does not create a TensorRT-LLM engine. It
 * exposes the ONNX graphs that Triton can load via the ONNX Runtime backend:
 * token embeddings and decoder. Autoregressive text generation still needs an
 * adapter above Triton to tokenize, loop, sample, and detokenize.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const DEFAULT_SOURCE = path.join(FRONTEND, 'static', 'gemma4_e2b_onnx', 'onnx');
const DEFAULT_OUT = path.join(ROOT, 'triton-model-repository');

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback) => {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const sourceDir = path.resolve(getArg('--source', DEFAULT_SOURCE));
const outDir = path.resolve(getArg('--out', DEFAULT_OUT));
const copyMode = args.has('--copy');
const apply = args.has('--apply');

const files = [
  {
    model: 'gemma4_e2b_q4f16_embed_tokens',
    modelFile: 'embed_tokens_q4f16.onnx',
    dataFiles: ['embed_tokens_q4f16.onnx_data'],
  },
  {
    model: 'gemma4_e2b_q4f16_decoder',
    modelFile: 'decoder_model_merged_q4f16.onnx',
    dataFiles: ['decoder_model_merged_q4f16.onnx_data'],
  },
];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function statSize(file) {
  const stat = await fs.stat(file);
  return stat.size;
}

async function removeIfExists(file) {
  try {
    await fs.rm(file, { force: true });
  } catch {
    // ignore
  }
}

async function materializeFile(src, dest) {
  await removeIfExists(dest);
  if (copyMode) {
    await fs.copyFile(src, dest);
    return 'copy';
  }
  try {
    await fs.link(src, dest);
    return 'hardlink';
  } catch (error) {
    await fs.copyFile(src, dest);
    return `copy_after_hardlink_failed:${error.code || error.message}`;
  }
}

function tritonReadme() {
  return `# Gemma4 E2B q4f16 ONNX Triton Repository

Status: EXPERIMENTAL ADAPTER TARGET

This repository is generated from:

\`${path.relative(ROOT, sourceDir).replace(/\\/g, '/')}\`

It contains ONNX Runtime backend model directories for:

- \`gemma4_e2b_q4f16_embed_tokens\`
- \`gemma4_e2b_q4f16_decoder\`

Important boundaries:

- This is not a TensorRT-LLM engine.
- This is not converted from GGUF.
- Triton can load these ONNX graphs, but chat/summarization still needs an adapter to tokenize, run the autoregressive loop, sample tokens, and detokenize.
- The current production summary backend remains llama-server/TurboQuant at \`127.0.0.1:8090\`.

Suggested smoke command:

\`\`\`powershell
docker run --rm --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 \`
  -v "${outDir.replace(/\\/g, '/')}:/models" \`
  nvcr.io/nvidia/tritonserver:latest \`
  tritonserver --model-repository=/models --strict-model-config=false
\`\`\`

Triton health:

\`\`\`powershell
curl http://127.0.0.1:8000/v2/health/ready
curl http://127.0.0.1:8000/v2/models
\`\`\`
`;
}

async function main() {
  const report = {
    status: 'DRY_RUN',
    sourceDir,
    outDir,
    apply,
    copyMode,
    models: [],
    warnings: [
      'ONNX Triton materialization is an inference-graph scaffold only; generation requires an adapter.',
      'Do not replace llama-server Phase7 summary backend until the adapter has a live PASS proof.',
    ],
  };

  for (const spec of files) {
    const versionDir = path.join(outDir, spec.model, '1');
    const modelReport = {
      model: spec.model,
      versionDir,
      files: [],
      ready: true,
    };

    const allFiles = [spec.modelFile, ...spec.dataFiles];
    for (const file of allFiles) {
      const src = path.join(sourceDir, file);
      const dest = path.join(versionDir, file);
      const fileReport = {
        source: src,
        dest,
        exists: await exists(src),
      };
      if (!fileReport.exists) {
        modelReport.ready = false;
      } else {
        fileReport.bytes = await statSize(src);
        if (apply) {
          await fs.mkdir(versionDir, { recursive: true });
          fileReport.mode = await materializeFile(src, dest);
        }
      }
      modelReport.files.push(fileReport);
    }

    if (apply) {
      const aliasDest = path.join(versionDir, 'model.onnx');
      const modelSrc = path.join(sourceDir, spec.modelFile);
      await fs.mkdir(versionDir, { recursive: true });
      modelReport.modelAlias = {
        dest: aliasDest,
        mode: await materializeFile(modelSrc, aliasDest),
        note: 'Triton default ONNX filename alias; original ONNX filename is also retained for external-data compatibility.',
      };
    }

    report.models.push(modelReport);
  }

  if (apply) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'README.md'), tritonReadme(), 'utf8');
    report.status = report.models.every((model) => model.ready) ? 'PASS' : 'FAIL';
  } else {
    report.status = report.models.every((model) => model.ready) ? 'DRY_RUN_READY' : 'DRY_RUN_MISSING_FILES';
  }

  const reportDir = path.join(ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'gemma4-onnx-triton-repo-proof.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${path.relative(ROOT, reportPath).replace(/\\/g, '/')}`);

  if (!report.status.includes('PASS') && !report.status.includes('READY')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
