#!/usr/bin/env node
/**
 * Phase 28.2: ONNX to TensorRT-LLM Conversion Pipeline
 *
 * Automates conversion of LegalBERT and EmbeddingGemma models to TensorRT engines
 * for deployment on Triton Inference Server
 *
 * Architecture:
 * 1. Detect .safetensors/.bin models in models/ directory
 * 2. Convert to ONNX format
 * 3. Optimize with TensorRT (create .plan files)
 * 4. Generate Triton config.pbtxt files
 * 5. Launch Triton container
 * 6. Verify gRPC health endpoints
 * 7. Optional: Generate Python FastAPI QUIC bridge
 *
 * Models:
 * - LegalBERT: nlpaueb/legal-bert-base-uncased (768-dim encoder)
 * - EmbeddingGemma: embeddinggemma:latest (384-dim embeddings)
 *
 * Output:
 * models/
 *  ├─ legalbert_trt/
 *  │   ├─ 1/model.plan
 *  │   └─ config.pbtxt
 *  └─ embeddinggemma_trt/
 *      ├─ 1/model.plan
 *      └─ config.pbtxt
 */

import { $, fs, chalk, path, cd } from 'zx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
	workspace: path.resolve(__dirname, '..'),
	modelsDir: path.resolve(__dirname, '../models'),
	tritonModelsDir: path.resolve(__dirname, '../triton-models'),
	onnxDir: path.resolve(__dirname, '../onnx-exports'),
	pythonMiddleware: path.resolve(__dirname, '../python-synthesizer'),
	tritonPort: 8001,
	tritonHttpPort: 8000,
	tritonMetricsPort: 8002,
	containerName: 'legal-ai-triton',
	models: {
		legalbert: {
			name: 'legalbert_trt',
			huggingFaceId: 'nlpaueb/legal-bert-base-uncased',
			type: 'encoder',
			dimOutput: 768,
			maxSeqLen: 512,
		},
		embeddinggemma: {
			name: 'embeddinggemma_trt',
			ollamaModel: 'embeddinggemma:latest',
			type: 'embedding',
			dimOutput: 384,
			maxSeqLen: 2048,
		},
	},
};

// Color logger
const log = {
	info: (msg) => console.log(chalk.blue('ℹ'), msg),
	success: (msg) => console.log(chalk.green('✓'), msg),
	warn: (msg) => console.log(chalk.yellow('⚠'), msg),
	error: (msg) => console.log(chalk.red('✗'), msg),
	step: (num, msg) => console.log(chalk.cyan(`\n[Step ${num}]`), chalk.bold(msg)),
};

/**
 * Step 1: Check prerequisites
 */
async function checkPrerequisites() {
	log.step(1, 'Checking prerequisites...');

	const checks = [
		{ cmd: 'python3 --version', name: 'Python 3' },
		{ cmd: 'docker --version', name: 'Docker' },
		{ cmd: 'nvidia-smi', name: 'NVIDIA GPU' },
	];

	for (const check of checks) {
		try {
			await $`${check.cmd}`;
			log.success(`${check.name} is available`);
		} catch (error) {
			log.error(`${check.name} is not available`);
			throw new Error(`Missing prerequisite: ${check.name}`);
		}
	}

	// Check Python packages
	try {
		await $`python3 -c "import transformers, torch, onnx"`;
		log.success('Required Python packages are installed');
	} catch (error) {
		log.warn('Missing Python packages. Installing...');
		await $`pip install transformers torch onnx onnxruntime tritonclient[all]`;
	}
}

/**
 * Step 2: Export LegalBERT to ONNX
 */
async function exportLegalBERTToONNX() {
	log.step(2, 'Exporting LegalBERT to ONNX...');

	const { legalbert } = CONFIG.models;
	const onnxPath = path.join(CONFIG.onnxDir, legalbert.name);

	// Create directories
	await fs.ensureDir(onnxPath);

	// Create export script
	const exportScript = `
import torch
from transformers import AutoTokenizer, AutoModel
import os

model_name = "${legalbert.huggingFaceId}"
output_dir = "${onnxPath}"

print(f"Loading {model_name}...")
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)
model.eval()

# Dummy input
dummy_input = tokenizer("Sample legal text", return_tensors="pt", padding=True, truncation=True, max_length=${legalbert.maxSeqLen})

# Export to ONNX
torch.onnx.export(
    model,
    (dummy_input['input_ids'], dummy_input['attention_mask']),
    os.path.join(output_dir, "model.onnx"),
    input_names=['input_ids', 'attention_mask'],
    output_names=['last_hidden_state', 'pooler_output'],
    dynamic_axes={
        'input_ids': {0: 'batch_size', 1: 'sequence'},
        'attention_mask': {0: 'batch_size', 1: 'sequence'},
        'last_hidden_state': {0: 'batch_size', 1: 'sequence'},
        'pooler_output': {0: 'batch_size'}
    },
    opset_version=14
)

print(f"✓ ONNX model exported to {output_dir}/model.onnx")
`;

	const scriptPath = path.join(CONFIG.onnxDir, 'export_legalbert.py');
	await fs.writeFile(scriptPath, exportScript);
	await $`python3 ${scriptPath}`;

	log.success('LegalBERT exported to ONNX');
	return path.join(onnxPath, 'model.onnx');
}

/**
 * Step 3: Convert ONNX to TensorRT engine
 */
async function convertToTensorRT(onnxPath, modelConfig) {
	log.step(3, `Converting ${modelConfig.name} to TensorRT...`);

	const engineDir = path.join(CONFIG.tritonModelsDir, modelConfig.name, '1');
	await fs.ensureDir(engineDir);

	const enginePath = path.join(engineDir, 'model.plan');

	// Use trtexec to build TensorRT engine
	await $`trtexec \
		--onnx=${onnxPath} \
		--saveEngine=${enginePath} \
		--fp16 \
		--workspace=4096 \
		--minShapes=input_ids:1x1,attention_mask:1x1 \
		--optShapes=input_ids:8x${modelConfig.maxSeqLen},attention_mask:8x${modelConfig.maxSeqLen} \
		--maxShapes=input_ids:32x${modelConfig.maxSeqLen},attention_mask:32x${modelConfig.maxSeqLen} \
		--verbose`;

	log.success(`TensorRT engine created: ${enginePath}`);
	return enginePath;
}

/**
 * Step 4: Generate Triton config.pbtxt
 */
async function generateTritonConfig(modelConfig) {
	log.step(4, `Generating Triton config for ${modelConfig.name}...`);

	const configPath = path.join(CONFIG.tritonModelsDir, modelConfig.name, 'config.pbtxt');

	const config = `
name: "${modelConfig.name}"
platform: "tensorrt_plan"
max_batch_size: 32
input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  },
  {
    name: "attention_mask"
    data_type: TYPE_INT32
    dims: [ -1 ]
  }
]
output [
  {
    name: "last_hidden_state"
    data_type: TYPE_FP16
    dims: [ -1, ${modelConfig.dimOutput} ]
  },
  {
    name: "pooler_output"
    data_type: TYPE_FP16
    dims: [ ${modelConfig.dimOutput} ]
  }
]
instance_group [
  {
    count: 1
    kind: KIND_GPU
  }
]
dynamic_batching {
  preferred_batch_size: [ 4, 8, 16 ]
  max_queue_delay_microseconds: 100
}
`.trim();

	await fs.writeFile(configPath, config);
	log.success(`Config written: ${configPath}`);
}

/**
 * Step 5: Launch Triton Inference Server
 */
async function launchTritonServer() {
	log.step(5, 'Launching Triton Inference Server...');

	// Stop existing container
	try {
		await $`docker stop ${CONFIG.containerName}`;
		await $`docker rm ${CONFIG.containerName}`;
	} catch (error) {
		// Container doesn't exist, continue
	}

	// Launch Triton
	await $`docker run -d \
		--name ${CONFIG.containerName} \
		--gpus all \
		--shm-size=1g \
		--ulimit memlock=-1 \
		--ulimit stack=67108864 \
		-p ${CONFIG.tritonPort}:8001 \
		-p ${CONFIG.tritonHttpPort}:8000 \
		-p ${CONFIG.tritonMetricsPort}:8002 \
		-v ${CONFIG.tritonModelsDir}:/models \
		nvcr.io/nvidia/tritonserver:23.10-py3 \
		tritonserver --model-repository=/models --log-verbose=1`;

	log.success('Triton server launched');

	// Wait for server to be ready
	log.info('Waiting for Triton to be ready...');
	await new Promise((resolve) => setTimeout(resolve, 10000));
}

/**
 * Step 6: Verify health endpoints
 */
async function verifyTritonHealth() {
	log.step(6, 'Verifying Triton health endpoints...');

	const healthChecks = [
		{ url: `http://localhost:${CONFIG.tritonHttpPort}/v2/health/ready`, name: 'Ready' },
		{ url: `http://localhost:${CONFIG.tritonHttpPort}/v2/health/live`, name: 'Live' },
		{
			url: `http://localhost:${CONFIG.tritonHttpPort}/v2/models/legalbert_trt/ready`,
			name: 'LegalBERT Model',
		},
	];

	for (const check of healthChecks) {
		try {
			const response =
				await $`curl -f -s ${check.url}`.catch((e) => ({ stdout: 'error' }));
			if (response.stdout.includes('error')) {
				log.warn(`${check.name} check failed`);
			} else {
				log.success(`${check.name} is healthy`);
			}
		} catch (error) {
			log.warn(`${check.name} check failed: ${error.message}`);
		}
	}
}

/**
 * Step 7: Generate Python FastAPI QUIC bridge (optional)
 */
async function generatePythonSynthesizer() {
	log.step(7, 'Generating Python FastAPI QUIC synthesizer...');

	const synthesizerDir = CONFIG.pythonMiddleware;
	await fs.ensureDir(synthesizerDir);

	const mainPy = `
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import tritonclient.grpc as grpcclient
import numpy as np
from typing import List, Optional
import logging

app = FastAPI(title="Legal AI Synthesizer")
logger = logging.getLogger(__name__)

# Triton client
triton = grpcclient.InferenceServerClient("localhost:8001")

class ContextualRequest(BaseModel):
    message: str
    context: Optional[str] = None
    max_length: int = 500

class ContextualResponse(BaseModel):
    answer: str
    embeddings: List[float]
    languages: List[str]
    processing_time: float

@app.post("/api/contextual", response_model=ContextualResponse)
async def contextual_chat(payload: ContextualRequest):
    """
    Contextual chat endpoint that:
    1. Sends to LegalBERT (TensorRT engine)
    2. Sends to EmbeddingGemma (TensorRT engine)
    3. Runs LangChain retrieval
    4. Synthesizes prompt for Gemma3-Legal
    """
    try:
        # TODO: Implement full pipeline
        # 1. Tokenize input
        # 2. Call Triton for LegalBERT inference
        # 3. Call Triton for EmbeddingGemma
        # 4. Vector search in pgvector/Qdrant
        # 5. Generate final response with Ollama gemma3-legal

        return ContextualResponse(
            answer="Implementation in progress",
            embeddings=[0.0] * 384,
            languages=["English"],
            processing_time=0.0
        )
    except Exception as e:
        logger.error(f"Error in contextual chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Triton connection
        if triton.is_server_ready():
            return {"status": "healthy", "triton": "connected"}
        else:
            return {"status": "degraded", "triton": "not ready"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")
`.trim();

	await fs.writeFile(path.join(synthesizerDir, 'main.py'), mainPy);

	// Generate requirements.txt
	const requirements = `
fastapi==0.104.1
uvicorn[standard]==0.24.0
tritonclient[all]==2.40.0
numpy==1.24.3
pydantic==2.5.0
langchain==0.1.0
`.trim();

	await fs.writeFile(path.join(synthesizerDir, 'requirements.txt'), requirements);

	log.success('Python synthesizer generated');
	log.info(`Install dependencies: cd ${synthesizerDir} && pip install -r requirements.txt`);
	log.info(`Run server: python3 ${path.join(synthesizerDir, 'main.py')}`);
}

/**
 * Main execution
 */
async function main() {
	console.log(chalk.bold.cyan('\n🚀 Phase 28.2: ONNX to TensorRT-LLM Pipeline\n'));

	try {
		await checkPrerequisites();

		// Export and convert LegalBERT
		const legalBertONNX = await exportLegalBERTToONNX();
		await convertToTensorRT(legalBertONNX, CONFIG.models.legalbert);
		await generateTritonConfig(CONFIG.models.legalbert);

		// TODO: Add EmbeddingGemma export (requires Ollama model extraction)
		log.warn(
			'EmbeddingGemma conversion requires manual Ollama model extraction - see documentation'
		);

		// Launch Triton
		await launchTritonServer();
		await verifyTritonHealth();

		// Generate Python synthesizer
		await generatePythonSynthesizer();

		console.log(chalk.bold.green('\n✅ Phase 28.2 Complete!\n'));
		console.log(chalk.cyan('Next steps:'));
		console.log('1. Verify Triton models: curl http://localhost:8000/v2/models');
		console.log('2. Install Python synthesizer: cd python-synthesizer && pip install -r requirements.txt');
		console.log('3. Run synthesizer: python3 python-synthesizer/main.py');
		console.log('4. Test endpoint: curl http://localhost:8003/health\n');
	} catch (error) {
		log.error(`Pipeline failed: ${error.message}`);
		console.error(error);
		process.exit(1);
	}
}

main();
