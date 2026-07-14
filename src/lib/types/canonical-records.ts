/**
 * @file Canonical record definition for data records that have passed
 * through the full lineage pipeline, including mandatory source provenance.
 * This structure should be used as the single source of truth object
 * before being committed to cache or indexed.
 */

/**
 * @typedef {Object} CanonicalSourceMetadata
 * @property {string} source_path - The absolute filesystem path to the raw source artifact (e.g., /data/case_123/evidence.pdf).
 * @property {string} file_path - The logical, canonical path to the source file, relative to the project root (e.g., "data/evidence/case_123.pdf").
 * @property {string} canonical_source_ref - A persistent, non-changing, system-generated identifier for the source artifact (The primary key for provenance).
 * @property {string} [associated_user_id] - Optional: The user or system that created this initial record.
 */

/**
 * @typedef {Object} EnrichedCardRecord
 * @property {string} id - The primary identifier (e.g., card ID, document ID).
 * @property {string} source_ref - The unique identifier pointing to the source data in the Atlas system (should map to CanonicalSourceMetadata).
 * @property {string} kind - The classification of the record (e.g., 'legal_document', 'summary_note').
 * @property {object} metadata - Contains the fully resolved provenance metadata.
 * @property {CanonicalSourceMetadata} metadata.source - The canonical source metadata object.
 * @property {string} [som_bmu_row]
 * @property {string} [som_bmu_col]
 * @property {number} [reward_count]
 * @property {number} [reward_avg]
 * @property {number} [total_reward]
 * @property {number} [outcome_count]
 * @property {number} [outcome_reward_sum]
 * @property {string} [vector64]
 */

/**
 * @typedef {Object} EnrichedParentAtlasEntry
 * @property {string} id - The primary identifier.
 * @property {string} source_ref - The unique identifier pointing to the source data in the Atlas system.
 * @property {string} kind - The classification of the record.
 * @property {CanonicalSourceMetadata} source - The canonical source metadata object.
 * @property {number} reward_count
 * @property {number} reward_avg
 * @property {number} total_reward
 * @property {number} outcome_count
 * @property {number} outcome_reward_sum
 * @property {string} vector64
 */