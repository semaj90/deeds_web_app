#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

async function loadValidation(input){
	if(!existsSync(input)) return null;
	try{ const txt = await fs.readFile(input,'utf8'); return JSON.parse(txt); }catch(e){ return null; }
}

function classifyContent(text){
	if(!text || text.trim().length===0) return 'empty';
	const t = text.trimLeft();
	if(t.startsWith('{')) return 'object-json';
	if(t.startsWith('[')) return 'array-json';
	// ndjson heuristic: multiple lines each starting with { or [
	const lines = text.split(/\r?\n/).filter(Boolean);
	if(lines.length>1 && lines.slice(0,5).every(l=>l.trim().startsWith('{')||l.trim().startsWith('['))) return 'ndjson';
	// otherwise not-json or partial
	try{ JSON.parse(text); return 'valid-json'; }catch(e){
		// if error indicates unexpected end, call truncated
		const msg = String(e).toLowerCase();
		if(msg.includes('unexpected end') || msg.includes('expected value')) return 'truncated-json';
		return 'not-json';
	}
}

async function main(){
	const args = process.argv.slice(2);
	const input = args[0] || path.join(process.cwd(), '.tmp', 'simd-native-bridge-validation.json');
	const val = await loadValidation(input);
	const outJson = path.join(process.cwd(), '.tmp', 'json-packet-integrity.json');
	await fs.mkdir(path.dirname(outJson), { recursive: true });

	if(!val){
		const fallback = { checkedAt: new Date().toISOString(), error: 'validation input not found', input };
		await fs.writeFile(outJson, JSON.stringify(fallback, null, 2), 'utf8');
		console.log('No validation input; wrote fallback:', outJson);
		process.exit(0);
	}

	const total = val.total_files || 0;
	const ok = val.ok_count || 0;
	const err = val.err_count || 0;
	const errors = val.errors || [];

	const details = [];
	for(const e of errors){
		const p = e.path;
		const item = { path: p, input_index: e.input_index, parser_mode: e.parser_mode, error: e.error };
		if(p && existsSync(p)){
			try{ const txt = await fs.readFile(p,'utf8'); item.classification = classifyContent(txt); item.sample = txt.slice(0,400); }catch(ex){ item.classification = 'unreadable'; item.read_error = String(ex); }
		} else {
			item.classification = 'missing-file';
		}
		details.push(item);
	}

	// Basic packet-type heuristics based on content/sample
	const counts = { ace:0, nes:0, opencode:0, atlas:0, unknown:0, not_json:0 };
	for(const d of details){
		const s = (d.sample||'').toLowerCase();
		if(d.classification==='missing-file' || d.classification==='unreadable') { counts.unknown++; continue; }
		if(d.classification==='not-json' || d.classification==='truncated-json') { counts.not_json++; continue; }
		if(s.includes('embedding_768') || s.includes('clusterid') || s.includes('record_id') || s.includes('summary')){ counts.ace++; continue; }
		if(s.includes('nes') || s.includes('glyph') || s.includes('sombmu')){ counts.nes++; continue; }
		if(s.includes('opencode') || s.includes('code_snippet') || s.includes('openCode')){ counts.opencode++; continue; }
		if(s.includes('parents') || s.includes('source') || s.includes('atlas')){ counts.atlas++; continue; }
		counts.unknown++;
	}

	const report = { checkedAt: new Date().toISOString(), input, total_files: total, ok_count: ok, err_count: err, counts, details_count: details.length };
	await fs.writeFile(outJson, JSON.stringify(report, null, 2), 'utf8');

	const outMd = path.join(process.cwd(), '.tmp', 'json-packet-integrity.md');
	const md = [];
	md.push('# JSON Packet Integrity Report');
	md.push(`checkedAt: ${report.checkedAt}`);
	md.push('');
	md.push('## Summary');
	md.push('');
	md.push(`- total_files: ${total}`);
	md.push(`- ok_count: ${ok}`);
	md.push(`- err_count: ${err}`);
	md.push('');
	md.push('## Packet Type Heuristics');
	for(const k of Object.keys(counts)) md.push(`- ${k}: ${counts[k]}`);
	md.push('');
	md.push('## Sample Errors');
	for(const d of details.slice(0,20)) md.push(`- ${d.path} — ${d.error} — class=${d.classification}`);
	await fs.writeFile(outMd, md.join('\n'), 'utf8');

	console.log('Wrote packet integrity report:', outJson, outMd);
}

main().catch(e=>{ console.error(e); process.exit(1); });

