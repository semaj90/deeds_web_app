#!/usr/bin/env node
/**
 * Regenerates the SPZ v4 test fixtures in src/lib/splat/fixtures from Niantic's official C++ tools.
 *
 * Pipeline per SH degree d (0..4):
 *   deterministic binary little-endian 3DGS PLY  ->  ply_to_spz (official encoder)  ->  .spz fixture
 *   .spz  ->  spz_to_ply (official decoder)  ->  expected values (JSON)
 *
 * Usage (from sveltekit-frontend):
 *   node scripts/splat/generate-spz-fixtures.mjs --tools "C:\Users\james\Videos\spz-ref\build"
 *
 * --tools  Directory with ply_to_spz(.exe) and spz_to_ply(.exe). Also read from env SPZ_TOOLS_DIR.
 * --out    Fixture output directory (default: src/lib/splat/fixtures).
 *
 * The reference tools need zlib.dll on PATH (the build puts it in _deps/zlib-build). This script adds that
 * folder to PATH when it exists. Build provenance: nianticlabs/spz commit 11312e4ad836ed06e3da2f3d5b633688d17ebebb (MIT).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');

function arg(name, fallback) {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const toolsDir = arg('--tools', process.env.SPZ_TOOLS_DIR);
if (!toolsDir) {
	console.error('Missing --tools <dir> (or SPZ_TOOLS_DIR). Expected ply_to_spz and spz_to_ply inside it.');
	process.exit(2);
}
const outDir = path.resolve(arg('--out', path.join(projectRoot, 'src', 'lib', 'splat', 'fixtures')));
fs.mkdirSync(outDir, { recursive: true });

const exe = (name) => path.join(toolsDir, process.platform === 'win32' ? `${name}.exe` : name);
const zlibDir = path.join(toolsDir, '_deps', 'zlib-build');
const env = { ...process.env, PATH: `${fs.existsSync(zlibDir) ? zlibDir + path.delimiter : ''}${process.env.PATH}` };
for (const tool of ['ply_to_spz', 'spz_to_ply']) {
	if (!fs.existsSync(exe(tool))) {
		console.error(`Tool not found: ${exe(tool)}`);
		process.exit(2);
	}
}

// Points per degree. Degree 0 keeps 5 points to match the committed fixture names.
const POINTS = { 0: 5, 1: 3, 2: 3, 3: 3, 4: 3 };
const FILE_SUFFIX = { 0: '5pt', 1: '3pt', 2: '3pt', 3: '3pt', 4: '3pt' };

/** Deterministic pseudo-random in [0,1) from integers; no RNG state, so output is reproducible. */
function unit(a, b, c) {
	const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
	return x - Math.floor(x);
}

function buildPly(degree) {
	const n = POINTS[degree];
	const K = (degree + 1) * (degree + 1) - 1;
	const names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
	for (let i = 0; i < K * 3; i++) names.push(`f_rest_${i}`);
	names.push('opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3');
	const header =
		`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\n` +
		names.map((k) => `property float ${k}`).join('\n') +
		'\nend_header\n';
	const body = Buffer.alloc(n * names.length * 4);
	let off = 0;
	for (let p = 0; p < n; p++) {
		const q = [0, 1, 2, 3].map((k) => unit(p, k, degree) * 2 - 1);
		const len = Math.hypot(...q) || 1;
		const row = {
			x: unit(p, 1, degree) * 4 - 2,
			y: unit(p, 2, degree) * 4 - 2,
			z: unit(p, 3, degree) * 4 - 2,
			f_dc_0: unit(p, 4, degree) - 0.5,
			f_dc_1: unit(p, 5, degree) - 0.5,
			f_dc_2: unit(p, 6, degree) - 0.5,
			opacity: unit(p, 7, degree) * 6 - 3,
			scale_0: -unit(p, 8, degree) * 5,
			scale_1: -unit(p, 9, degree) * 5,
			scale_2: -unit(p, 10, degree) * 5,
			rot_0: q[0] / len,
			rot_1: q[1] / len,
			rot_2: q[2] / len,
			rot_3: q[3] / len
		};
		for (let i = 0; i < K * 3; i++) row[`f_rest_${i}`] = unit(p, 20 + i, degree) * 1.6 - 0.8;
		for (const k of names) {
			body.writeFloatLE(row[k], off);
			off += 4;
		}
	}
	return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

/** Read the binary little-endian PLY written by spz_to_ply into one object per vertex. */
function readPly(file) {
	const b = fs.readFileSync(file);
	const endTag = Buffer.from('end_header\n');
	const dataStart = b.indexOf(endTag) + endTag.length;
	const hd = b.subarray(0, dataStart).toString('ascii').split('\n');
	const n = Number(hd.find((l) => l.startsWith('element vertex')).split(' ')[2]);
	const props = hd.filter((l) => l.startsWith('property float ')).map((l) => l.split(' ')[2]);
	const stride = props.length * 4;
	const rows = [];
	for (let i = 0; i < n; i++) {
		const r = {};
		props.forEach((p, j) => (r[p] = b.readFloatLE(dataStart + i * stride + j * 4)));
		rows.push(r);
	}
	return rows;
}

const tmp = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'spz-fixtures-'));
let generated = 0;
for (const degree of [0, 1, 2, 3, 4]) {
	const K = (degree + 1) * (degree + 1) - 1;
	const plyIn = path.join(tmp, `degree${degree}.ply`);
	const spzOut = path.join(tmp, `degree${degree}.spz`);
	const plyRef = path.join(tmp, `degree${degree}-ref.ply`);
	fs.writeFileSync(plyIn, buildPly(degree));
	execFileSync(exe('ply_to_spz'), [plyIn, spzOut], { env, stdio: 'ignore' });
	execFileSync(exe('spz_to_ply'), [spzOut, plyRef], { env, stdio: 'ignore' });

	const rows = readPly(plyRef);
	const expected = {
		points: rows.map((r) => {
			const point = {
				pos: [r.x, r.y, r.z],
				alpha: r.opacity,
				color: [r.f_dc_0, r.f_dc_1, r.f_dc_2],
				scale: [r.scale_0, r.scale_1, r.scale_2],
				rot_xyzw: [r.rot_1, r.rot_2, r.rot_3, r.rot_0]
			};
			if (K > 0) point.sh_channel_major = Array.from({ length: K * 3 }, (_, i) => r[`f_rest_${i}`]);
			return point;
		})
	};
	const base = `niantic-official-degree${degree}-${FILE_SUFFIX[degree]}`;
	fs.copyFileSync(spzOut, path.join(outDir, `${base}.spz`));
	const expectedName = degree === 0 ? 'expected-degree0.json' : `expected-degree${degree}.json`;
	fs.writeFileSync(path.join(outDir, expectedName), JSON.stringify(expected, null, 1));
	generated++;
	console.log(`degree ${degree}: ${rows.length} points -> ${base}.spz (${fs.statSync(spzOut).size} bytes)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`done: ${generated} fixture sets written to ${path.relative(projectRoot, outDir) || outDir}`);
