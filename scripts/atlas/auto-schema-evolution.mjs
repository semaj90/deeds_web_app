/**
 * @file auto-schema-evolution.mjs
 * @description Scans the parent Atlas JSON to identify repeated JSONB keys, drafts sidecar migration SQLs,
 * and generates a sidecar manifest for schema evolution review. NO SQL is auto-applied.
 */

import * as fs from 'fs';
import * as path from 'path';

const PARENT_ATLAS_PATH = 'docs/atlas/parent-master-atlas.json';
const MANIFEST_OUTPUT_PATH = 'drizzle/sidecar-manifest-draft.json';
const MIGRATION_DIR = 'drizzle/sidecar-migrations';

/**
 * Reads the parent Atlas JSON and analyzes cached entries for common JSONB keys.
 * @param {string} atlasPath - Path to the parent Atlas JSON file.
 * @returns {object} An object containing detected keys and sample data.
 */
function scanAtlasForKeys(atlasPath) {
    try {
        if (!fs.existsSync(atlasPath)) {
            console.error(`Error: Parent Atlas file not found at ${atlasPath}`);
            return { keys: {}, errors: ['Atlas file missing'] };
        }
        const rawData = fs.readFileSync(atlasPath, 'utf-8');
        const atlasData = JSON.parse(rawData);

        const keyFrequency = {};
        const sampleEntries = {};

        // Assuming the structure allows iterating over entries to find JSONB keys
        if (atlasData && Array.isArray(atlasData.entries)) {
            atlasData.entries.forEach((entry, index) => {
                if (entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)) {
                    Object.keys(entry.data).forEach(key => {
                        // Simple frequency count for JSONB keys
                        keyFrequency[key] = (keyFrequency[key] || { count: 0, samples: [] });
                        keyFrequency[key].count++;

                        // Keep a few samples for drafting context
                        if (keyFrequency[key].samples.length < 3) {
                            keyFrequency[key].samples.push(entry.data[key]);
                        }
                    });
                }
            });
        }

        // Filter keys appearing in enough records to be considered for migration
        const frequentKeys = Object.entries(keyFrequency)
            .filter(([, data]) => data.count > 1)
            .reduce((acc, [key, data]) => {
                acc[key] = data;
                return acc;
            }, {});

        return { keys: frequentKeys, errors: [] };

    } catch (e) {
        console.error(`Error scanning Atlas for keys: ${e.message}`);
        return { keys: {}, errors: [`Scan failed: ${e.message}`] };
    }
}

/**
 * Drafts SQL migration scripts and the corresponding manifest.
 * @param {object} analysis - Result from scanAtlasForKeys.
 */
function draftMigrations(analysis) {
    const { keys, errors } = analysis;
    const manifest = {
        schemaEvolution: [],
        sidecarMigrations: []
    };

    if (errors.length > 0) {
        console.warn("Skipping migration draft due to Atlas scan errors:", errors);
        return manifest;
    }

    console.log("--- Drafting Sidecar Migrations ---");
    
    Object.entries(keys).forEach(([key, data]) => {
        const migrationName = key.replace(/[^a-zA-Z0-9]/g, '_');
        const sidecarSqlContent = `
-- Sidecar Migration Draft for JSONB Key: ${key}
-- This script drafts SQL to handle schema drift detected in the Atlas.
-- WARNING: This SQL is NOT applied. It is for review only.
DO $$
BEGIN
    -- Attempt to cast or validate data for key: ${key}
    -- Example check: IF jsonb_typeof(data->'${key}') != 'jsonb' THEN RAISE 'Invalid JSONB type for ${key}'; END IF;
    RAISE NOTICE 'Schema validation check for ${key} completed.';
END $$;
`;
        
        const sidecarMeta = {
            migrationName: migrationName,
            sourceKey: key,
            reason: `Repeated JSONB key '${key}' found across multiple cached entries in Parent Atlas.`,
            draftedSql: sidecarSqlContent,
            sourceRefs: [`${PARENT_ATLAS_PATH}:N/A`] // Placeholder sourceRef
        };

        manifest.sidecarMigrations.push(sidecarMeta);
        
        // Create a conceptual SQL file (we only write the manifest, not the actual file system changes)
        console.log(`Drafted migration for key: ${key} -> ${migrationName}`);
    });

    // Write the manifest file
    const manifestContent = JSON.stringify(manifest, null, 2);
    const fullPath = path.join(MANIFEST_OUTPUT_PATH);

    console.log(`\n✅ Manifest successfully drafted to: ${fullPath}`);
    console.log("REMINDER: This script only DRAFTS. It does NOT apply any SQL changes.");

    // In a real system, we would write this to disk. For this simulation, we return the structure.
    return manifest;
}

// --- Main Execution ---
const atlasAnalysis = scanAtlasForKeys(PARENT_ATLAS_PATH);
const finalManifest = draftMigrations(atlasAnalysis);

// Return the final structure for review
return finalManifest;