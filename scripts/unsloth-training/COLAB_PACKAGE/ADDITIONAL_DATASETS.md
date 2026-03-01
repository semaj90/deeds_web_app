# Additional Training Datasets for Gemma 3 12B Legal AI

**Curated HuggingFace datasets** to enhance your multimodal legal AI training

---

## 📸 Vision & Multimodal (Image Analysis)

### 1. **M3IT - Multimodal Instruction Tuning**
**Dataset**: `MMInstruction/M3IT`
- **Size**: 400K+ instruction-following samples
- **Tasks**: Image captioning, VQA, visual reasoning, classification
- **Format**: Instruction → Image → Answer
- **Use**: Improve vision understanding for evidence photos

```python
# Add to Cell 7 in notebook
m3it = load_dataset("MMInstruction/M3IT", split="train[:20000]")
m3it = m3it.rename_column('instruction', 'text')
```

**Benefits**:
- ✅ Analyze scanned documents with images
- ✅ Extract details from crime scene photos
- ✅ Understand diagrams in legal evidence

**Source**: [M3IT on HuggingFace](https://huggingface.co/datasets/MMInstruction/M3IT)

---

### 2. **LLaVA-Instruct-150K**
**Dataset**: `liuhaotian/LLaVA-Instruct-150K`
- **Size**: 158K unique language-image instruction samples
- **Based on**: COCO dataset (everyday scenes)
- **Format**: Conversational QA about images
- **Use**: Multi-turn visual reasoning

```python
llava = load_dataset("liuhaotian/LLaVA-Instruct-150K", split="train[:10000]")
```

**Benefits**:
- ✅ Multi-turn conversations about evidence images
- ✅ Dense visual scene understanding
- ✅ Object detection + reasoning combined

**Source**: [LLaVA](https://llava-vl.github.io/)

---

### 3. **COCO Captions**
**Dataset**: `HuggingFaceM4/COCO`
- **Size**: 330K images with 5 captions each
- **Tasks**: Image captioning, object detection
- **Use**: Train on describing visual evidence

```python
coco = load_dataset("HuggingFaceM4/COCO", split="train[:15000]")
```

**Benefits**:
- ✅ Generate captions for uploaded evidence images
- ✅ Automatic photo documentation
- ✅ Accessibility for visually impaired users

**Sources**:
- [COCO Dataset](https://huggingface.co/papers/2401.08968)
- [Top Multimodal Datasets](https://blog.roboflow.com/top-multimodal-datasets/)

---

## 🔧 Function Calling & Tool Use (Agentic)

### 4. **Hermes Function-Calling v1**
**Dataset**: `NousResearch/hermes-function-calling-v1`
- **Size**: Structured output with API calls
- **Format**: User intent → Function selection → Parameters
- **Use**: Train ACE context engine tool calling

```python
hermes = load_dataset("NousResearch/hermes-function-calling-v1", split="train[:5000]")
```

**Example format**:
```json
{
  "user": "Search for evidence related to 'witness testimony'",
  "function": "qdrant_search",
  "parameters": {
    "query": "witness testimony",
    "collection": "evidence_items",
    "limit": 10
  }
}
```

**Benefits**:
- ✅ Agentic tool selection (Qdrant, Postgres, Redis)
- ✅ Structured parameter extraction
- ✅ Multi-step reasoning chains

**Source**: [Hermes Function-Calling](https://huggingface.co/datasets/NousResearch/hermes-function-calling-v1)

---

### 5. **Salesforce xLAM Function-Calling 60K**
**Dataset**: `Salesforce/xlam-function-calling-60k`
- **Size**: 60K verified API call examples
- **Verification**: 3-stage (format → execution → semantic)
- **Use**: Production-grade function calling

```python
xlam = load_dataset("Salesforce/xlam-function-calling-60k", split="train[:10000]")
```

**Features**:
- ✅ Real API execution traces
- ✅ Error handling examples
- ✅ Multi-function orchestration

**Source**: [xLAM Dataset](https://huggingface.co/datasets/Salesforce/xlam-function-calling-60k)

---

### 6. **Hypervariance Function-Calling ShareGPT**
**Dataset**: `hypervariance/function-calling-sharegpt`
- **Size**: 86,864 chat examples with 0-2 functions
- **Format**: Conversational with tool use
- **Use**: Natural language → tool invocation

```python
sharegpt_tools = load_dataset("hypervariance/function-calling-sharegpt", split="train[:8000]")
```

**Benefits**:
- ✅ Conversational tool calling
- ✅ Context-aware function selection
- ✅ ShareGPT format (multi-turn)

**Sources**:
- [Function Calling ShareGPT](https://huggingface.co/datasets/hypervariance/function-calling-sharegpt)
- [Unified Tool Use](https://huggingface.co/blog/unified-tool-use)
- [HuggingFace Function Calling Guide](https://huggingface.co/docs/hugs/en/guides/function-calling)

---

## 💻 Code & Programming (PyTorch, SvelteKit, TypeScript)

### 7. **CodeAlpaca-20K**
**Dataset**: `HuggingFaceH4/CodeAlpaca_20K`
- **Size**: 20K code instruction pairs
- **Languages**: Python, JavaScript, TypeScript, etc.
- **Use**: Improve code generation for legal automation scripts

```python
code_alpaca = load_dataset("HuggingFaceH4/CodeAlpaca_20K", split="train")
```

**Benefits**:
- ✅ Generate TypeScript utilities
- ✅ Write Svelte 5 components
- ✅ Create database migration scripts

**Source**: [CodeAlpaca](https://huggingface.co/datasets/HuggingFaceH4/CodeAlpaca_20K)

---

### 8. **Code Instructions 122K**
**Dataset**: `TokenBender/code_instructions_122k_alpaca_style`
- **Size**: 122K programming tasks
- **Format**: Alpaca-style instructions
- **Use**: Large-scale code understanding

```python
code_122k = load_dataset("TokenBender/code_instructions_122k_alpaca_style", split="train[:15000]")
```

**Source**: [Code Instructions 122K](https://huggingface.co/datasets/TokenBender/code_instructions_122k_alpaca_style)

---

### 9. **Python Code Instructions 18K**
**Dataset**: `iamtarun/python_code_instructions_18k_alpaca`
- **Size**: 18K Python-specific problems
- **Focus**: Problem description → Python solution
- **Use**: PyTorch, data processing scripts

```python
python_code = load_dataset("iamtarun/python_code_instructions_18k_alpaca", split="train")
```

**Benefits**:
- ✅ PyTorch training scripts
- ✅ Data preprocessing pipelines
- ✅ API endpoint logic

**Source**: [Python Code Instructions](https://huggingface.co/datasets/iamtarun/python_code_instructions_18k_alpaca)

---

## 🧠 GRPO / Reinforcement Learning (Advanced)

### 10. **Math Reasoning for GRPO**
**Approach**: Use math datasets with verifiable rewards

**Datasets**:
- `openai/gsm8k` (already in notebook) ✅
- `hendrycks/math` (advanced math problems)
- `deepmind/math_dataset`

**GRPO Training Pattern**:
```python
# After standard fine-tuning, apply GRPO for reasoning
# GRPO uses group sampling with verifiable rewards

# Example: Math problem with multiple solutions
problem = "A witness testified at 2:15 PM. The crime occurred 47 minutes earlier. What time was the crime?"

# Generate 8 solutions
solutions = model.generate(problem, num_return_sequences=8)

# Verify each solution (reward = 1 if correct, 0 if wrong)
rewards = [verify_answer(sol) for sol in solutions]

# GRPO update: Compare each solution to group average
baseline = sum(rewards) / len(rewards)
advantages = [r - baseline for r in rewards]

# Update policy based on advantages (no critic needed)
```

**Note**: GRPO requires custom training loop after initial fine-tuning. Not part of Unsloth notebook (post-processing step).

**Sources**:
- [GRPO Overview](https://cameronrwolfe.substack.com/p/grpo)
- [DeepSeekMath with GRPO](https://arxiv.org/abs/2402.03300)
- [Constrained GRPO](https://arxiv.org/html/2602.05863v2)

---

## 📚 Documentation & Reasoning

### 11. **PyTorch Documentation** (Custom Extraction)

**Create your own**:
```bash
# Scrape PyTorch docs (respect robots.txt)
python scripts/dataset-collection/scrape-pytorch-docs.py

# Output: pytorch-docs.jsonl (~50K examples)
# Format: {"text": "torch.nn.Linear documentation..."}
```

**Alternative**: Use existing code Q&A datasets
- `bigcode/the-stack` (code with comments)
- `codeparrot/github-code` (real-world code)

---

### 12. **Legal Reasoning**
**Already included** in your notebook:
- ✅ Pile of Law (20K)
- ✅ LexGLUE (LEDGAR, Case Hold, SCOTUS)
- ✅ MultiLexSum

**Additional**:
- `casehold/casehold` (full dataset, 53K)
- `coastalcph/fairlex` (European legal docs)

---

## 🎯 Recommended Combinations

### **Minimal Addition** (5 datasets, +115K examples)
1. M3IT (20K) - Vision
2. Hermes Function-Calling (5K) - Tools
3. CodeAlpaca (20K) - Code
4. LLaVA-Instruct (10K) - Multimodal reasoning
5. Your codebase (697) ✅

**Total**: ~60K (HF) + 115K (new) + 697 (yours) = **~176K examples**

---

### **Full Stack** (12 datasets, +250K examples)
All datasets above:
1. M3IT (20K)
2. LLaVA-Instruct (10K)
3. COCO (15K)
4. Hermes Function-Calling (5K)
5. xLAM Function-Calling (10K)
6. ShareGPT Tools (8K)
7. CodeAlpaca (20K)
8. Code Instructions 122K (15K)
9. Python Code (18K)
10. GSM8K (already in) ✅
11. Pile of Law (already in) ✅
12. Your codebase (697) ✅

**Total**: ~60K + 250K + 697 = **~311K examples**

**Training time**: 5-7 hours on A100 (vs 3.5-5 hours baseline)

---

## 📝 How to Add to Notebook

### Option 1: Add to Cell 7 (Auto-Download Section)

```python
# After SCOTUS dataset, add:

# 8. M3IT (Multimodal)
print("[8/N] M3IT Multimodal...")
m3it = load_dataset("MMInstruction/M3IT", split="train[:20000]")
m3it = m3it.rename_column('instruction', 'text')
print(f"  ✓ {len(m3it):,}")

# 9. Hermes Function-Calling
print("[9/N] Hermes Function-Calling...")
hermes = load_dataset("NousResearch/hermes-function-calling-v1", split="train[:5000]")
hermes = hermes.rename_column('prompt', 'text')  # Adjust field name
print(f"  ✓ {len(hermes):,}")

# 10. CodeAlpaca
print("[10/N] CodeAlpaca...")
code_alpaca = load_dataset("HuggingFaceH4/CodeAlpaca_20K", split="train")
code_alpaca = code_alpaca.rename_column('instruction', 'text')
print(f"  ✓ {len(code_alpaca):,}")

# Add to concatenation list
legal_datasets.extend([m3it, hermes, code_alpaca])
```

### Option 2: Create Separate Cell (Recommended)

Add new cell **after Cell 7**, **before Cell 11**:

```python
# Cell 7.5: Additional Datasets (Vision, Tools, Code)

print("\nLoading additional datasets...\n")

additional_datasets = []

# M3IT
try:
    m3it = load_dataset("MMInstruction/M3IT", split="train[:20000]")
    m3it = m3it.rename_column('instruction', 'text')
    m3it = m3it.select_columns(['text']).map(standardize_text, num_proc=4)
    additional_datasets.append(m3it)
    print(f"✓ M3IT: {len(m3it):,}")
except Exception as e:
    print(f"⚠️  M3IT failed: {e}")

# Hermes Function-Calling
try:
    hermes = load_dataset("NousResearch/hermes-function-calling-v1", split="train[:5000]")
    # Process hermes format (may need custom logic)
    additional_datasets.append(hermes)
    print(f"✓ Hermes: {len(hermes):,}")
except Exception as e:
    print(f"⚠️  Hermes failed: {e}")

# CodeAlpaca
try:
    code = load_dataset("HuggingFaceH4/CodeAlpaca_20K", split="train")
    code = code.rename_column('instruction', 'text')
    code = code.select_columns(['text']).map(standardize_text, num_proc=4)
    additional_datasets.append(code)
    print(f"✓ CodeAlpaca: {len(code):,}")
except Exception as e:
    print(f"⚠️  CodeAlpaca failed: {e}")

# Combine with legal datasets
if additional_datasets:
    legal_dataset = concatenate_datasets([legal_dataset] + additional_datasets)
    print(f"\n✅ Total with additions: {len(legal_dataset):,}")
```

---

## ⚠️ Important Notes

### Dataset Licenses
- **M3IT**: MIT License ✅
- **LLaVA**: Apache 2.0 ✅
- **COCO**: CC BY 4.0 ✅
- **Hermes**: Apache 2.0 ✅
- **xLAM**: Apache 2.0 ✅
- **CodeAlpaca**: Apache 2.0 ✅

**All are commercial-use friendly** ✅

### Training Time Impact
- Baseline (60K): 3.5-5 hours
- +50K examples: 4-6 hours
- +100K examples: 5-7 hours
- +250K examples: 7-10 hours

### VRAM Requirements
- All datasets fit in A100 40GB with current config ✅
- INT8 quantization handles 300K+ examples

---

## 🎯 Recommended Workflow

### **Week 1: Baseline Training**
- Use existing 60K legal + 697 codebase
- Train 3.5-5 hours
- Establish performance baseline

### **Week 2: Add Vision**
- Add M3IT (20K) + LLaVA (10K)
- Train 4-6 hours
- Test image analysis on legal documents

### **Week 3: Add Tools**
- Add Hermes (5K) + xLAM (10K)
- Train 4-6 hours
- Test ACE context engine tool calling

### **Week 4: Add Code**
- Add CodeAlpaca (20K) + Python Code (18K)
- Train 5-7 hours
- Test code generation for legal automation

### **Week 5: GRPO Fine-Tuning** (Advanced)
- Post-process with GRPO on math/reasoning
- Separate training script (not Unsloth)
- Improve logical reasoning

---

## Summary

✅ **60K+ legal datasets** (already in notebook)
✅ **697 codebase patterns** (your files)
✅ **250K+ additional datasets** (vision, tools, code)
✅ **All open-source & commercial-use friendly**
✅ **Modular integration** (add incrementally)

**Total potential**: 311K training examples

**Next**: Start with baseline (60K + 697), iterate with additions based on performance needs.
