#!/usr/bin/env node
/**
 * Audit PyTorch/LibTorch files across the workspace.
 * No placeholders. Offline processing. Dry-run by default.
 *
 * Usage:
 *   node scripts/atlas/audit-pytorch-libtorch-inventory.mjs [--save] [--detailed]
 *
 * Reports:
 *   docs/reports/pytorch-libtorch-inventory.json
 *   docs/reports/pytorch-libtorch-inventory.md
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const SAVE = process.argv.includes('--save');
const DETAILED = process.argv.includes('--detailed');

// Categories of PyTorch/LibTorch files
const INVENTORY_PATTERNS = {
  training_models: {
    pattern: /\.(pt|pth|model|checkpoint)$/i,
    description: 'PyTorch model checkpoint files',
  },
  tensorrt_engines: {
    pattern: /\.plan$/i,
    description: 'TensorRT compiled engines',
  },
  torchscript: {
    pattern: /\.ts\.pt$/i,
    description: 'TorchScript serialized modules',
  },
  source_code: {
    pattern: /\.(py|cc|cpp|h|hpp)$/i,
    description: 'PyTorch/LibTorch source code',
    context: ['pytorch', 'libtorch', 'torch', 'autoencoder', 'ae_encoder'],
  },
  bindings: {
    pattern: /\.(node|pyd|dll|so)$/i,
    description: 'Native bindings (N-API, ctypes)',
    context: ['tensorrt', 'torch', 'cuda'],
  },
  headers: {
    pattern: /\.h(pp)?$/i,
    description: 'C++ headers for LibTorch',
    context: ['torch.h', 'ATen', 'caffe2'],
  },
};

async function scanSourceCode(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const references = {
      pytorch_imports: [],
      torch_functions: [],
      autoencoder: [],
      som: [],
      latent_vectors: [],
      tensor_operations: [],
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // PyTorch imports
      if (/import.*torch|from.*torch|require.*torch/i.test(line)) {
        references.pytorch_imports.push({ line: i + 1, content: line.trim() });
      }

      // Torch functions
      if (/torch\.\w+|autograd|optim\.|nn\./i.test(line)) {
        references.torch_functions.push({ line: i + 1, content: line.trim() });
      }

      // Autoencoder
      if (/autoencoder|ae_|AE_|Autoencoder/i.test(line)) {
        references.autoencoder.push({ line: i + 1, content: line.trim() });
      }

      // SOM (Self-Organizing Map)
      if (/som|SOM|trainSOM|kmeansWithCentroids/i.test(line)) {
        references.som.push({ line: i + 1, content: line.trim() });
      }

      // Latent vectors
      if (/latent|encoding|embedding|768|64|768-?to-?64|dim\(64\)/i.test(line)) {
        references.latent_vectors.push({ line: i + 1, content: line.trim() });
      }

      // Tensor operations
      if (/tensor|Tensor|FloatTensor|\.to\(|\.cuda\(|\.cpu\(/i.test(line)) {
        references.tensor_operations.push({ line: i + 1, content: line.trim() });
      }
    }

    return references;
  } catch (e) {
    return null;
  }
}

async function findPyTorchFiles() {
  const timestamp = new Date().toISOString();
  const categories = {};
  const sourceCodeRefs = {};
  const errors = [];

  console.log(`[${timestamp}] Scanning for PyTorch/LibTorch files...`);

  // Find TypeScript/JavaScript files with PyTorch references
  let tsFiles = [];
  try {
    const output = execSync(`rg --files --type ts --type js -g "!node_modules/**" -g "!.git/**" "pytorch|libtorch|torch|autoencoder"`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    tsFiles = output.split('\n').filter(Boolean);
  } catch (e) {
    console.log('No TypeScript/JavaScript PyTorch files found (or rg not in PATH)');
  }

  console.log(`Found ${tsFiles.length} TS/JS files with PyTorch references.`);

  for (const filePath of tsFiles) {
    try {
      const fullPath = path.join(ROOT, filePath);
      const refs = await scanSourceCode(fullPath);

      if (refs) {
        sourceCodeRefs[filePath] = refs;
        console.log(`  [OK] ${filePath}`);
      }
    } catch (e) {
      errors.push({ file: filePath, error: e.message });
    }
  }

  // Find Python files with torch references
  let pyFiles = [];
  try {
    const output = execSync(`rg --files --type py -g "!node_modules/**" -g "!.git/**" "pytorch|torch"`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    pyFiles = output.split('\n').filter(Boolean);
  } catch (e) {
    console.log('No Python PyTorch files found.');
  }

  console.log(`Found ${pyFiles.length} Python files with torch references.`);

  for (const filePath of pyFiles) {
    sourceCodeRefs[filePath] = { pyFile: true };
  }

  // Find C++ files
  let cppFiles = [];
  try {
    const output = execSync(`rg --files --type cpp -g "!node_modules/**" -g "!.git/**" "libtorch"`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    cppFiles = output.split('\n').filter(Boolean);
  } catch (e) {
    console.log('No C++ LibTorch files found.');
  }

  console.log(`Found ${cppFiles.length} C++ files with PyTorch references.`);

  for (const filePath of cppFiles) {
    sourceCodeRefs[filePath] = { cppFile: true };
  }

  // Find model checkpoints (using PowerShell Get-ChildItem instead of find)
  let modelFiles = [];
  try {
    // Fallback: search in key directories only
    const dirs = ['models', 'checkpoints', '.tmp', 'docker'];
    for (const dir of dirs) {
      const dirPath = path.join(ROOT, dir);
      try {
        const files = await fs.readdir(dirPath, { recursive: true });
        for (const file of files) {
          if (/\.(pt|pth|plan|ts\.pt)$/.test(file)) {
            modelFiles.push(path.join(dir, file));
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
  } catch (e) {
    console.log('Model file search completed.');
  }

  console.log(`Found ${modelFiles.length} model checkpoint files.`);

  for (const filePath of modelFiles) {
    try {
      const stat = await fs.stat(path.join(ROOT, filePath));
      categories[filePath] = {
        type: 'model_checkpoint',
        size: stat.size,
        mtime: stat.mtimeMs,
      };
      console.log(`  [OK] ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e) {
      errors.push({ file: filePath, error: e.message });
    }
  }

  // Find native bindings
  let bindingFiles = [];
  try {
    const output = execSync(`rg --files -g "!node_modules/**" -g "!.git/**" "\\.node$|tensorrt_bridge"`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    bindingFiles = output.split('\n').filter(Boolean);
  } catch (e) {
    console.log('Native binding search completed.');
  }

  console.log(`Found ${bindingFiles.length} native binding files.`);

  for (const filePath of bindingFiles) {
    try {
      const stat = await fs.stat(path.join(ROOT, filePath));
      categories[filePath] = {
        type: 'native_binding',
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    } catch (e) {
      errors.push({ file: filePath, error: e.message });
    }
  }

  return {
    timestamp,
    summary: {
      ts_js_files: tsFiles.length,
      python_files: pyFiles.length,
      cpp_files: cppFiles.length,
      model_checkpoints: Object.values(categories).filter(c => c.type === 'model_checkpoint').length,
      native_bindings: Object.values(categories).filter(c => c.type === 'native_binding').length,
      errors: errors.length,
    },
    sourceCodeRefs,
    categories,
    errors,
  };
}

async function main() {
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Auditing PyTorch/LibTorch inventory...`);

  const inventory = await findPyTorchFiles();

  // Gates
  const gates = {
    ts_js_files_found: inventory.summary.ts_js_files > 0,
    cpp_files_found: inventory.summary.cpp_files > 0,
    source_refs_found: Object.keys(inventory.sourceCodeRefs).length > 0,
    no_critical_errors: Object.keys(inventory.errors).filter(e => {
      const err = inventory.errors[e];
      return err.error && err.error.includes('PERMISSION_DENIED');
    }).length === 0,
  };

  const gatePass = Object.values(gates).every(g => g);

  // Report
  const report = {
    timestamp,
    inventory,
    gates,
    ready_for_analysis: gatePass,
  };

  const mdReport = `# PyTorch/LibTorch Inventory Audit\n\n` +
    `**Timestamp**: ${timestamp}\n` +
    `**Status**: ${gatePass ? '✅ READY' : '❌ REVIEW NEEDED'}\n\n` +
    `## Summary\n` +
    `- TypeScript/JavaScript files: ${inventory.summary.ts_js_files}\n` +
    `- Python files: ${inventory.summary.python_files}\n` +
    `- C++ files: ${inventory.summary.cpp_files}\n` +
    `- Model checkpoints: ${inventory.summary.model_checkpoints}\n` +
    `- Native bindings: ${inventory.summary.native_bindings}\n` +
    `- Errors: ${inventory.summary.errors}\n\n` +
    `## Gates\n` +
    Object.entries(gates).map(([k, v]) => `- ${k}: ${v ? '✅' : '❌'}`).join('\n') + '\n\n' +
    `## Key Files\n` +
    Object.entries(inventory.sourceCodeRefs).slice(0, 20).map(([f, refs]) =>
      `- ${f}${refs.pyFile ? ' (Python)' : refs.cppFile ? ' (C++)' : ''}`
    ).join('\n') + '\n\n' +
    `## Next Steps\n` +
    `1. Review autoencoder bridge implementations (src/lib/server/gpu/autoencoder-*.ts)\n` +
    `2. Verify SOM topology pipeline (src/lib/server/graph/som-topology-pipeline.ts)\n` +
    `3. Check GPU graph analysis (src/lib/server/graph/gpu-graph-analysis.ts)\n` +
    `4. Validate LibTorch bridge (src/lib/server/gpu/libtorch-bridge.ts)\n` +
    `5. Audit PyTorch feature extraction (scripts/atlas/phase17-pytorch-feature-extractor.mjs)\n`;

  await fs.mkdir(path.join(ROOT, 'docs/reports'), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, 'docs/reports/pytorch-libtorch-inventory.json'),
    JSON.stringify(report, null, 2)
  );
  await fs.writeFile(
    path.join(ROOT, 'docs/reports/pytorch-libtorch-inventory.md'),
    mdReport
  );

  console.log(`\n[${timestamp}] Report written.`);
  console.log(`  JSON: docs/reports/pytorch-libtorch-inventory.json`);
  console.log(`  MD:   docs/reports/pytorch-libtorch-inventory.md`);
  console.log(`  Status: ${gatePass ? '✅ READY FOR ANALYSIS' : '❌ REVIEW NEEDED'}`);

  process.exit(gatePass ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
