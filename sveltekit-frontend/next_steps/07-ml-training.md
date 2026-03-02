# ML Training & Model Deployment - Next Steps

**Generated:** March 1, 2026
**Priority:** MEDIUM-HIGH
**Focus:** Model fine-tuning, evaluation, deployment, multimodal integration

---

## 📊 Current Status

### Training Infrastructure ✅ COMPLETE
- **Colab Notebooks:** 4 notebooks (Gemma3 12B Legal, VLM, Multimodal)
- **Training Datasets:** 38+ JSONL files (~2.1 MB, 102K+ examples)
- **Dataset Preparation:** `prepare_colab_datasets.py` (downloads 8 datasets from HuggingFace + local API)
- **Training Modes:**
  - Option A: Full QLoRA (6-8 hours, all datasets)
  - Option B: ACE Synthesis (1-2 hours, evidence only)

### Multimodal Phase 1 ✅ COMPLETE
- **FastMCP Tools:** 9 tools (4 multimodal, 5 existing)
- **FastAPI Middleware:** 3 services (YOLO, Whisper, CLIP)
- **GPU Services:** YOLOv8n (1.2GB VRAM) + Whisper base.en (2.9GB VRAM) + CLIP ViT-B/32 (0.6GB VRAM)
- **Total VRAM Usage:** 4.7GB / 8GB (RTX 3060 Ti)

### Dataset Coverage
**Legal Domain:**
- evidence_qlora.jsonl (1K examples) - from local API
- entity-patterns.jsonl, forensic-patterns.jsonl, legal-keywords.jsonl
- rag-context.jsonl, schema-patterns.jsonl

**Tech Stack:**
- svelte5-runes.jsonl, svelte5-official-docs.jsonl
- sveltekit-api.jsonl, sveltekit-load.jsonl
- bits-ui-curated.jsonl, bits-ui-extracted.jsonl
- drizzle-orm-extracted.jsonl
- typescript-advanced.jsonl, typescript-enhanced.jsonl

**Tool Calling:**
- tool_calling_glaive.jsonl (15K from HuggingFace)
- tool_calling_hermes.jsonl (10K)
- tool_calling_xlam.jsonl (3K)
- tool_calling_sharegpt.jsonl (3K)

**Multimodal:**
- video_webvid.jsonl (50K)
- video_activitynet.jsonl (20K)

**Meta:**
- detective_mode.jsonl (500 generated)
- MASTER-TRAINING-COMPLETE.jsonl
- GEMMA3-LEGAL-TRAINING-FINAL.jsonl

---

## 🔥 Critical (Do First)

### 1. Model Evaluation Suite
**Priority:** CRITICAL
**Effort:** 4 hours
**Impact:** Measure fine-tuning quality before production deployment

**Missing:** Quantitative evaluation of fine-tuned models

**Implementation:**
```python
# scripts/unsloth-training/evaluate_model.py
"""
Evaluate fine-tuned model on held-out test set

Metrics:
  - Perplexity (language modeling quality)
  - BLEU/ROUGE (generation quality)
  - Exact Match (tool calling accuracy)
  - Legal Domain F1 (entity extraction, citation parsing)
"""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset
from evaluate import load
import json

def evaluate_on_legal_cases(model, tokenizer, test_set_path: str):
    """Evaluate on legal case analysis tasks"""
    test_data = load_dataset('json', data_files=test_set_path, split='train')

    results = {
        'perplexity': 0.0,
        'exact_match': 0.0,
        'entity_f1': 0.0,
        'citation_accuracy': 0.0
    }

    # 1. Perplexity (general language quality)
    perplexity = load('perplexity', module_type='metric')

    predictions = []
    references = []

    for example in test_data:
        inputs = tokenizer(example['input'], return_tensors='pt').to(model.device)
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=256)

        prediction = tokenizer.decode(outputs[0], skip_special_tokens=True)
        predictions.append(prediction)
        references.append(example['output'])

    results['perplexity'] = perplexity.compute(
        predictions=predictions,
        model_id='google/gemma-3-12b'
    )['mean_perplexity']

    # 2. Exact Match (tool calling)
    exact_matches = sum(1 for p, r in zip(predictions, references) if p.strip() == r.strip())
    results['exact_match'] = exact_matches / len(predictions)

    # 3. Entity F1 (legal entity extraction)
    from seqeval.metrics import f1_score

    entity_preds = [extract_entities(p) for p in predictions]
    entity_refs = [extract_entities(r) for r in references]
    results['entity_f1'] = f1_score(entity_refs, entity_preds)

    # 4. Citation accuracy (legal citation parsing)
    citation_preds = [extract_citations(p) for p in predictions]
    citation_refs = [extract_citations(r) for r in references]
    correct_citations = sum(1 for p, r in zip(citation_preds, citation_refs) if p == r)
    results['citation_accuracy'] = correct_citations / len(predictions)

    return results

def main():
    # Load fine-tuned model
    model_path = "/content/outputs/gemma3-legal-final"
    model = AutoModelForCausalLM.from_pretrained(model_path, torch_dtype=torch.bfloat16)
    tokenizer = AutoTokenizer.from_pretrained(model_path)

    # Evaluate on test sets
    print("\\n📊 Evaluating on Legal Case Analysis...")
    legal_results = evaluate_on_legal_cases(
        model, tokenizer,
        test_set_path="./test-sets/legal_cases_test.jsonl"
    )

    print("\\n📊 Evaluating on Tool Calling...")
    tool_results = evaluate_on_tool_calling(
        model, tokenizer,
        test_set_path="./test-sets/tool_calling_test.jsonl"
    )

    # Save results
    results = {
        'legal_analysis': legal_results,
        'tool_calling': tool_results,
        'timestamp': datetime.now().isoformat()
    }

    with open('./evaluation_results.json', 'w') as f:
        json.dump(results, f, indent=2)

    print("\\n✅ Evaluation complete!")
    print(f"   Perplexity: {legal_results['perplexity']:.2f}")
    print(f"   Exact Match: {legal_results['exact_match']:.2%}")
    print(f"   Entity F1: {legal_results['entity_f1']:.2%}")
    print(f"   Citation Accuracy: {legal_results['citation_accuracy']:.2%}")

if __name__ == '__main__':
    main()
```

**Test Set Creation:**
```bash
# Create held-out test sets (10% of training data)
python scripts/unsloth-training/create_test_sets.py \
  --input ./COLAB_PACKAGE/training-datasets/ \
  --output ./test-sets/ \
  --split 0.1
```

---

### 2. Production Model Deployment
**Priority:** CRITICAL
**Effort:** 6 hours
**Impact:** Deploy fine-tuned model to production Ollama

**Current:** Using stock gemma3-legal:latest (not fine-tuned)
**Goal:** Replace with fine-tuned gemma3-12b-legal-qlora

**Steps:**

**1. Export from Colab (GGUF format):**
```python
# In Colab notebook after training
from unsloth import save_to_gguf

save_to_gguf(
    model,
    tokenizer,
    quantization_method="q4_k_m",  # 4-bit quantization
    output_dir="/content/outputs/gemma3-legal-gguf"
)

# Download from Colab
!zip -r gemma3-legal-gguf.zip /content/outputs/gemma3-legal-gguf
# Download via Files panel
```

**2. Import to Ollama:**
```bash
# On production server
# 1. Create Modelfile
cat > Modelfile-gemma3-legal <<EOF
FROM ./gemma3-12b-legal-q4_k_m.gguf

TEMPLATE """{{ if .System }}<|system|>
{{ .System }}<|end|>
{{ end }}{{ if .Prompt }}<|user|>
{{ .Prompt }}<|end|>
{{ end }}<|assistant|>
{{ .Response }}<|end|>
"""

PARAMETER stop "<|end|>"
PARAMETER stop "<|eot_id|>"
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx 8192
EOF

# 2. Import to Ollama
ollama create gemma3-legal-finetuned -f Modelfile-gemma3-legal

# 3. Test
ollama run gemma3-legal-finetuned "Analyze this evidence..."

# 4. Tag as latest (after verification)
ollama tag gemma3-legal-finetuned gemma3-legal:latest
```

**3. Update SvelteKit to use new model:**
```typescript
// src/lib/ai/model-ids.ts
export const LLM_MODELS = {
  LEGAL: 'gemma3-legal:latest', // Now points to fine-tuned version
  EMBEDDING: 'embeddinggemma:latest',
  FALLBACK: 'gemma3:270m'
};
```

**4. Gradual rollout (A/B test):**
```typescript
// src/lib/server/ai/model-router.ts
export function selectLegalModel(userId: string): string {
  // 10% traffic to fine-tuned model
  const hash = createHash('md5').update(userId).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  return bucket < 10
    ? 'gemma3-legal-finetuned:latest'
    : 'gemma3-legal:latest'; // Stock model
}
```

---

### 3. Model A/B Testing Infrastructure
**Priority:** HIGH
**Effort:** 3 hours
**Impact:** Compare fine-tuned vs stock model performance

**Implementation:**
```typescript
// src/lib/server/ai/ab-test.ts
export interface ABTestConfig {
  experimentId: string;
  modelA: string; // Stock model
  modelB: string; // Fine-tuned model
  trafficSplit: number; // 0-100 (% to model B)
  metrics: string[]; // ['latency', 'user_rating', 'task_completion']
}

export const ACTIVE_EXPERIMENTS: ABTestConfig[] = [
  {
    experimentId: 'gemma3-legal-qlora-v1',
    modelA: 'gemma3-legal:stock',
    modelB: 'gemma3-legal-finetuned:latest',
    trafficSplit: 10, // 10% to fine-tuned
    metrics: ['latency', 'user_rating', 'citation_accuracy']
  }
];

export async function assignExperimentBucket(
  userId: string,
  experimentId: string
): Promise<'A' | 'B'> {
  const experiment = ACTIVE_EXPERIMENTS.find(e => e.experimentId === experimentId);
  if (!experiment) return 'A';

  const hash = createHash('md5').update(userId + experimentId).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  return bucket < experiment.trafficSplit ? 'B' : 'A';
}

export async function logABTestEvent(
  userId: string,
  experimentId: string,
  bucket: 'A' | 'B',
  metric: string,
  value: number
) {
  await db.insert(abTestEvents).values({
    userId,
    experimentId,
    bucket,
    metric,
    value,
    timestamp: new Date()
  });
}
```

**Schema:**
```sql
CREATE TABLE ab_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  experiment_id VARCHAR(100) NOT NULL,
  bucket VARCHAR(1) NOT NULL, -- 'A' or 'B'
  metric VARCHAR(50) NOT NULL,
  value NUMERIC,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_test_experiment ON ab_test_events(experiment_id, bucket);
```

---

## 🚀 High Priority

### 4. Training Data Augmentation
**Priority:** HIGH
**Effort:** 4 hours
**Impact:** Improve model coverage of edge cases

**Missing Datasets:**
1. **Legal Citations:** Bluebook format parsing/generation
2. **Motions & Briefs:** Legal document templates
3. **Discovery Requests:** Interrogatories, RFPs, RFAs
4. **Case Law Analysis:** Precedent extraction from opinions

**Implementation:**
```python
# scripts/unsloth-training/generate_legal_datasets.py
"""
Generate synthetic legal training data using gemma3-legal

Techniques:
  - Few-shot prompting with real examples
  - Template-based generation with variations
  - Paraphrase existing examples
  - Domain-specific augmentation (change jurisdiction, party names, etc.)
"""

def generate_citation_dataset(count: int = 1000):
    """Generate Bluebook citation parsing examples"""

    templates = [
        "Cite: {case_name}, {volume} {reporter} {page} ({court} {year})",
        "Parse citation: {full_citation}",
        "Convert to Bluebook: {informal_citation}"
    ]

    examples = []

    for i in range(count):
        case_name = random.choice(CASE_NAMES)
        volume = random.randint(1, 999)
        reporter = random.choice(['U.S.', 'F.3d', 'F.Supp.3d', 'S.Ct.'])
        page = random.randint(1, 9999)
        court = random.choice(['S.D.N.Y.', '9th Cir.', '2d Cir.'])
        year = random.randint(1950, 2025)

        prompt = random.choice(templates).format(
            case_name=case_name,
            volume=volume,
            reporter=reporter,
            page=page,
            court=court,
            year=year,
            full_citation=f"{case_name}, {volume} {reporter} {page} ({court} {year})",
            informal_citation=f"{case_name} ({year})"
        )

        examples.append({
            'instruction': prompt,
            'output': generate_citation_output(case_name, volume, reporter, page, court, year)
        })

    return examples

def generate_discovery_dataset(count: int = 500):
    """Generate discovery request examples"""

    discovery_types = ['interrogatory', 'rfp', 'rfa']

    examples = []

    for i in range(count):
        dtype = random.choice(discovery_types)

        if dtype == 'interrogatory':
            prompt = f"Draft interrogatory #{i+1} regarding {random.choice(DISCOVERY_TOPICS)}"
            output = generate_interrogatory(i+1, random.choice(DISCOVERY_TOPICS))
        elif dtype == 'rfp':
            prompt = f"Draft request for production #{i+1} for {random.choice(DOCUMENT_TYPES)}"
            output = generate_rfp(i+1, random.choice(DOCUMENT_TYPES))
        else:  # rfa
            prompt = f"Draft request for admission #{i+1} about {random.choice(ADMISSION_TOPICS)}"
            output = generate_rfa(i+1, random.choice(ADMISSION_TOPICS))

        examples.append({'instruction': prompt, 'output': output})

    return examples

# Run generation
citations = generate_citation_dataset(1000)
discovery = generate_discovery_dataset(500)

# Save to JSONL
save_jsonl(citations, './augmented-datasets/legal_citations.jsonl')
save_jsonl(discovery, './augmented-datasets/discovery_requests.jsonl')
```

---

### 5. Continuous Training Pipeline
**Priority:** HIGH
**Effort:** 5 hours
**Impact:** Incrementally improve model with production data

**Architecture:**
```
User Interactions → Feedback → Curated Dataset → Scheduled Retraining
```

**Implementation:**
```python
# scripts/unsloth-training/continuous_training.py
"""
Continuous training pipeline

1. Collect feedback from production (user ratings, corrections)
2. Curate high-quality examples
3. Incrementally fine-tune on new data
4. Deploy updated model (with A/B test)
"""

def collect_production_examples(since_date: datetime) -> list:
    """Fetch user-corrected AI responses from database"""

    # Query ai_feedback table
    feedback = db.query("""
        SELECT
            q.query,
            q.response,
            f.corrected_response,
            f.rating
        FROM user_ai_queries q
        JOIN ai_feedback f ON q.id = f.query_id
        WHERE f.created_at > %s
          AND f.rating >= 4  -- Only high-quality corrections
          AND f.corrected_response IS NOT NULL
    """, [since_date])

    # Convert to training format
    examples = []
    for row in feedback:
        if row['corrected_response']:  # User provided correction
            examples.append({
                'instruction': row['query'],
                'output': row['corrected_response']  # Use corrected version
            })
        elif row['rating'] >= 4:  # User approved original
            examples.append({
                'instruction': row['query'],
                'output': row['response']
            })

    return examples

def retrain_incremental(
    base_model: str,
    new_examples: list,
    output_dir: str
):
    """Incrementally fine-tune on new data"""

    from unsloth import FastLanguageModel

    # Load current production model
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=8192,
        dtype=None,
        load_in_4bit=True
    )

    # Prepare LoRA for incremental training
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_alpha=16,
        lora_dropout=0.05
    )

    # Train on new examples (short training)
    trainer = SFTTrainer(
        model=model,
        train_dataset=new_examples,
        max_seq_length=8192,
        dataset_text_field="text",
        num_train_epochs=1,  # Single pass
        learning_rate=5e-5,  # Lower LR for incremental
    )

    trainer.train()

    # Save updated model
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

# Scheduled job (weekly)
def weekly_retrain_job():
    # 1. Collect new examples from last week
    new_examples = collect_production_examples(datetime.now() - timedelta(days=7))

    if len(new_examples) < 100:
        print("Not enough new examples (need 100+)")
        return

    # 2. Retrain
    retrain_incremental(
        base_model="gemma3-legal-finetuned:latest",
        new_examples=new_examples,
        output_dir="./outputs/gemma3-legal-incremental"
    )

    # 3. Deploy to staging for A/B test
    deploy_to_staging("./outputs/gemma3-legal-incremental")
```

---

### 6. TensorRT Optimization
**Priority:** MEDIUM-HIGH
**Effort:** 4 hours
**Impact:** 2-5x inference speedup on RTX 3060 Ti

**Current:** Ollama (GGUF quantized, CPU/GPU hybrid)
**Goal:** Full GPU inference via TensorRT

**Steps:**
```bash
# 1. Convert GGUF → ONNX → TensorRT
python scripts/unsloth-training/convert_to_tensorrt.py \
  --model gemma3-legal-finetuned.gguf \
  --output ./trt-engines/gemma3-legal.plan \
  --precision fp16 \
  --max-batch 4 \
  --max-seq-len 8192

# 2. Build Triton model repository
mkdir -p /models/gemma3-legal/1/
cp ./trt-engines/gemma3-legal.plan /models/gemma3-legal/1/model.plan

cat > /models/gemma3-legal/config.pbtxt <<EOF
name: "gemma3-legal"
backend: "tensorrt"
max_batch_size: 4
input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [ -1 ]
  }
]
output [
  {
    name: "output"
    data_type: TYPE_FP16
    dims: [ -1, 32000 ]
  }
]
instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
EOF

# 3. Start Triton server
docker run --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 \
  -v /models:/models \
  nvcr.io/nvidia/tritonserver:24.01-py3 \
  tritonserver --model-repository=/models

# 4. Benchmark
python scripts/benchmark-triton.py \
  --url localhost:8000 \
  --model gemma3-legal \
  --batch-sizes 1,2,4 \
  --seq-lengths 512,1024,2048
```

**Expected Speedup:**
- Ollama GGUF Q4: ~15 tokens/sec
- TensorRT FP16: ~50-75 tokens/sec (3-5x faster)

---

## 📋 Medium Priority

### 7. Multimodal Model Fine-Tuning
**Priority:** MEDIUM
**Effort:** 8 hours
**Impact:** Improve vision understanding for evidence analysis

**Current:** Using stock YOLO + CLIP
**Goal:** Fine-tune on legal evidence images

**Dataset Creation:**
```python
# Collect labeled evidence images from production
SELECT
    e.id,
    e.file_path,
    e.metadata->'detections' as labels,
    e.ai_summary as description
FROM evidence e
WHERE
    e.evidence_type = 'photo'
    AND e.metadata->'detections' IS NOT NULL
    AND LENGTH(e.ai_summary) > 50
LIMIT 5000;

# Convert to VLM training format (ShareGPT)
{
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "image", "image": "evidence/abc-123.jpg"},
        {"type": "text", "text": "Describe this evidence image in detail."}
      ]
    },
    {
      "role": "assistant",
      "content": "This image shows a security camera screenshot depicting..."
    }
  ]
}
```

---

### 8. Model Monitoring Dashboard
**Priority:** MEDIUM
**Effort:** 4 hours
**Impact:** Track production model health

**Metrics:**
- Inference latency (p50, p95, p99)
- Token throughput (tokens/sec)
- Error rate (% failed requests)
- User ratings (average per day)
- A/B test metrics

**UI:**
```svelte
<!-- ModelMonitoringDashboard.svelte -->
<script>
  let metrics = $state<any>(null);

  onMount(async () => {
    const res = await fetch('/api/ml/metrics');
    metrics = await res.json();
  });
</script>

<div class="dashboard">
  <h2>Model Performance (Last 24 Hours)</h2>

  <div class="metrics-grid">
    <MetricCard
      title="Latency (p95)"
      value={metrics.latency_p95}
      unit="ms"
      trend={metrics.latency_trend} />

    <MetricCard
      title="Throughput"
      value={metrics.tokens_per_sec}
      unit="tok/s" />

    <MetricCard
      title="User Rating"
      value={metrics.avg_rating}
      unit="/5.0"
      trend={metrics.rating_trend} />

    <MetricCard
      title="Error Rate"
      value={metrics.error_rate}
      unit="%"
      alert={metrics.error_rate > 5} />
  </div>

  <h3>A/B Test: gemma3-legal-qlora-v1</h3>
  <ABTestResults experimentId="gemma3-legal-qlora-v1" />
</div>
```

---

### 9. Automated Dataset Versioning
**Priority:** LOW
**Effort:** 2 hours
**Impact:** Track training data lineage

**Implementation:**
```bash
# Git-like versioning for datasets
dvc init
dvc add ./COLAB_PACKAGE/training-datasets/*.jsonl
git add .dvc *.dvc
git commit -m "Dataset v1.0 - Initial legal training data"
git tag dataset-v1.0

# Upload to remote storage
dvc remote add -d storage s3://deeds-training-data
dvc push

# Reproduce training with specific dataset version
git checkout dataset-v1.0
dvc pull
python train.py
```

---

### 10. Model Distillation
**Priority:** LOW
**Effort:** 6 hours
**Impact:** Create smaller, faster student model

**Goal:** Distill gemma3-12B → gemma3-2B for faster inference

**Process:**
```python
# Use teacher (12B) to generate training data for student (2B)
from transformers import AutoModelForCausalLM, AutoTokenizer

teacher = AutoModelForCausalLM.from_pretrained("gemma3-legal-12b")
student = AutoModelForCausalLM.from_pretrained("google/gemma-3-2b")

# Distillation loss = KL divergence + task loss
def distillation_loss(student_logits, teacher_logits, labels, temperature=2.0, alpha=0.5):
    # Soft targets from teacher
    soft_loss = nn.KLDivLoss()(
        F.log_softmax(student_logits / temperature, dim=-1),
        F.softmax(teacher_logits / temperature, dim=-1)
    ) * (temperature ** 2)

    # Hard targets (ground truth)
    hard_loss = nn.CrossEntropyLoss()(student_logits, labels)

    return alpha * soft_loss + (1 - alpha) * hard_loss
```

---

## 📊 Summary

**Total Items:** 10
**Effort:** 46 hours
**Priority Breakdown:**
- 🔥 Critical: 3 items (13 hours) - Evaluation, deployment, A/B testing
- 🚀 High: 3 items (13 hours) - Data augmentation, continuous training, TensorRT
- 📋 Medium/Low: 4 items (20 hours) - VLM fine-tuning, monitoring, versioning, distillation

**Key Milestones:**
1. **Evaluation** → Baseline metrics before deployment
2. **Production Deployment** → Replace stock with fine-tuned model
3. **A/B Testing** → Gradual rollout with quality gates
4. **Continuous Training** → Weekly retraining on user feedback
5. **TensorRT** → 3-5x inference speedup

**Dependencies:**
- Evaluation must complete before production deployment
- A/B testing infrastructure needed before gradual rollout
- Monitoring dashboard needed for production health tracking

**Files to Create:**
- `scripts/unsloth-training/evaluate_model.py`
- `scripts/unsloth-training/create_test_sets.py`
- `scripts/unsloth-training/continuous_training.py`
- `scripts/unsloth-training/generate_legal_datasets.py`
- `scripts/unsloth-training/convert_to_tensorrt.py`
- `src/lib/server/ai/ab-test.ts`
- `src/routes/(app)/ml-monitoring/+page.svelte`

**Schema Changes:**
```sql
CREATE TABLE ab_test_events (...);
```

---

**Last Updated:** March 1, 2026
**Next Steps:** Run evaluation suite, then deploy to staging for A/B test
