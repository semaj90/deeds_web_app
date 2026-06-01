/**
 * @fileoverview Alias Card Mapper Service.
 * @description A dedicated module to translate machine-generated, opaque UUID card IDs into human-readable,
 *              semantically rich aliases for improved agent memory and human debugging.
 * @module aliasCardMapper
 */

const fs = require('fs');
const path = require('path');

/**
 * @function loadAliasMap
 * @description Loads the canonical mapping of UUIDs to human-readable aliases.
 * @param {string} mapPath - Path to the JSON map file containing UUID aliases.
 * @returns {Object.<string, string>} A map of UUIDs to aliases.
 */
function loadAliasMap(mapPath) {
    try {
        if (!fs.existsSync(mapPath)) {
            console.warn(`[ALIAS_MAP] Alias map file not found at: ${mapPath}. Returning empty map.`);
            return {};
        }
        const data = fs.readFileSync(mapPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`[ALIAS_MAP] Failed to load or parse alias map from ${mapPath}:`, error.message);
        return {};
    }
}

/**
 * @async
 * @function resolveAliases
 * @description Processes a list of raw UUIDs against the loaded alias map.
 * @param {Array<string>} uuidsToResolve - Array of raw UUID strings from the Atlas.
 * @param {string} aliasMapPath - Path to the JSON map file.
 * @returns {Promise<Object>} A structured object containing resolved aliases and any unresolved UUIDs.
 */
async function resolveAliases(uuidsToResolve, aliasMapPath) {
    console.log('[ALIAS_MAP] Starting alias resolution pass...');
    const aliasMap = loadAliasMap(aliasMapPath);
    const resolvedMap = {};
    const unresolvedList = [];

    for (const uuid of uuidsToResolve) {
        if (aliasMap[uuid]) {
            const aliasData = aliasMap[uuid];
            resolvedMap[uuid] = {
                alias: aliasData.alias,
                source_ref: aliasData.source_ref,
                confidence: aliasData.confidence
            };
        } else {
            unresolvedList.push(uuid);
        }
    }

    return {
        resolved: resolvedMap,
        unresolved: unresolvedList,
        totalChecked: uuidsToResolve.length
    };
}

/**
 * @async
 * @function main
 * @description Main execution wrapper.
 * @param {string} mapPath - Path to the alias map.
 * @param {Array<string>} uuidList - List of UUIDs to check.
 */
async function main(mapPath, uuidList) {
    console.log('====================================================');
    console.log('🌟 Alias Card Mapper Service Initialized');
    console.log('=====================================================\n');

    if (!uuidList || uuidList.length === 0) {
        console.log('No UUIDs provided for resolution.');
        return;
    }

    const result = await resolveAliases(uuidList, mapPath);

    console.log('--- Resolution Summary ---');
    console.log(`Total UUIDs Checked: ${result.totalChecked}`);
    console.log(`Successfully Aliased: ${Object.keys(result.resolved).length}`);
    console.log(`Unresolved UUIDs Remaining: ${result.unresolved.length}`);

    if (result.unresolved.length > 0) {
        console.warn(`\n⚠️ WARNING: ${result.unresolved.length} UUIDs could not be aliased. They will remain opaque.`);
    }

    console.log('====================================================');
}

// Example usage structure (for external calls):
// main('./path/to/uuid_aliases.json', ['021b14a2f39ec72e', 'another-uuid']);
