#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function resolveCppBinary() {
	const override = process.env.ATLAS_NES_FSM_CPP_PARITY_BINARY;
	if (override) {
		const resolved = path.resolve(repoRoot, override);
		if (!existsSync(resolved)) throw new Error(`CPP_PARITY_BINARY_OVERRIDE_MISSING: ${resolved}`);
		return resolved;
	}
	const winBin = path.join(repoRoot, 'packages/atlas-native-core/build/Release/nes_fsm_runtime_parity_smoke.exe');
	const linuxBin = path.join(repoRoot, 'packages/atlas-native-core/build/nes_fsm_runtime_parity_smoke');
	if (existsSync(linuxBin)) {
		return linuxBin;
	}
	if (process.platform === 'win32' && existsSync(winBin)) {
		return winBin;
	}
	throw new Error(`CPP_PARITY_BINARY_MISSING: checked ${winBin} and ${linuxBin}`);
}

function runCppParity() {
	const bin = resolveCppBinary();
	if (process.platform === 'win32' && !bin.endsWith('.exe')) {
		const wslRepo = `/mnt/${repoRoot[0].toLowerCase()}${repoRoot.slice(2).replace(/\\/g, '/')}`;
		const relBin = path.relative(repoRoot, bin).replace(/\\/g, '/');
		const stdout = execFileSync('wsl', ['-e', 'bash', '-lc', `cd "${wslRepo}" && ./${relBin} --emit-json`], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		return { command: `wsl -e bash -lc 'cd "${wslRepo}" && ./${relBin} --emit-json'`, data: JSON.parse(stdout.trim()) };
	}
	const stdout = execFileSync(bin, ['--emit-json'], { cwd: repoRoot, encoding: 'utf8' });
	return { command: `${path.relative(repoRoot, bin).replace(/\\/g, '/')} --emit-json`, data: JSON.parse(stdout.trim()) };
}

function runPythonParity() {
	const pyCmd = '/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python';
	if (process.platform === 'win32') {
		const wslRepo = `/mnt/${repoRoot[0].toLowerCase()}${repoRoot.slice(2).replace(/\\/g, '/')}`;
		const stdout = execFileSync(
			'wsl',
			['-e', 'bash', '-lc', `cd "${wslRepo}" && ${pyCmd} python/tests/test_nes_fsm_native_runtime_parity_v1.py --emit-json`],
			{ cwd: repoRoot, encoding: 'utf8' }
		);
		return {
			command: `wsl -e bash -lc 'cd "${wslRepo}" && ${pyCmd} python/tests/test_nes_fsm_native_runtime_parity_v1.py --emit-json'`,
			data: JSON.parse(stdout.trim()),
		};
	}
	const stdout = execFileSync(pyCmd, ['python/tests/test_nes_fsm_native_runtime_parity_v1.py', '--emit-json'], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return { command: `${pyCmd} python/tests/test_nes_fsm_native_runtime_parity_v1.py --emit-json`, data: JSON.parse(stdout.trim()) };
}

function runTypeScriptParity() {
	const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
	const runtimeModuleUrl = pathToFileURL(
		path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts')
	).href;
	const packetModuleUrl = pathToFileURL(
		path.join(repoRoot, 'sveltekit-frontend/src/lib/server/atlas/fsm/nes-fsm-binary-packet-v1.ts')
	).href;
	const evalCode = `
import { runNesFsmNativeRuntimeV1 } from ${JSON.stringify(runtimeModuleUrl)};
import { materializeNesFsmBinaryPacketV1 } from ${JSON.stringify(packetModuleUrl)};
const r = runNesFsmNativeRuntimeV1();
const packet = materializeNesFsmBinaryPacketV1(r);
console.log(JSON.stringify({
	runtime: 'typescript',
	sourceRevision: r.sourceRevision,
	workspaceRevision: r.workspaceRevision,
	binarySchemaRevision: r.binarySchemaRevision,
	endianness: r.endianness,
	serializedLayoutAlignmentBytes: r.serializedLayoutAlignmentBytes,
	descriptorByteLength: r.descriptorByteLength,
	candidateOrdinalMapChecksum: r.candidateOrdinalMapChecksum,
	inputBufferChecksum: r.inputBufferChecksum,
	outputBufferChecksum: r.outputBufferChecksum,
	csrTotalVisited: r.csrResult.totalVisited,
	csrDiscoveryPrefixChecksum: r.csrResult.cursor.discoveryPrefixChecksum,
	sortedOrdinals: r.sortedRecords.map((x) => x.candidateOrdinal),
	residentCount: r.bitfrostResidentOrdinals.length,
	admittedCount: r.bitfrostAdmittedOrdinals.length,
	nativeGuards: r.nativeGuards,
	taskTransition: r.taskTransition,
	nesFeatureFsmState: r.nesFeatureFsmState,
	bufferSwap: r.bufferSwap,
	readback: r.readback,
	descriptorHex: r.descriptorHex,
	canonicalAuthority: r.canonicalAuthority,
	promotionEligible: r.promotionEligible,
	writesPerformed: r.writesPerformed,
	valkeyWritesPerformed: r.valkeyWritesPerformed,
	blockedProductionGates: r.blockedProductionGates,
	binaryPacket: {
		schema: packet.packet.schema,
		scope: packet.packet.scope,
		payloadByteLength: packet.payload.byteLength,
		payloadSha256: packet.packet.payloadSha256,
		candidateMapEntries: packet.packet.candidateMap.length,
		sortedOrdinalCount: packet.packet.sortedCandidateOrdinals.length,
		endianness: packet.packet.endianness,
		serializedLayoutAlignmentBytes: packet.packet.serializedLayoutAlignmentBytes,
		canonicalAuthority: packet.packet.canonicalAuthority,
		writesPerformed: packet.packet.writesPerformed,
		readbackValidated: packet.readback.payloadDigestMatch && packet.readback.ordinalMapPrefixMatch && packet.readback.csrCursorPrefixMatch
	}
}));
`;
	const stdout = execFileSync(process.execPath, [tsxCli, '--eval', evalCode], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	return { command: 'node node_modules/tsx/dist/cli.mjs --eval runNesFsmNativeRuntimeV1()', data: JSON.parse(stdout.trim()) };
}

function assertEqual(field, a, b, c) {
	const sa = JSON.stringify(a);
	const sb = JSON.stringify(b);
	const sc = JSON.stringify(c);
	if (sa !== sb || sa !== sc) {
		throw new Error(`CROSS_LANGUAGE_PARITY_MISMATCH on ${field}:\n  TS:  ${sa}\n  CPP: ${sb}\n  PY:  ${sc}`);
	}
}

const cpp = runCppParity();
const py = runPythonParity();
const ts = runTypeScriptParity();

for (const field of [
	'sourceRevision',
	'binarySchemaRevision',
	'endianness',
	'serializedLayoutAlignmentBytes',
	'descriptorByteLength',
	'candidateOrdinalMapChecksum',
	'inputBufferChecksum',
	'outputBufferChecksum',
	'csrTotalVisited',
	'csrDiscoveryPrefixChecksum',
	'sortedOrdinals',
	'residentCount',
	'admittedCount',
	'descriptorHex',
	'canonicalAuthority',
	'promotionEligible',
]) {
	assertEqual(field, ts.data[field], cpp.data[field], py.data[field]);
}

if (ts.data.canonicalAuthority !== false || ts.data.promotionEligible !== false || ts.data.writesPerformed !== false || ts.data.valkeyWritesPerformed !== false) {
	throw new Error('NON_CANONICAL_INVARIANT_VIOLATED');
}

const receipt = {
	schema: 'atlas.parent-atlas-nes-fsm-native-runtime-receipt.v1',
	taskId: 'PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01',
	status: 'PASS_PARITY_VERIFIED',
	revisionScope: 'fixture-only; source/workspace revisions are stable fixture identities, not live repository revisions',
	canonicalAuthority: false,
	promotionEligible: false,
	writesPerformed: false,
	valkeyWritesPerformed: false,
	sourceRevision: ts.data.sourceRevision,
	workspaceRevision: ts.data.workspaceRevision,
	binarySchemaRevision: ts.data.binarySchemaRevision,
	endianness: ts.data.endianness,
	serializedLayoutAlignmentBytes: ts.data.serializedLayoutAlignmentBytes,
	descriptorByteLength: ts.data.descriptorByteLength,
	candidateOrdinalMapChecksum: ts.data.candidateOrdinalMapChecksum,
	inputBufferChecksum: ts.data.inputBufferChecksum,
	outputBufferChecksum: ts.data.outputBufferChecksum,
	binaryPacket: ts.data.binaryPacket,
	transitionAndAuthorization: {
		taskTransition: ts.data.taskTransition,
		nesFeatureFsmState: ts.data.nesFeatureFsmState,
		policyAuthorizationMaskHex: `0x${ts.data.readback.policyAuthorizationMask.toString(16)}`,
		authorityFlagsByteHex: `0x${ts.data.readback.authorityFlagsByte.toString(16).padStart(2, '0')}`,
		bitfrostResidentCount: ts.data.residentCount,
		bitfrostAdmittedCount: ts.data.admittedCount,
		bufferSwap: ts.data.bufferSwap,
		csrTotalVisited: ts.data.csrTotalVisited,
		csrDiscoveryPrefixChecksum: ts.data.csrDiscoveryPrefixChecksum,
	},
	nativeGuards: ts.data.nativeGuards,
	crossLanguageParity: {
		matchedFields: [
			'sourceRevision',
			'binarySchemaRevision',
			'endianness',
			'serializedLayoutAlignmentBytes',
			'descriptorByteLength',
			'candidateOrdinalMapChecksum',
			'inputBufferChecksum',
			'outputBufferChecksum',
			'csrTotalVisited',
			'csrDiscoveryPrefixChecksum',
			'sortedOrdinals',
			'residentCount',
			'admittedCount',
			'descriptorHex',
			'canonicalAuthority',
			'promotionEligible',
		],
		cppNegativeGatesPassed: cpp.data.negativeGatesPassed === true,
		descriptorHexLength: ts.data.descriptorHex.length,
		commands: {
			cpp: cpp.command,
			python: py.command,
			typescript: ts.command,
		},
	},
	blockedProductionGates: ts.data.blockedProductionGates,
};

const outPath = path.join(repoRoot, 'docs/reports/parent-atlas-nes-fsm-native-runtime-01.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

console.log(
	JSON.stringify(
		{
			status: receipt.status,
			outputBufferChecksum: receipt.outputBufferChecksum,
			inputBufferChecksum: receipt.inputBufferChecksum,
			candidateOrdinalMapChecksum: receipt.candidateOrdinalMapChecksum,
			descriptorByteLength: receipt.descriptorByteLength,
			sortedOrdinals: ts.data.sortedOrdinals,
			reportPath: path.relative(repoRoot, outPath).replace(/\\/g, '/'),
		},
		null,
		2
	)
);
