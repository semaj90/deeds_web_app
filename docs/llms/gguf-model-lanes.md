# GGUF Model Lanes & Wiring Inventory

This document details the configuration, active wiring, and disk inventory of the GGUF large language models (LLMs) and vision language models (VLMs) used in the **Deeds Web App**.

---

## 🗺️ Architectural Mapping & Active Wiring

The Deeds Web App utilizes a local, high-performance CUDA inference pipeline via `llama-server.exe` to drive legal reasoning and document analysis. The model configuration is loaded via environment variables defined in the root `.env` file:

```ini
# Active Model Variables (.env)
TURBO_MODEL_PATH=C:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf
TURBO_MMPROJ_PATH=C:\Users\james\Videos\deeds-web-app\vendor\models\mmproj-gemma4.gguf
LLAMA_SERVER_PATH=C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
TURBO_PROFILE=stock
TURBO_CTX=16384
TURBO_NGL=99
```

### 🧱 Component Breakdown
1. **Model Core (`gemma4-legal.gguf`)**: A **Gemma4 E4B (4.4B)** base model merged with a specialized **GRPO (Group Relative Policy Optimization)** fine-tuned legal LoRA. Quantized in **Q4_K_M** (5.33 GB) format on disk.
2. **Vision Tower (`mmproj-gemma4.gguf`)**: A multimodal projector file (991 MB) based on **SigLIP** enabling image inputs and OCR capabilities when the VLM projector tower is active.
3. **Execution Context (`llama-server-cuda`)**: Runs with complete GPU offloading (`--n-gpu-layers 99`) and a 16k tokens context window (`--ctx-size 16384`).

---

## 🗄️ Model Inventory on Disk

### 1. Active App Vendor Directory (`vendor/models/`)
* Located at: `C:\Users\james\Videos\deeds-web-app\vendor\models\`

| File / Subfolder | Size | Created | Status / Purpose |
| :--- | :--- | :--- | :--- |
| `gemma4-legal.gguf` | 5.0 GB | Apr 5, 2026 | **ACTIVE**. The primary merged GRPO legal text-reasoning model. |
| `mmproj-gemma4.gguf` | 946 MB | Apr 11, 2026 | **ACTIVE**. Multimodal visual projector (SigLIP). |
| `lora/gemma4-legal-grpo/` | 169 MB | May 16, 2026 | **Archived**. Contains the raw `.safetensors` GRPO LoRA weights (incompatible with direct `llama-server --lora` execution, pre-baked into the main GGUF). |
| `lora/gemma4-legal-text/` | 143 MB | May 16, 2026 | **Archived**. Contains raw `.safetensors` text LoRA weights. |

---

### 2. Desktop Model Inventory (`Desktop/gemma4-legal-iq4xs/`)
* Located at: `C:\Users\james\Desktop\gemma4-legal-iq4xs\`

This directory acts as the pipeline export and quantization workspace for E4B Legal models.

| File Name | Size | Quantization | Recommendation / Utility |
| :--- | :--- | :--- | :--- |
| `gemma4-legal-iq4xs.gguf` | 4.8 GB | **IQ4_XS** (iMatrix) | **KEEP / RECOMMEND UPGRADE**. Features importance matrix calibration. Saves ~200MB VRAM over Q4_K_M while matching or exceeding token quality. |
| `gemma4-legal-iq4xs-direct.gguf` | 4.8 GB | **IQ4_XS** (Direct) | **DELETE / DUPLICATE**. A redundant direct quantization pass without iMatrix calibration. |
| `gemma4-legal-merged-q4km.gguf` | 5.0 GB | **Q4_K_M** | **DELETE / DUPLICATE**. This is the exact original merged model that was copied to the app vendor folder under the name `gemma4-legal.gguf`. |
| `gemma4-legal-f16.gguf` | 68 MB | F16 | **DELETE**. A leftover testing or lightweight metadata export artifact. |
| `gemma4-legal-f16-test.gguf` | 68 MB | F16 | **DELETE**. Leftover testing artifact from the export pipeline. |

---

## 🛠️ Merge & VLM Reattachment Workflow

Based on the Jupyter notebook assets found on the desktop, the model was generated using the following end-to-end pipeline:

```mermaid
graph TD
    A["Base Gemma4 E4B (F16)"] --> B["GRPO Legal Training (LoRA)"]
    B --> C["LoRA weights (.safetensors)"]
    C --> D["Fusing / Re-merging Base with LoRA"]
    D --> E["SigLIP VLM Reattachment"]
    E --> F["Merged VLM F16 Output"]
    F --> G1["Quantize: Q4_K_M (Active in App)"]
    F --> G2["Quantize: IQ4_XS (iMatrix - Desktop Candidate)"]
```

---

## 💡 Key Action Items & Recommendations

1. **VRAM Safety Upgrade**:
   Swap the active `gemma4-legal.gguf` in `vendor/models/` from **Q4_K_M** (5.0 GB) to the newer **IQ4_XS (iMatrix)** variant `gemma4-legal-iq4xs.gguf` (4.8 GB).
   * *Benefit*: Reduces workstation VRAM foot-print by **~200 MB** which is critical for our 8GB RTX 3060 Ti limits, while improving inference perplexity via iMatrix calibration.
2. **Desktop Cleanup Allowlist**:
   * **Keep**: `gemma4-legal-iq4xs.gguf` (as our primary backup/upgrade file).
   * **Delete**: `gemma4-legal-iq4xs-direct.gguf`, `gemma4-legal-merged-q4km.gguf`, `gemma4-legal-f16.gguf`, `gemma4-legal-f16-test.gguf`.
   * *Space Recovered*: **~10.0 GB** of high-speed desktop storage.
