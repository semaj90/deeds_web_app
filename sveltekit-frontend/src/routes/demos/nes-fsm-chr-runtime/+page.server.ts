import type { PageServerLoad } from './$types.js';
import {
	CHR_BANK_BYTES,
	CHR_TILE_BYTES,
	NESCHROM97_METADATA_BYTES,
	buildParentAtlasChrRom8KiB,
	encodeTextToNametable,
	getDomainIconTileIndex,
	packNesChrom97MetadataGlyph8B,
	unpackNesChrom97MetadataGlyph8B,
} from '$lib/atlas/chr-glyph-atlas-v1.js';
import { runNesFsmNativeRuntimeV1 } from '$lib/server/atlas/fsm/nes-fsm-native-runtime-v1.js';

export const load: PageServerLoad = () => {
	const report = runNesFsmNativeRuntimeV1();
	const chrBank = buildParentAtlasChrRom8KiB();
	const lead = report.sortedRecords[0]!;
	const leadIconTile = getDomainIconTileIndex(lead.primaryLutByte);

	const bannerText = `CASE EVIDENCE READY\nORD ${lead.candidateOrdinal} LUT ${lead.primaryLutByte} ${report.taskTransition.toState}`;
	const nametable = encodeTextToNametable(bannerText, 24, leadIconTile);

	const chrom97Bytes = packNesChrom97MetadataGlyph8B({
		isExported: true,
		isAsync: false,
		complexity: 3,
		domainClass: lead.primaryLutByte,
		latentCluster: lead.kmeansClusterId,
		authority: 0,
		confidence: 240,
		freshnessDays: 1,
	});
	const chrom97Sample = unpackNesChrom97MetadataGlyph8B(chrom97Bytes);

	return {
		report: {
			canonicalAuthority: report.canonicalAuthority,
			promotionEligible: report.promotionEligible,
			writesPerformed: report.writesPerformed,
			valkeyWritesPerformed: report.valkeyWritesPerformed,
			sourceRevision: report.sourceRevision,
			workspaceRevision: report.workspaceRevision,
			binarySchemaRevision: report.binarySchemaRevision,
			endianness: report.endianness,
			alignmentBytes: report.alignmentBytes,
			descriptorByteLength: report.descriptorByteLength,
			candidateCount: report.candidateCount,
			batchPrimaryLutByte: report.batchPrimaryLutByte,
			batchDomainBitmask: report.batchDomainBitmask,
			batchNesHex: report.batchNesHex,
			candidateOrdinalMapChecksum: report.candidateOrdinalMapChecksum,
			inputBufferChecksum: report.inputBufferChecksum,
			outputBufferChecksum: report.outputBufferChecksum,
			nativeGuards: report.nativeGuards,
			nativeDfaProposal: report.nativeDfaProposal,
			csrResult: {
				totalVisited: report.csrResult.totalVisited,
				discoveredOrdinals: report.csrResult.discoveredOrdinals,
				depthCompleted: report.csrResult.depthCompleted,
				cursor: {
					graphRevision: report.csrResult.cursor.graphRevision,
					edgePolicyRevision: report.csrResult.cursor.edgePolicyRevision,
					discoveryPrefixChecksum: report.csrResult.cursor.discoveryPrefixChecksum,
				},
			},
			taskTransition: report.taskTransition,
			nesFeatureFsmState: report.nesFeatureFsmState,
			bitfrostResidentOrdinals: [...report.bitfrostResidentOrdinals],
			bitfrostAdmittedOrdinals: [...report.bitfrostAdmittedOrdinals],
			bitfrostLeaseReleasedCount: report.bitfrostLeaseReleasedCount,
			bufferSwap: report.bufferSwap,
			readback: report.readback,
			sortedRecords: report.sortedRecords.map((r) => ({
				candidateOrdinal: r.candidateOrdinal,
				kmeansClusterId: r.kmeansClusterId,
				somBmuId: r.somBmuId,
				sourceIndex: r.sourceIndex,
				primaryLutByte: r.primaryLutByte,
				domainBitmask: r.domainBitmask,
				featureLabel: r.featureLabel,
				nesHex: r.nesHex,
				nesPaletteByte: r.nesPaletteByte,
				bitfrostState: r.bitfrostState,
				sortedRank: r.sortedRank,
				tokenCount: r.tokenCount,
			})),
			descriptorHexPreview: report.descriptorHex.slice(0, 128),
			blockedProductionGates: [...report.blockedProductionGates],
		},
		chr: {
			bankByteLength: chrBank.byteLength,
			expectedBankBytes: CHR_BANK_BYTES,
			tileBytes: CHR_TILE_BYTES,
			chrom97Bytes: NESCHROM97_METADATA_BYTES,
			chrBankArray: Array.from(chrBank),
			nametableColumns: nametable.columns,
			nametableRows: nametable.rows,
			nametableTiles: Array.from(nametable.tiles),
			leadIconTile,
			chrom97Sample: {
				...chrom97Sample,
				hex: Array.from(chrom97Bytes, (b) => b.toString(16).padStart(2, '0')).join(' '),
			},
		},
	};
};
