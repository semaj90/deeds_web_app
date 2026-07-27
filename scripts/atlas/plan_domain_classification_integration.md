# Phase Plan: Parent Atlas Domain Classification Integration (ML-Driven)

**Goal**: To implement a robust, versioned, and safe ML-driven classification pipeline that populates domain-specific metadata into the canonical `atlas_packets` source of truth.
**Status**: Plan Defined (Requires Schema Migration & Implementation)
**Source Artifact**: Internal Architectural Review & Multi-Nomial Naive Bayes Specification
**Canonical Key**: `packet_key` is the single source of truth for identity. `source_ref` is only used for indexing/retrieval context.

---

## 📜 1. Core Governance Principles (Non-Negotiable)

1.  **Identity Key**: All writes and updates MUST be keyed by the **`packet_key`** (the immutable record identifier) to prevent ambiguous updates from `source_ref`.
2.  **Data Flow**: The process must be strictly layered: `domain_training_rows` $\to$ `atlas_domain_predictions` (STAGING) $\to$ **[Manual/Gate]** $\to$ `atlas_packets` (PRODUCTION).
3.  **Immutability/Versioning**: All predictions and model artifacts must be versioned:
    *   New columns required: `classifier_run_id`, `classifier_version`, `model_sha256`, `classified_at`.
    *   The `atlas_packets` table MUST NOT be updated directly from a source file level; it must only accept approved, fully validated records.
4.  **Safety/Safety**: All data manipulation must be wrapped in transactions using `BEGIN`/`COMMIT`/`ROLLBACK` blocks.

---

## 🛠️ 2. Required Infrastructure & Schema Changes

### A. Staging Table (The Prediction Ledger)
A new, non-canonical staging table is required to hold predictions before they are approved for canonical write. This table MUST be keyed by `packet_key`.

**Action**: Add `atlas_domain_predictions` table.
**Key Fields**:
*   `prediction_id` (UUID, Primary Key): Unique run identifier.
*   `packet_key` (Text, Index): The canonical primary key for matching.
*   `predicted_domain` (Text): The classified domain label.
*   `raw_score` (Double): Raw confidence score (e.g., raw word frequency).
*   `score_margin` (Double): The critical, calibrated metric (e.g., $\text{log}(P_{\text{best}}) - \text{log}(P_{\text{second\_best}})$).
*   `calibrated_confidence` (Double): The final, validated score (e.g., $\text{score\_margin} / \text{threshold}$).
*   `classifier_kind`, `classifier_version`, `model_sha256`: Metadata for lineage.
*   `status`: (e.g., `PREDICTED`, `STAGED_FOR_REVIEW`, `CANONICAL`).

### B. Data Source Management
The `domain_training_rows` table must be logically partitioned/filtered using the `split_name` column to enforce data separation:
*   **`TRAIN`**: Used for model training and generating parameters (e.g., `tokenFrequencies`).
*   **`VALIDATION`**: Used for tuning the final acceptance threshold (e.g., `acceptance_threshold`).
*   **`TEST`**: Used for final, read-only reporting and evaluation metrics (Macro F1, Confusion Matrix).
*   **`UNLABELED`**: The target pool for inference.

---

## 🧠 3. ML Inference and Promotion Flow (The Write Pipeline)

The process is strictly sequential, enforced by transaction boundaries:

**Step 3.1: Training (TRAIN)**
*   **Action**: Run the `MultiNomialNaiveBayes` training logic on the `TRAIN` subset.
*   **Output**: Model parameters (`model` object, `vocabulary` set, `tokenFrequencies` map).
*   **Verification**: The training must complete successfully, yielding a stable `model_sha256` hash.

**Step 3.2: Validation (VALIDATION)**
*   **Action**: Run the model inference on the `VALIDATION` subset.
*   **Output**: Calculate and report the necessary metrics (Precision, Recall, F1) for *each* domain.
*   **Gate**: An explicit **Acceptance Threshold** (e.g., `score_margin` must exceed X, or the resulting Macro F1 must exceed Y) must be derived from this run and documented.

**Step 3.3: Prediction (UNLABELED $\to$ STAGING)**
*   **Action**: Run the model on `UNLABELED` records.
*   **Write**: All predictions are written *only* to `atlas_domain_predictions`. The `status` is set to `STAGED_FOR_REVIEW`.
*   **Key Rule**: This step calculates the initial, raw `score_margin` and populates the record.

**Step 3.4: Canonical Promotion (STAGING $\to$ PRODUCTION)**
*   **Action**: Only when a human/system review confirms the necessary confidence level AND the prediction aligns with canonical business logic, an explicit promotion step occurs.
*   **Write**: An `UPDATE` from `atlas_domain_predictions` to `atlas_packets` occurs.
*   **Gate**: Requires a successful, audited check: `UPDATE atlas_packets SET ... WHERE packet_key = :key AND source('status') = 'READY_FOR_CANONICAL_WRITE'`.

---

## 🛑 Summary of Required Tooling/Artifacts

1.  **Schema/DB**: `atlas_domain_predictions` table, `atlas_packets` table.
2.  **Logic**: `MultiNomialNaiveBayes` class (re-implementing the core logic).
3.  **Safety**: Transaction wrappers, `BEGIN`/`COMMIT`, and a mandatory human/system review step.

**Conclusion**: The plan is technically sound and addresses all identified data governance weaknesses. The next step is to define the minimum viable implementation for **Step 2 (Staging Table Creation)** and **Step 3.1 (Training)**.