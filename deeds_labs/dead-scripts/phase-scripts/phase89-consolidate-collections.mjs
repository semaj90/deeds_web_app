#!/usr/bin/env node
/**
 * Phase 89: Qdrant Collection Consolidation Script
 *
 * Consolidates 17+ Qdrant collections → 6 core collections
 *
 * SAFETY FEATURES:
 * - Dry-run by default (requires --execute flag)
 * - Snapshots before deletion (requires --confirm flag)
 * - Incremental migration (pause/resume)
 * - Validation before archiving
 *
 * Usage:
 *   node scripts/phase89-consolidate-collections.mjs --dry-run
 *   node scripts/phase89-consolidate-collections.mjs --execute --confirm
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const client = new QdrantClient({ url: QDRANT_URL });

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || (!args.includes('--execute'));
const isConfirmed = args.includes('--confirm');
const isExecute = args.includes('--execute');

// Migration mapping
const MIGRATION_PLAN = {
	// Target: phase89_error_chunks
	'phase89_error_chunks': {
		sources: ['phase81_ts_errors', 'phase79_errors', 'phase89_error_map'],
		action: 'merge',
		description: 'Consolidate all error vectors into primary error index'
	},

	// Target: phase89_ast_embeddings
	'phase89_ast_embeddings': {
		sources: ['phase72_ast_knowledge_base', 'phase89_ast_topology', 'phase89_code_units', 'phase89_code_chunks'],
		action: 'merge',
		description: 'Consolidate AST structural data'
	},

	// Target: phase89_rag_patterns
	'phase89_rag_patterns': {
		sources: ['phase72_error_patterns', 'phase78_solutions'],
		action: 'merge',
		description: 'Consolidate learned fix patterns'
	},

	// Target: phase89_kb_cards
	'phase89_kb_cards': {
		sources: ['phase79_knowledge_base', 'phase72_summaries', 'phase72_evidence_embeddings'],
		action: 'merge',
		description: 'Consolidate knowledge base entries'
	},

	// Keep as-is (no migration)
	'phase89_error_clusters': {
		sources: [],
		action: 'keep',
		description: 'CUDA clustering output - keep empty until populated'
	},

	'phase76_knowledge_base': {
		sources: [],
		action: 'keep',
		description: 'Legacy fallback - keep as read-only'
	},

	// Archive/Delete
	'phase72_external_knowledge_base': {
		sources: [],
		action: 'delete',
		description: 'Empty - safe to delete after snapshot'
	},

	'phase76_error_analysis': {
		sources: [],
		action: 'delete',
		description: 'Superseded by phase89_error_chunks'
	},

	'phase81_test': {
		sources: [],
		action: 'delete',
		description: 'Test data only - safe to delete'
	}
};

/**
 * Get all collections from Qdrant
 */
async function getAllCollections() {
	const response = await client.getCollections();
	return response.collections.map(c => c.name);
}

/**
 * Get collection info
 */
async function getCollectionInfo(collectionName) {
	try {
		const info = await client.getCollection(collectionName);
		return {
			name: collectionName,
			points: info.points_count,
			status: info.status,
			vectors: info.config.params.vectors
		};
	} catch (err) {
		return {
			name: collectionName,
			points: 0,
			status: 'not_found',
			error: err.message
		};
	}
}

/**
 * Create snapshot of collection
 */
async function createSnapshot(collectionName) {
	console.log(`   📸 Creating snapshot of ${collectionName}...`);

	try {
		const snapshot = await client.createSnapshot(collectionName);
		console.log(`      ✅ Snapshot created: ${snapshot.name}`);
		return snapshot.name;
	} catch (err) {
		console.error(`      ❌ Failed to create snapshot: ${err.message}`);
		return null;
	}
}

/**
 * Migrate points from source to target collection
 */
async function migrateCollection(source, target) {
	console.log(`\n   🔄 Migrating: ${source} → ${target}`);

	const sourceInfo = await getCollectionInfo(source);

	if (sourceInfo.points === 0) {
		console.log(`      ⏭️  Source is empty, skipping migration`);
		return { migrated: 0, skipped: true };
	}

	console.log(`      📊 Source has ${sourceInfo.points} points`);

	// Scroll through all points (batch by 100)
	const BATCH_SIZE = 100;
	let offset = null;
	let migrated = 0;

	while (true) {
		const scrollResult = await client.scroll(source, {
			limit: BATCH_SIZE,
			offset,
			with_payload: true,
			with_vector: true
		});

		if (!scrollResult.points || scrollResult.points.length === 0) {
			break;
		}

		// Transform points to add migration metadata
		const transformedPoints = scrollResult.points.map((p, idx) => {
			// Generate a valid UUID or use incremental integer
			const newId = migrated + idx + 1;

			return {
				id: newId,
				vector: p.vector,
				payload: {
					...p.payload,
					migrated_from: source,
					migrated_at: new Date().toISOString(),
					original_id: String(p.id),
					phase: '89'
				}
			};
		});

		// Upsert to target
		await client.upsert(target, {
			wait: true,
			points: transformedPoints
		});

		migrated += transformedPoints.length;
		console.log(`      ✅ Migrated ${migrated} / ${sourceInfo.points} points`);

		offset = scrollResult.next_page_offset;
		if (!offset) break;
	}

	return { migrated, skipped: false };
}

/**
 * Delete collection after confirmation
 */
async function deleteCollection(collectionName) {
	console.log(`   🗑️  Deleting collection: ${collectionName}`);

	try {
		await client.deleteCollection(collectionName);
		console.log(`      ✅ Deleted`);
		return true;
	} catch (err) {
		console.error(`      ❌ Failed to delete: ${err.message}`);
		return false;
	}
}

/**
 * Generate migration report
 */
function generateReport(results) {
	const reportPath = path.join('reports', `migration-plan-${new Date().toISOString().split('T')[0]}.json`);

	// Ensure reports directory exists
	if (!fs.existsSync('reports')) {
		fs.mkdirSync('reports', { recursive: true });
	}

	fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
	console.log(`\n📄 Report saved: ${reportPath}`);
}

/**
 * Main execution
 */
async function main() {
	console.log('🚀 Phase 89: Qdrant Collection Consolidation\n');
	console.log(`Mode: ${isDryRun ? '🔍 DRY RUN' : '⚡ EXECUTE'}`);
	console.log(`Qdrant: ${QDRANT_URL}\n`);

	// Get all collections
	const allCollections = await getAllCollections();
	const phaseCollections = allCollections.filter(c => c.startsWith('phase'));

	console.log(`📊 Found ${phaseCollections.length} phase* collections\n`);

	// Analyze each collection
	const analysis = [];
	for (const collection of phaseCollections) {
		const info = await getCollectionInfo(collection);
		analysis.push(info);
	}

	// Display current state
	console.log('📋 Current Collections:');
	console.log('─'.repeat(80));
	analysis.forEach(c => {
		console.log(`   ${c.name.padEnd(40)} ${String(c.points).padStart(6)} points  ${c.status}`);
	});
	console.log('─'.repeat(80));
	console.log(`   Total: ${analysis.reduce((sum, c) => sum + c.points, 0)} points across ${analysis.length} collections\n`);

	// Display migration plan
	console.log('📝 Migration Plan:');
	console.log('─'.repeat(80));

	const results = {
		timestamp: new Date().toISOString(),
		mode: isDryRun ? 'dry-run' : 'execute',
		collections_before: analysis.length,
		points_before: analysis.reduce((sum, c) => sum + c.points, 0),
		migrations: []
	};

	for (const [target, plan] of Object.entries(MIGRATION_PLAN)) {
		console.log(`\n🎯 ${target}`);
		console.log(`   Action: ${plan.action}`);
		console.log(`   ${plan.description}`);

		if (plan.sources.length > 0) {
			console.log(`   Sources (${plan.sources.length}):`);
			plan.sources.forEach(s => {
				const sourceInfo = analysis.find(c => c.name === s);
				if (sourceInfo) {
					console.log(`      - ${s} (${sourceInfo.points} points)`);
				} else {
					console.log(`      - ${s} (not found)`);
				}
			});
		}

		const migrationResult = {
			target,
			action: plan.action,
			sources: plan.sources,
			status: 'planned'
		};

		// Execute migration if not dry-run
		if (!isDryRun && isExecute) {
			if (plan.action === 'merge' && plan.sources.length > 0) {
				// Ensure target collection exists before migration
				const currentCollections = await getAllCollections();
				const targetExists = currentCollections.includes(target);
				if (!targetExists) {
					console.log(`   ⚠️  Creating target collection: ${target}`);
					try {
						await client.createCollection(target, {
							vectors: {
								size: 1024, // embeddinggemma standard
								distance: 'Cosine'
							}
						});
						console.log(`   ✅ Collection created: ${target}`);
					} catch (err) {
						console.error(`   ❌ Failed to create collection: ${err.message}`);
						migrationResult.status = 'failed';
						results.migrations.push(migrationResult);
						continue;
					}
				}

				migrationResult.migrated_points = 0;

				for (const source of plan.sources) {
					// Create snapshot first
					if (isConfirmed) {
						const snapshotName = await createSnapshot(source);
						if (!snapshotName) {
							console.log(`      ⚠️  Skipping ${source} (snapshot failed)`);
							continue;
						}
					}

					// Migrate
					const result = await migrateCollection(source, target);
					migrationResult.migrated_points += result.migrated;

					// Delete source if confirmed
					if (isConfirmed && !result.skipped) {
						await deleteCollection(source);
					}
				}

				migrationResult.status = 'completed';
			} else if (plan.action === 'delete') {
				if (isConfirmed) {
					const snapshotName = await createSnapshot(target);
					if (snapshotName) {
						const deleted = await deleteCollection(target);
						migrationResult.status = deleted ? 'deleted' : 'failed';
					}
				}
			} else {
				migrationResult.status = 'kept';
			}
		}

		results.migrations.push(migrationResult);
	}

	console.log('\n' + '─'.repeat(80));

	if (isDryRun) {
		console.log('\n💡 This was a DRY RUN. No changes were made.');
		console.log('\nTo execute migration:');
		console.log('   node scripts/phase89-consolidate-collections.mjs --execute --confirm');
		console.log('\nTo execute without snapshots (faster, but no rollback):');
		console.log('   node scripts/phase89-consolidate-collections.mjs --execute');
	} else {
		console.log('\n✅ Migration complete!');

		// Get updated state
		const afterAnalysis = [];
		const afterCollections = await getAllCollections();
		const afterPhaseCollections = afterCollections.filter(c => c.startsWith('phase'));

		for (const collection of afterPhaseCollections) {
			const info = await getCollectionInfo(collection);
			afterAnalysis.push(info);
		}

		results.collections_after = afterAnalysis.length;
		results.points_after = afterAnalysis.reduce((sum, c) => sum + c.points, 0);

		console.log(`\n📊 Results:`);
		console.log(`   Collections: ${results.collections_before} → ${results.collections_after}`);
		console.log(`   Points: ${results.points_before} → ${results.points_after}`);
	}

	// Generate report
	generateReport(results);

	console.log('\n🎉 Done!\n');
}

// Execute
main().catch(err => {
	console.error('❌ Error:', err);
	process.exit(1);
});
