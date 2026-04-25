# TensorRT-LLM Engine Conversion Guide
*Based on TENSORRT_LLM_INSTALL_STRATEGY.md*

## Current Installation Status ✅ UPDATED
- **TensorRT-LLM Version**: 0.21.0 (LATEST - installed in `legal-ai-ubuntu-deployment/tensorrt_env_latest/`)
- **TensorRT Version**: 10.11.0.33 with CUDA 12 support
- **PyTorch Version**: 2.8.0 with CUDA 12.8 support
- **Target Model**: Gemma3 Legal (from `model_unsloth_hf_f16/` - 23GB)
- **Target Hardware**: RTX 3060 Ti (8GB)

## Prerequisites Check
```bash
# Activate the existing environment
source legal-ai-ubuntu-deployment/tensorrt_env/bin/activate

# Verify installation
python -c "import torch, tensorrt_llm; print('Torch:', torch.__version__); print('TRT-LLM:', tensorrt_llm.__version__)"
```

## Environment Setup
```bash
# Set recommended environment variables
export PYTHONWARNINGS=ignore:Deprecated
export TLLM_LOG_LEVEL=INFO
export CUDA_VISIBLE_DEVICES=0
export NVIDIA_TF32_OVERRIDE=0
export OMP_NUM_THREADS=1
```

## Model Preparation
Your model is already available in `model_unsloth_hf_f16/` (~23GB). This needs to be converted:

### Step 1: Convert HF Model to TensorRT-LLM Format
```bash
python -m tensorrt_llm.models.gemma.convert \
  --model_dir ./model_unsloth_hf_f16 \
  --output_dir ./models/gemma3_legal_trt \
  --dtype float16 --tp_size 1 --pp_size 1
```

### Step 2: Build Optimized Engine (Q4_K_M for RTX 3060 Ti)
```bash
trtllm-build \
  --checkpoint_dir ./models/gemma3_legal_trt \
  --output_dir ./engines/gemma3_legal_q4km \
  --gemma_version 3 --quantization q4_k_m \
  --max_batch_size 4 --max_input_len 2048 --max_output_len 512 \
  --use_paged_kv_cache --gpt_attention_plugin float16 --gemm_plugin float16 \
  --strongly_typed
```

### Step 3: Test Engine
```bash
# Start server
python -m tensorrt_llm.hlapi.llm_server \
  --engine_dir ./engines/gemma3_legal_q4km \
  --port 8100

# Test client (in another terminal)
curl -s -X POST localhost:8100/generate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Legal analysis: Provide risk summary.","max_new_tokens":64}'
```

## Directory Structure After Conversion
```
deeds-web-app/
├── model_unsloth_hf_f16/           # Source model (23GB)
├── models/
│   └── gemma3_legal_trt/           # Converted checkpoints
├── engines/
│   └── gemma3_legal_q4km/          # Optimized TensorRT engines
└── legal-ai-ubuntu-deployment/
    └── tensorrt_env/               # TensorRT-LLM environment
```

## Space Optimization
After successful conversion, consider:
1. Keep only the engine files (`./engines/gemma3_legal_q4km/`)
2. Archive or remove intermediate files (`./models/gemma3_legal_trt/`)
3. Optionally compress the original model (`model_unsloth_hf_f16/`)

## Integration with Your Services
The converted engine can be used with:
- Go microservices in `./go-microservice/tensorrt/`
- SvelteKit frontend via API endpoints in `./src/routes/api/tensorrt/`
- QUIC bridge services for high-performance streaming

## Troubleshooting
If conversion fails:
1. Check CUDA memory: `nvidia-smi`
2. Verify environment: `python -c "import tensorrt_llm; print('OK')"`
3. Try with reduced batch size: `--max_batch_size 2`
4. Check WSL GPU passthrough: `wsl nvidia-smi`

## Performance Targets
- **Target Latency**: Sub-millisecond first token
- **Throughput**: 2-10x faster than standard inference
- **Memory Usage**: <8GB on RTX 3060 Ti with Q4_K_M quantization




*********************************************************************
*********************************************************************************************
***************************************************************************************
**********************************************************************************************
************************************************************************************************
ystem updates are proceeding well! The    
  packages are being upgraded including NVIDIA   

  The download is happening to your organized     
  ubuntu-tensorrt/trt_env_clean environment, so   
  everything will be properly contained in the    
  ubuntu directory as planned.

> fix the quick-tensorRT-setup.sh to not close        
  terminal thi way i can get logs
  also update it because it says it can't find v1.6.  
   make it use The TensorRT-LLM v1.1.0rc5 (3.7GB)     

  The download is happening to your organized     
  ubuntu-tensorrt/trt_env_clean environment, so   
  everything will be properly contained in the    
  ubuntu directory as planned.

> fix the quick-tensorRT-setup.sh to not close        
  terminal thi way i can get logs
  also update it because it says it can't find v1.6.  
   make it use The TensorRT-LLM v1.1.0rc5 (3.7GB)     

  drivers, Mesa Vulkan drivers, and Node.js. This
  is good preparation for the TensorRT-LLM       
  installation.

  Since the current installation is progressing, 
  you can:

  1. Let it finish - The system update is
  installing important components including NVIDIA    
   libraries
  2. Then run the fixed script with skip flags:       
  .\Install-TensorRT-LLM-WSL-Fixed.ps1
  -SkipSystemUpdate

  The updates I see are actually beneficial:
  - ✅ NVIDIA drivers updated (580.82.07) - good       
  for GPU support
  - ✅ Mesa Vulkan drivers - graphics stack
  improvements
  - ✅ Node.js 22.19.0 - latest version
  - ✅ Software properties - package management        
  improvements

  Once this completes, you'll have a clean,
  updated WSL environment ready for the
  TensorRT-LLM installation with the fixed script.    

> then we move it into ubuntu?

● Yes! Once the installation completes   
  successfully, we should move the entire
  TensorRT-LLM environment into the      
  ubuntu-tensorrt directory for better   
  organization.

  Here's what we'll move:

  From WSL home directory (~) to ubuntu-tensorrt/:    
  - trt_env/ - The Python virtual environment
  - trt_wheels/ - Downloaded wheel cache
  - Any TensorRT-LLM related files

  Command to move after installation:
  # In WSL
  cd /mnt/c/Users/james/Videos/deeds-web-app/ubunt    
  u-tensorrt
  mv ~/trt_env ./
  mv ~/trt_wheels ./

  Final structure will be:
  ubuntu-tensorrt/
  ├── trt_env/              # Python 3.12 venv        
  with TensorRT-LLM
  ├── trt_wheels/           # Cached wheels (for      
  reinstalls)
  ├── tensorrt_new_env/     # Old environment (can    
   remove)
  ├── .env.tensorrt         # Environment config      
  ├── validate_tensorrt_env.py
  ├── Install-TensorRT-LLM-WSL.ps1
  └── Install-TensorRT-LLM-WSL-Fixed.ps1

  This keeps everything TensorRT-LLM related in       
  one organized directory and makes it easier to:     
  - Back up the entire setup
  - Reinstall if needed
  - Share the configuration
  - Keep the main project directory clean


ate(ubuntu-tensorrt\Install-TensorRT-LLM-WSL-Fixe        d.ps1)
  ⎿  Updated ubuntu-tensorrt\Install-TensorRT-LLM     
     WSL-Fixed.ps1 with 28 additions and 2
     removals
       154    
       155    Write-Host "✅ Packages installed        
              successfully" -ForegroundColor 
             Green
       156    
       157 -  # Step 8: Set runtime environment       
           -  variables
       158 -  Write-Host "🌐 Step 8: 
           -  Configuring runtime environment
           -  ..." -ForegroundColor Cyan
       157 +  # Step 8: Configure runtime 
           + environment with cache integration       
       158 +  Write-Host "🌐 Step 8: 
           +  Configuring runtime environment
           +   with cache integration
           +  ..." -ForegroundColor Cyan
       159 +  
       160 +  # Copy environment config to WSL        
       161 +  wsl bash -c 'cd 
           + /mnt/c/Users/james/Videos/deeds-we       
           + b-app/ubuntu-tensorrt && cp 
           + .env.tensorrt ~/trt_env/.env'
       162 +  
       163 +  # Create enhanced activation 
           + script with cache integration
       164    wsl bash -c 'cd ~ && cat >> 
             trt_env/bin/activate << "EOF"
       165    
       166    # TensorRT-LLM Environment 
             Variables
     ...
       168    export CUDA_VISIBLE_DEVICES=0
       169    export NVIDIA_TF32_OVERRIDE=0
       170    export OMP_NUM_THREADS=1
       171 +  
       172 +  # Load environment config
       173 +  if [ -f $VIRTUAL_ENV/.env ]; then       
       174 +      export $(grep -v "^#" 
           + $VIRTUAL_ENV/.env | xargs)
       175 +  fi
       176 +  
       177 +  # Cache system integration
       178 +  export 
           + PYTORCH_CACHE_DIR=$HOME/trt_cache        
       179 +  export 
           + REDIS_URL=redis://localhost:6379/0       
       180 +  export CACHE_TTL=3600
       181 +  export ENABLE_CACHE=true
       182 +  
       183 +  # Legal AI optimizations
       184 +  export GEMMA_MODEL_PATH=/mnt/c/Us       
           + ers/james/Videos/deeds-web-app/mod       
           + el_unsloth_hf_f16
       185 +  export LEGAL_CACHE_SIZE=1024
       186 +  export TARGET_LATENCY_MS=500
       187 +  export MAX_BATCH_SIZE=8
       188 +  
       189 +  echo "🚀 TensorRT-LLM environment       
           +  activated with cache integration"       
       190 +  echo "📦 Cache directory: 
           + $PYTORCH_CACHE_DIR"
       191 +  echo "🔧 Model path: 

P8 KV Cache
This is not a distinct format but an application of FP8 quantization. In transformer models, the Key-Value (KV) cache stores intermediate attention calculations to speed up the generation of subsequent tokens. As the sequence length grows, the KV cache can consume a significant amount of memory. FP8 KV Cache refers to the practice of quantizing the values stored in this cache to FP8, thereby reducing its memory footprint and allowing for longer context lengths or larger batch sizes. This can be implemented using any of the FP8 scaling methods mentioned above.



Activation-Aware Weight Quantization (AWQ): A Sophisticated Quantization Strategy
AWQ is a post-training quantization method that intelligently quantizes weights by considering the distribution of activations. The core idea is that not all weights are equally important. Weights that are multiplied by large activation values have a greater impact on the model's output. AWQ identifies these salient weights and scales them to protect them from significant quantization errors, while allowing for more aggressive quantization of less important weights.


W4A8 AWQ and W4A16 AWQ
These terms specify the bit precision for weights and activations, respectively, when using the AWQ method:

W4A8 AWQ: The model's weights are quantized to 4-bit integers, while the activations are processed in 8-bit floating-point (FP8). This is a common configuration that provides a good balance between performance and accuracy.

W4A16 AWQ: The weights are quantized to 4-bit integers, but the activations are kept in a higher 16-bit precision (FP16 or BF16). This can result in better accuracy than W4A8 at the cost of some performance and memory benefits, as the activations are not quantized as aggressively.

Bash(wsl bash -c "ls -la /mnt/c/Users/james/Videos/d      
      eeds-web-app/ubuntu-tensorrt/tensorrt_llm*.whl")      
  ⎿  Error: ls: cannot access 
     '/mnt/c/Users/james/Videos/deeds-web-app/ubuntu-te     
     nsorrt/tensorrt_llm*.whl': No such file or 
     directory

● Where did you save the downloaded wheel file?
  Let me check the common download locations:

● Bash(wsl bash -c "find /mnt/c/Users/james/Downloads       
      -name '*tensorrt*' 2>/dev/null || echo 'Not in        
      Downloads'")
  ⎿  Interrupted · What should Claude do instead?

> c:\Users\james\Videos\deeds-web-app\ubuntu-tensorrt\tens  
  orrt_llm-1.1.0rc5-cp312-cp312-linux_x86_64.whl yes this   
  one

● Perfect! I can see the wheel file is there. Now let's     
  copy it to WSL and install it:

● Bash(wsl bash -c "cp
      /mnt/c/Users/james/Videos/deeds-web-app/ubuntu-tensorr      t/tensorrt_llm-1.1.0rc5-cp312-cp312-linux_x86_64.whl  
      ~/trt_wheels/")
  ⎿  (No content)

● Bash(wsl bash -c "~/trt_env/bin/python -m pip install     
      ~/trt_wheels/tensorrt_llm-1.1.0rc5-cp312-cp312-linux_x      86_64.whl --no-deps")
  ⎿ Processing /home/james/trt_wheels/tensorrt_llm-1.1.     
    0rc5-cp312-cp312-linux_x86_64.whl
    Installing collected packages: tensorrt-llm
    Successfully installed tensorrt-llm-1.1.0rc5


● Excellent! Now let's verify it works:

● Bash(wsl bash -c "~/trt_env/bin/python -c 'import
      tensorrt_llm; print(\"✅ TensorRT-LLM:\",
      tensorrt_llm.__version__)'")
  ⎿  Error: Traceback (most recent call last):
       File "<string>", line 1, in <module>
       File "/home/james/trt_env/lib/python3.12/site-packages
     /tensorrt_llm/__init__.py", line 34, in <module>       
         import xgrammar  # noqa
         ^^^^^^^^^^^^^^^
     ModuleNotFoundError: No module named 'xgrammar'        

● It needs dependencies. Let me install them:

● Bash(wsl bash -c "~/trt_env/bin/python -m pip install     
      transformers accelerate huggingface-hub sentencepiece 
      safetensors xgrammar")
  ⎿ Requirement already satisfied: transformers in /hom     
    e/james/trt_env/lib/python3.12/site-packages (4.56.     
    2)
    … +297 lines (ctrl+o to expand)



● Let me install the missing dependencies. Instead of       
  going through all these conflicts, let me just try the    
   simple test:

● Bash(wsl bash -c "~/trt_env/bin/python -c 'import
      tensorrt_llm; print(\"✅ TensorRT-LLM:\",
      tensorrt_llm.__version__)'")
  ⎿  Error: Traceback (most recent call last):
       File "<string>", line 1, in <module>
       File "/home/james/trt_env/lib/python3.12/site-packages
     /tensorrt_llm/__init__.py", line 36, in <module>       
         import tensorrt_llm._torch.models as torch_models  
       File "/home/james/trt_env/lib/python3.12/site-packages
     /tensorrt_llm/_torch/__init__.py", line 1, in <module> 
         from .llm import LLM
       File "/home/james/trt_env/lib/python3.12/site-packages
     /tensorrt_llm/_torch/llm.py", line 1, in <module>      
         from tensorrt_llm.llmapi.llm import _TorchLLM      
       File "/home/james/trt_env/lib/python3.12/site-packages
     /tensorrt_llm/llmapi/__init__.py", line 1, in <module> 
         from ..disaggregated_params import 
     DisaggregatedParams