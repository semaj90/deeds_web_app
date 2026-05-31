#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

async function loadIntegrity(input){
	if(!existsSync(input)) return null;
	try{ const txt = await fs.readFile(input,'utf8'); return JSON.parse(txt); }catch(e){ return null; }
}

async function main(){
	const args = process.argv.slice(2);
	const input = args[0] || path.join(process.cwd(), '.tmp', 'json-packet-integrity.json');
	const integrity = await loadIntegrity(input);
	const outJson = path.join(process.cwd(), '.tmp', 'atlas-parent-join-readiness.json');
	await fs.mkdir(path.dirname(outJson), { recursive: true });

	if(!integrity){
		const fallback = { checkedAt: new Date().toISOString(), error: 'integrity input not found', input };
		await fs.writeFile(outJson, JSON.stringify(fallback, null, 2), 'utf8');
		console.log('No integrity input; wrote fallback:', outJson);
		process.exit(0);
	}

	const total = integrity.total_files || 0;
	const ok = integrity.ok_count || 0;
	const err = integrity.err_count || 0;
	const notJson = (integrity.counts && integrity.counts.not_json) || 0;

	const okRate = total>0 ? ok/total : 0;
	// readiness heuristics
	const thresholds = { okRate: 0.9, maxErrorsAbsolute: Math.max(10, Math.ceil(0.02*total)) };
	const ready = okRate >= thresholds.okRate && err <= thresholds.maxErrorsAbsolute && notJson===0;

	const report = { checkedAt: new Date().toISOString(), total_files: total, ok_count: ok, err_count: err, okRate, thresholds, ready };
	await fs.writeFile(outJson, JSON.stringify(report, null, 2), 'utf8');

	const outMd = path.join(process.cwd(), '.tmp', 'atlas-parent-join-readiness.md');
	const md = [];
	md.push('# Atlas Parent-Join Readiness Preflight');
	md.push(`checkedAt: ${report.checkedAt}`);
	md.push('');
	md.push('## Metrics');
	md.push(`- total_files: ${total}`);
	md.push(`- ok_count: ${ok}`);
	md.push(`- err_count: ${err}`);
	md.push(`- okRate: ${okRate.toFixed(3)}`);
	md.push('');
	md.push('## Heuristics');
	md.push(`- required okRate >= ${thresholds.okRate}`);
	md.push(`- maxErrorsAbsolute = ${thresholds.maxErrorsAbsolute}`);
	md.push('');
	md.push(`## Decision: ${report.ready ? 'READY' : 'NOT READY'}`);
	md.push('');
	if(!report.ready){
		md.push('### Reasons and next steps');
		if(okRate < thresholds.okRate) md.push('- okRate below threshold — investigate parser failures, increase worker-pool routing for large files.');
		if(err > thresholds.maxErrorsAbsolute) md.push('- too many errors — inspect `.tmp/json-packet-integrity.json` details and fix corrupted inputs.');
		if((integrity.counts && integrity.counts.not_json) > 0) md.push('- non-JSON or truncated files detected — re-fetch or repair ingestion source.');
	} else {
		md.push('- Basic heuristics passed. Proceed to parent-join in a guarded rollout.');
	}

	await fs.writeFile(outMd, md.join('\n'), 'utf8');
	console.log('Wrote preflight readiness report:', outJson, outMd);
}

main().catch(e=>{ console.error(e); process.exit(1); });
