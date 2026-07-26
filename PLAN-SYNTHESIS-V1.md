# 📄 Project Phase Plan: Canonical Identity and Data Flow Layer

**Status**: 🟡 Drafting | **Version**: 1.0.0 | **Owner**: AI Agent Synthesis | **Target**: Formalized Migration Agreement

---

## 🎯 Phase Goal & Scope

The primary objective of this phase is to establish a single, canonical, and auditable data identity source for all operational packets across the system, migrating from decentralized data points to a unified, truth-source ledger. This phase will establish the `identity_lane` and formalize the ingestion lifecycle, ensuring that all future operations rely on a single, verifiable source of truth before write/cache operations.

**Scope**: Defining the full data lifecycle from initial data capture through to Qdrant/Postgres canonicalization.

## ⚙️ Prerequisites

The following conditions **MUST** be met and explicitly audited before proceeding to Stage 1:

1.  **`PRUNE_OPERATION_COMPLETED`**: A dedicated, audited data pruning operation must have successfully executed, establishing a clean slate for identity mapping.
2.  **Data Validation**: Initial data sources must pass validation for required fields: `packet_key`, `source_ref`, and `feature_id` must be non-null and present.
3.  **System Readiness**: The target environment must support atomic transactions across the database, Redis, and the new data pipeline services.

## 🗓️ Phase Stages (Sequential Execution)

Execution **MUST** follow the sequence below. No stage may begin until the previous stage is marked `COMPLETED` and audited.

### **Stage 1: Identity Audit (READ-ONLY / Classification)**
*   **Objective**: To map and classify every existing record against the new canonical identity ruleset.
*   **Action**: Perform a comprehensive, read-only scan across the `atlas_packets` table.
*   **Methodology**: Data points will be classified and scored using the canonical authority order:
    1.  **Primary Join**: Join on `packet_key` (Highest Authority).
    2.  **Secondary Validation**: Check for co-occurrence of `source_ref` and `feature_id`.
    3.  **Ternary Check**: Validate records based on `source_ref` + `feature_id` + `directory_path` (if available).
*   **Output**: A temporary audit report detailing the current state of every record, flagging those that lack required identity components.
*   **Deliverable**: Audit Report Ledger (Read-Only).

### **Stage 2: Data Model Definition & Mapping**
*   **Objective**: Finalize the data model structures for the new canonical identity fields.
*   **Actions**:
    1.  **`identity_lane`**: Implement the data structure to hold the canonical source of truth pointers and metadata.
    2.  **`ingest_generation`**: Define the data type and constraints for new identity metadata, ensuring non-nullable references for primary keys.
*   **Constraint Enforcement**: Any write operation **MUST** first reference and validate against the `identity_lane` record, rather than independently derived keys.

### **Stage 3: Dry-Run Ledger Generation (Proposal)**
*   **Objective**: Simulate the write process and generate a non-executable, version-controlled proposal ledger.
*   **Artifact**: An NDJSON ledger file will be generated, capturing the *proposed* changes for auditing and human review.
*   **Data Points to Capture (Mandatory)**:
    *   `Qdrant point ID`: The external vector identifier.
    *   `source_ref`: The canonical file path.
    *   `match_state`: A string enumerating the validation stage (e.g., `STABLE`, `WARNING`, `UNVERIFIED`).
    *   `proposed_action`: The specific change intended (e.g., `CREATE_NEW_ENTRY`, `UPDATE_MISSING_FIELD`).
    *   `validation_score`: The calculated confidence score (0.0 to 1.0) for the proposed entry.
*   **Mechanism**: This stage involves running validation logic against the live data and writing the results to a local, version-controlled ledger, **without** writing to the production database or cache.

### **Stage 4: Dry-Run Backfill Proposal & Execution Gate**
*   **Objective**: Generate the executable SQL/script logic for migrating the ledger into the production system.
*   **Dry-Run Operation**: The initial proposal will be generated using a conditional `UPDATE` template:
    ```sql
    UPDATE atlas_packets
    SET qdrant_point_id = X, identity_lane = Y, updated_at = NOW()
    WHERE packet_key = '{{key}}' 
      AND qdrant_point_id IS NULL 
      AND source_ref = '{{source_ref}}'
    -- CRITICAL CONDITION: Must verify against the ledger data generated in Stage 3.
    ```
*   **Execution**: The transition to production requires running the script with `DRY_RUN = FALSE` *only* after all validation gates are passed and the proposed changes are explicitly approved.

## ✅ Sign-Off Gates (Go/No-Go Checklist)

The phase is only eligible for production execution when all of the following conditions are met:

*   [ ] **Source Reference Coverage**: `atlas_packets` records must achieve `source_ref` coverage exceeding 95% across all audited records.
*   [ ] **Identity Field Integrity**: `identity_lane` and `ingest_generation` fields must be correctly populated and indexed in the schema.
*   [ ] **Qdrant Write Audit**: The dry-run ledger must be audited and reviewed, confirming the proposed set of updates are necessary and correct.
*   [ ] **Code Review**: Code changes for Stage 4 must be reviewed and approved by all necessary architecture reviewers.
*   [ ] **Test Coverage**: Associated unit and integration tests must pass successfully in a dedicated staging environment.

---
*This plan serves as the binding agreement for the next development cycle and must be adhered to sequentially. All writes must pass through the structured ledger generation and validation steps.*