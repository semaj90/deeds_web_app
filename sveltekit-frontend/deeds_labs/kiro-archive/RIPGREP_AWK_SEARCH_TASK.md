# Ripgrep + AWK Search Task

## Purpose
Search codebase for safetensors config issues related to vision model misidentification.

## Tasks to Execute Later

### 1. Find Vision Model Config References
```bash
rg -n "vision" --type py --type json --type yaml
rg -n "image_size|patch_size|vision_encoder" --type py --type json
```

### 2. Find Safetensors Loading Code
```bash
rg -n "safetensors|from_pretrained|load_model" --type py
rg -n "config\.json|model_type" --type py --type json
```

### 3. Find Gemma Config Issues
```bash
rg -n "gemma.*vision|vision.*gemma" -i
rg -n "model_type.*gemma|gemma.*model_type" --type json
```

### 4. AWK Processing for Config Analysis
```bash
# Extract model_type from all config.json files
rg -l "config\.json" | xargs -I {} awk -F'"' '/model_type/ {print FILENAME": "$4}' {}

# Find vision-related keys in configs
rg --json "vision|image|patch" --type json | awk -F'"' '{print $4}'
```

### 5. Vision Encoder Backend Tasks (Phase 73 Extension)
- [ ] Add Granite Docling 258M for OCR/document parsing
- [ ] Add YOLO for signature/seal detection
- [ ] Add LayoutLMv3 for form layout understanding
- [ ] Export vision models to TensorRT .plan format
- [ ] Implement embedding fusion: `fused = concat([text_vec, vision_vec, graph_vec])`
- [ ] Update scoring: `final_score = 0.40*text + 0.20*visual + 0.40*legal_authority`

### 6. Config Fix Pattern
```python
# Correct config for text-only Gemma
{
    "model_type": "gemma2",  # NOT "gemma_vision"
    "architectures": ["Gemma2ForCausalLM"],
    "hidden_size": 3584,
    "num_attention_heads": 16,
    "num_hidden_layers": 46,
    # NO vision_config section for text-only model
}
```

## Notes
- Errors occurred because config had vision model settings for text-only Gemma
- Vision encoder should be separate TensorRT model, not part of Gemma config
- Use embedding fusion at inference time, not model architecture level
