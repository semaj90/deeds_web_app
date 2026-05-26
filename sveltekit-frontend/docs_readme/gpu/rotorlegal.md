# RotorLegal: Gemma 4 VLM + Legal LoRA Workflow

This guide clarifies the split between **Cloud (Google Colab)** and **Local (Windows PC)** when merging legal fine-tunes with the Gemma 4 Vision-Language Model.

---

## The VLM Architecture Split
Gemma 4 VLM consists of two separate files in the `llama.cpp` stack:
1.  **Language Model (GGUF):** The 4.3B text transformer. **This is where the LoRA is merged.**
2.  **Vision Projector (MMPROJ):** The SigLIP-based vision tower. This is usually **static** and does not change during legal text fine-tuning.

---

## Checklist: Where to do what?

### 🟦 Phase A: Google Colab (Training & Merging)
**Goal:** Produce a single high-precision F16 model that contains the base weights + your legal knowledge.

- [ ] **Fine-tune:** Run the training loop (Unsloth/PEFT) in Colab.
- [ ] **Merge LoRA:** Use the script to merge the LoRA adapter back into the base model.
      - *Result:* A folder of Safetensors (e.g., `merged-legal-vlm-f16/`).
- [ ] **Export to GGUF (Text only):** Run the `convert_hf_to_gguf.py` script.
      - **Crucial:** You only need to export the *language model* part here.
      - *Result:* `gemma4-rotorquant:latest-f16.gguf` (~8.5GB).
- [ ] **Download to PC:** Move the `.gguf` file to your local machine.

---

### 🟩 Phase B: Local Machine (Quantization & Inference)
**Goal:** Transform the heavy F16 model into a lean, 4-bit RotorQuant monster.

- [ ] **Prepare Tools:** Ensure `llama-quantize.exe` is available (usually in your `llama-server-cuda` folder).
- [ ] **Quantize to RotorQuant:** Run the local conversion script:
      ```powershell
      .\scripts\turboquant\quantize-legal.ps1 -SourcePath "C:\Downloads\gemma4-rotorquant:latest-f16.gguf" -OutputPath "C:\models\gemma4-rotorquant:latest-iq4xs.gguf"
      ```
- [ ] **Verify MMPROJ:** Ensure you have the vision tower sidecar (e.g., `mmproj-BF16.gguf`). You don't need to re-quantize this.
- [ ] **Configure `.env`:**
      ```env
      ROTORQUANT_MODEL_PATH=C:\models\gemma4-rotorquant:latest-iq4xs.gguf
      TURBO_MMPROJ_PATH=C:\models\mmproj-BF16.gguf
      ```
- [ ] **Launch:**
      ```powershell
      npm run turbo:start:rotorquant
      ```
      *(Note: Leave off the `-TextOnly` flag if you want to use the Vision features in the UI).*

---

## Decision Matrix: When to return to Colab?

| Scenario | Location | Action |
|---|---|---|
| "I want to change the legal terminology weights" | **Colab** | Re-run training / adjust LoRA rank |
| "The model is too slow on my GPU" | **Local** | Re-run `quantize-legal.ps1` with `IQ3_S` or `IQ2_M` |
| "Vision/OCR is failing" | **Local** | Check `TURBO_MMPROJ_PATH` points to a valid projector |
| "Legal reasoning is 'hallucinating' compared to F16" | **Local** | Generate an `imatrix` (Importance Matrix) before quantizing |

---

## Advanced: Importance Matrix (Local)
For maximum legal precision, generate an `imatrix` locally before the final quantization step:
```powershell
# 1. Generate imatrix from legal corpus (takes ~20 mins)
.\llama-imatrix.exe -m gemma4-rotorquant:latest-f16.gguf -f legal-corpus.txt -o legal.imatrix

# 2. Quantize using the matrix
.\llama-quantize.exe --imatrix legal.imatrix gemma4-rotorquant:latest-f16.gguf gemma4-rotorquant:latest-iq4xs.gguf IQ4_XS
```
