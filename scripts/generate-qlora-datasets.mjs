/**
 * Generate QLoRA training datasets from fictional cases + canonical chunks.
 *
 * Produces 3 JSONL files referenced by /api/admin/qlora:
 *   1. legal-qa-pairs.jsonl     — Citation discipline (question → answer with chunk citations)
 *   2. case-summaries.jsonl     — Case narrative → structured summary
 *   3. statute-analysis.jsonl   — Statute text → plain language analysis
 *
 * Usage: node scripts/generate-qlora-datasets.mjs [--output-dir <dir>]
 *
 * Output dir defaults to: scripts/training-datasets/
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;
const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
});

const outputDir = process.argv.includes('--output-dir')
	? process.argv[process.argv.indexOf('--output-dir') + 1]
	: 'scripts/training-datasets';

// ── Helpers ──
function writeJsonl(filePath, records) {
	const lines = records.map((r) => JSON.stringify(r)).join('\n');
	fs.writeFileSync(filePath, lines + '\n', 'utf8');
	console.log(`  Written: ${filePath} (${records.length} records, ${(Buffer.byteLength(lines) / 1024).toFixed(1)} KB)`);
}

const SYSTEM_CITATION = `You are a legal AI prosecutor assistant. When answering legal questions, you MUST cite specific legal authorities using chunk IDs in [brackets]. Every doctrinal claim needs at least one citation. If you are unsure, say so rather than fabricating citations. All cases discussed are fictional training scenarios.`;

const SYSTEM_SUMMARY = `You are a legal case analyst. Given a fictional case narrative with procedural events, produce a structured analysis covering: (1) key facts, (2) charges and applicable statutes, (3) procedural history, (4) key legal issues, and (5) potential outcomes. Mark all content as fictional training data.`;

const SYSTEM_STATUTE = `You are a legal educator. Given the text of a statute or legal rule, explain it in plain language. Identify: (1) the elements that must be proven, (2) the mental state (mens rea) required, (3) common defenses, and (4) typical penalties or remedies. Keep explanations accessible to non-lawyers while maintaining legal accuracy.`;

// ═══════════════════════════════════════════════════════════════
// Dataset 1: Legal Q&A Pairs (citation discipline)
// ═══════════════════════════════════════════════════════════════
async function generateLegalQAPairs() {
	console.log('\n--- Generating legal-qa-pairs.jsonl ---');

	// Fetch fictional cases with their linked canon chunks
	const { rows: cases } = await pool.query(`
		SELECT fc.id, fc.case_id, fc.category, fc.charge, fc.primary_statute,
		       fc.defendant_name, fc.jurisdiction, fc.jurisdiction_city,
		       fc.financial_loss, fc.narrative
		FROM fictional_cases fc
		ORDER BY fc.created_at
	`);

	const { rows: charges } = await pool.query(`
		SELECT fcc.fictional_case_id, fcc.charge_name, fcc.statute, fcc.canon_chunk_ids
		FROM fictional_case_charges fcc
	`);

	const { rows: chunks } = await pool.query(`
		SELECT cc.chunk_id, cc.content, cc.semantic_label, cc.key_terms, cc.domains,
		       cd.citation, cd.title, cd.jurisdiction
		FROM canonical_chunks cc
		JOIN canonical_documents cd ON cc.document_id = cd.id
	`);

	const chunkMap = new Map();
	for (const c of chunks) chunkMap.set(c.chunk_id, c);

	const chargesByCase = new Map();
	for (const ch of charges) {
		if (!chargesByCase.has(ch.fictional_case_id)) chargesByCase.set(ch.fictional_case_id, []);
		chargesByCase.get(ch.fictional_case_id).push(ch);
	}

	const records = [];

	for (const c of cases) {
		const caseCharges = chargesByCase.get(c.id) || [];

		// Record type 1: "What are the elements of [charge]?" → Answer citing canon chunks
		for (const ch of caseCharges) {
			let chunkIds = [];
			try { chunkIds = JSON.parse(ch.canon_chunk_ids || '[]'); } catch { /* skip */ }
			if (chunkIds.length === 0) continue;

			const chunkTexts = chunkIds.map((id) => chunkMap.get(id)).filter(Boolean);
			if (chunkTexts.length === 0) continue;

			const citationRefs = chunkTexts.map((ct) => `[${ct.chunk_id}] ${ct.citation}: ${ct.content.slice(0, 200)}`).join('\n');
			const citationIds = chunkTexts.map((ct) => `[${ct.chunk_id}]`).join(', ');

			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_CITATION },
					{
						role: 'user',
						content: `What are the elements of ${ch.charge_name}${ch.statute ? ' under ' + ch.statute : ''}? The defendant ${c.defendant_name} is charged in ${c.jurisdiction_city || c.jurisdiction}.`,
					},
					{
						role: 'assistant',
						content: `Based on the applicable statute ${citationIds}, the elements of ${ch.charge_name} are:\n\n${chunkTexts.map((ct, i) => `${i + 1}. ${ct.content.slice(0, 300)}`).join('\n\n')}\n\nTo secure a conviction, the prosecution must prove each element beyond a reasonable doubt. See ${citationIds} for the full statutory text.\n\n[FICTIONAL TRAINING SCENARIO — NOT LEGAL ADVICE]`,
					},
				],
			});
		}

		// Record type 2: "Can you analyze [case] for legal issues?" → Answer with chunk refs
		const linkedChunkIds = caseCharges.flatMap((ch) => {
			try { return JSON.parse(ch.canon_chunk_ids || '[]'); } catch { return []; }
		}).filter((id) => chunkMap.has(id));

		if (linkedChunkIds.length > 0 && c.narrative) {
			const chunkRefs = [...new Set(linkedChunkIds)].map((id) => {
				const ct = chunkMap.get(id);
				return ct ? `[${ct.chunk_id}] (${ct.citation})` : null;
			}).filter(Boolean);

			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_CITATION },
					{
						role: 'user',
						content: `Analyze the following fictional case for key legal issues:\n\nCase: ${c.case_id}\nDefendant: ${c.defendant_name}\nCharge: ${c.charge}\nJurisdiction: ${c.jurisdiction}\n\n${c.narrative.slice(0, 800)}`,
					},
					{
						role: 'assistant',
						content: `Legal Analysis of ${c.case_id} (Fictional)\n\n**Primary Charge:** ${c.charge}${c.primary_statute ? ' (' + c.primary_statute + ')' : ''}\n\n**Key Legal Issues:**\n1. The prosecution must establish the elements defined in ${chunkRefs[0] || 'the applicable statute'}.\n2. Jurisdiction: ${c.jurisdiction} — ${c.jurisdiction === 'US-FED' ? 'federal court has jurisdiction' : 'state court proceedings'}.\n${c.financial_loss ? '3. Financial loss of $' + Number(c.financial_loss).toLocaleString() + ' establishes the harm element.\n' : ''}**Applicable Authority:** ${chunkRefs.join(', ')}\n\n[FICTIONAL TRAINING SCENARIO — NOT LEGAL ADVICE]`,
					},
				],
			});
		}

		// Record type 3: Jurisdiction-specific question
		if (c.jurisdiction !== 'US-FED' && c.primary_statute) {
			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_CITATION },
					{
						role: 'user',
						content: `Does ${c.jurisdiction} have jurisdiction over ${c.charge}? The alleged offense occurred in ${c.jurisdiction_city || c.jurisdiction}.`,
					},
					{
						role: 'assistant',
						content: `In this fictional scenario, jurisdiction in ${c.jurisdiction} is appropriate because the alleged ${c.charge} occurred within ${c.jurisdiction_city || 'the state'}. ${c.primary_statute ? 'The applicable statute is ' + c.primary_statute + '.' : ''} ${c.jurisdiction === 'CA' ? 'Under California law, the superior court has original jurisdiction over felony matters.' : c.jurisdiction === 'NY' ? 'Under New York law, the supreme court has general jurisdiction.' : 'The state court has jurisdiction over offenses committed within its borders.'}\n\n[FICTIONAL TRAINING SCENARIO — NOT LEGAL ADVICE]`,
					},
				],
			});
		}
	}

	return records;
}

// ═══════════════════════════════════════════════════════════════
// Dataset 2: Case Summaries
// ═══════════════════════════════════════════════════════════════
async function generateCaseSummaries() {
	console.log('\n--- Generating case-summaries.jsonl ---');

	const { rows: cases } = await pool.query(`
		SELECT fc.id, fc.case_id, fc.category, fc.charge, fc.primary_statute,
		       fc.defendant_name, fc.incident_date, fc.jurisdiction_city,
		       fc.jurisdiction, fc.financial_loss, fc.narrative
		FROM fictional_cases fc
		ORDER BY fc.created_at
	`);

	const { rows: events } = await pool.query(`
		SELECT fictional_case_id, event_type, event_date, description, order_index
		FROM fictional_case_events
		ORDER BY fictional_case_id, order_index
	`);

	const { rows: actors } = await pool.query(`
		SELECT fictional_case_id, name, role, description
		FROM fictional_case_actors
	`);

	const { rows: charges } = await pool.query(`
		SELECT fictional_case_id, charge_name, statute, is_primary
		FROM fictional_case_charges
	`);

	const eventsByCase = new Map();
	for (const e of events) {
		if (!eventsByCase.has(e.fictional_case_id)) eventsByCase.set(e.fictional_case_id, []);
		eventsByCase.get(e.fictional_case_id).push(e);
	}

	const actorsByCase = new Map();
	for (const a of actors) {
		if (!actorsByCase.has(a.fictional_case_id)) actorsByCase.set(a.fictional_case_id, []);
		actorsByCase.get(a.fictional_case_id).push(a);
	}

	const chargesByCase = new Map();
	for (const ch of charges) {
		if (!chargesByCase.has(ch.fictional_case_id)) chargesByCase.set(ch.fictional_case_id, []);
		chargesByCase.get(ch.fictional_case_id).push(ch);
	}

	const records = [];

	for (const c of cases) {
		const caseEvents = eventsByCase.get(c.id) || [];
		const caseActors = actorsByCase.get(c.id) || [];
		const caseCharges = chargesByCase.get(c.id) || [];

		// Build timeline string
		const timeline = caseEvents
			.sort((a, b) => a.order_index - b.order_index)
			.map((e) => `- ${e.event_date ? new Date(e.event_date).toISOString().slice(0, 10) : 'N/A'}: ${e.event_type.replace(/_/g, ' ')} — ${e.description.slice(0, 120)}`)
			.join('\n');

		const chargeList = caseCharges.map((ch) => `${ch.charge_name}${ch.statute ? ' (' + ch.statute + ')' : ''}`).join('; ');
		const actorList = caseActors.map((a) => `${a.name} (${a.role})`).join('; ');

		// Record: Full case narrative → structured summary
		records.push({
			messages: [
				{ role: 'system', content: SYSTEM_SUMMARY },
				{
					role: 'user',
					content: `Summarize the following fictional case:\n\nCase ID: ${c.case_id}\nCategory: ${c.category.replace(/_/g, ' ')}\nDefendant: ${c.defendant_name}\nJurisdiction: ${c.jurisdiction_city || c.jurisdiction}\nDate: ${c.incident_date ? new Date(c.incident_date).toISOString().slice(0, 10) : 'Unknown'}\n\nNarrative:\n${c.narrative.slice(0, 1200)}\n\nProcedural Timeline:\n${timeline}`,
				},
				{
					role: 'assistant',
					content: `# Case Summary: ${c.case_id} (Fictional)\n\n## Key Facts\n- **Defendant:** ${c.defendant_name}\n- **Charges:** ${chargeList}\n- **Jurisdiction:** ${c.jurisdiction_city || c.jurisdiction} (${c.jurisdiction})\n- **Incident Date:** ${c.incident_date ? new Date(c.incident_date).toISOString().slice(0, 10) : 'Unknown'}\n${c.financial_loss ? '- **Financial Loss:** $' + Number(c.financial_loss).toLocaleString() + '\n' : ''}\n## Parties\n${actorList || 'Defendant only'}\n\n## Procedural History\n${caseEvents.length > 0 ? caseEvents.slice(0, 5).map((e) => `- **${e.event_type.replace(/_/g, ' ').toUpperCase()}** (${e.event_date ? new Date(e.event_date).toISOString().slice(0, 10) : 'N/A'}): ${e.description.slice(0, 150)}`).join('\n') : 'No procedural events recorded.'}\n\n## Key Legal Issues\n1. Whether the prosecution can prove the elements of ${c.charge} beyond a reasonable doubt.\n2. ${c.category === 'wire_fraud' || c.category === 'cybercrime' ? 'Interstate commerce / wire transmission element.' : c.category === 'firearms' ? 'Whether defendant qualifies as a prohibited person under federal law.' : c.category === 'drug_trafficking' ? 'Chain of custody for controlled substance evidence.' : c.category === 'obstruction' ? 'Proof of corrupt intent to impede proceedings.' : 'Applicable standard of proof and damages calculation.'}\n\n[FICTIONAL TRAINING SCENARIO — NOT LEGAL ADVICE]`,
				},
			],
		});

		// Record type 2: Brief summary (shorter format)
		if (c.narrative && c.narrative.length > 200) {
			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_SUMMARY },
					{
						role: 'user',
						content: `Provide a 2-3 sentence summary of: ${c.defendant_name} charged with ${c.charge} in ${c.jurisdiction_city || c.jurisdiction}.`,
					},
					{
						role: 'assistant',
						content: `${c.defendant_name} faces charges of ${c.charge}${c.primary_statute ? ' under ' + c.primary_statute : ''} in ${c.jurisdiction_city || c.jurisdiction}. ${c.narrative.slice(0, 200).replace(/\n/g, ' ')}${c.financial_loss ? ' The alleged financial loss totals $' + Number(c.financial_loss).toLocaleString() + '.' : ''}\n\n[FICTIONAL TRAINING SCENARIO]`,
					},
				],
			});
		}
	}

	return records;
}

// ═══════════════════════════════════════════════════════════════
// Dataset 3: Statute Analysis
// ═══════════════════════════════════════════════════════════════
async function generateStatuteAnalysis() {
	console.log('\n--- Generating statute-analysis.jsonl ---');

	const { rows: chunks } = await pool.query(`
		SELECT cc.chunk_id, cc.content, cc.semantic_label, cc.key_terms, cc.domains,
		       cd.citation, cd.title, cd.jurisdiction, cd.authority_level, cd.doc_type
		FROM canonical_chunks cc
		JOIN canonical_documents cd ON cc.document_id = cd.id
		ORDER BY cd.citation, cc.chunk_index
	`);

	const records = [];

	for (const chunk of chunks) {
		const isStatute = chunk.semantic_label === 'elements_of_offense' || chunk.doc_type === 'statute';
		const isEvidentiary = chunk.semantic_label === 'evidentiary_rule';
		const isHolding = chunk.semantic_label === 'holding';

		// Record type 1: Explain this statute/rule
		records.push({
			messages: [
				{ role: 'system', content: SYSTEM_STATUTE },
				{
					role: 'user',
					content: `Explain the following legal ${isStatute ? 'statute' : isEvidentiary ? 'evidentiary rule' : 'court holding'} in plain language:\n\n**Citation:** ${chunk.citation}\n**Type:** ${chunk.semantic_label || 'general'}\n**Jurisdiction:** ${chunk.jurisdiction || 'Federal'}\n\nText:\n${chunk.content.slice(0, 1500)}`,
				},
				{
					role: 'assistant',
					content: `## ${chunk.citation} — Plain Language Analysis\n\n**Type:** ${(chunk.semantic_label || 'general').replace(/_/g, ' ')}\n**Jurisdiction:** ${chunk.jurisdiction || 'Federal'}\n**Authority Level:** ${chunk.authority_level || 'primary'}\n\n### Summary\n${isStatute ? `This statute defines the offense of ${chunk.title || chunk.citation}. To secure a conviction, the prosecution must prove each element beyond a reasonable doubt.` : isEvidentiary ? `This rule governs the admissibility of evidence. It establishes the conditions under which ${chunk.title || 'this type of evidence'} may or may not be presented at trial.` : `This court holding establishes the legal principle from ${chunk.citation}. It serves as ${chunk.authority_level === 'primary' ? 'binding precedent' : 'persuasive authority'} in the ${chunk.jurisdiction || 'federal'} jurisdiction.`}\n\n### Key Terms\n${(chunk.key_terms || []).length > 0 ? chunk.key_terms.map((t) => `- **${t.replace(/_/g, ' ')}**`).join('\n') : '- See full text for specific legal terminology'}\n\n### Domains\n${(chunk.domains || []).length > 0 ? chunk.domains.map((d) => `- ${d}`).join('\n') : '- General legal'}\n\n[Reference: ${chunk.chunk_id}]`,
				},
			],
		});

		// Record type 2: Q&A about the statute
		if (isStatute && chunk.content.length > 100) {
			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_STATUTE },
					{
						role: 'user',
						content: `What must the prosecution prove to establish a violation of ${chunk.citation}?`,
					},
					{
						role: 'assistant',
						content: `Under ${chunk.citation}, the prosecution must establish the following:\n\n${chunk.content.slice(0, 600)}\n\nEach element must be proven beyond a reasonable doubt in a criminal prosecution. The burden of proof rests entirely with the government.\n\n[Reference: ${chunk.chunk_id}]`,
					},
				],
			});
		}

		// Record type 3: Evidentiary rule application
		if (isEvidentiary) {
			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_STATUTE },
					{
						role: 'user',
						content: `When would ${chunk.citation} apply in a trial? Give an example.`,
					},
					{
						role: 'assistant',
						content: `${chunk.citation} applies when ${chunk.title || 'evidence admissibility'} is at issue during trial proceedings.\n\n**Example Scenario:** During a fictional trial, the prosecution seeks to admit ${chunk.semantic_label === 'evidentiary_rule' ? 'evidence that may be subject to this rule' : 'documentary evidence'}. Defense counsel objects, citing ${chunk.citation}. The court must then evaluate whether the evidence meets the requirements of this rule before allowing the jury to consider it.\n\n**Key Consideration:** ${chunk.content.slice(0, 300)}\n\n[Reference: ${chunk.chunk_id}]\n[FICTIONAL EXAMPLE — NOT LEGAL ADVICE]`,
					},
				],
			});
		}

		// Record type 4: Court holding — what principle does it establish?
		if (isHolding) {
			records.push({
				messages: [
					{ role: 'system', content: SYSTEM_STATUTE },
					{
						role: 'user',
						content: `What legal principle was established in ${chunk.citation}?`,
					},
					{
						role: 'assistant',
						content: `The case reported at ${chunk.citation} established the following principle:\n\n${chunk.content.slice(0, 500)}\n\nThis holding is considered ${chunk.authority_level === 'primary' ? 'binding precedent' : 'persuasive authority'} in the ${chunk.jurisdiction || 'federal'} jurisdiction. Courts routinely cite this case when addressing similar legal questions.\n\n[Reference: ${chunk.chunk_id}]`,
					},
				],
			});
		}
	}

	return records;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
	console.log('\n╔═══════════════════════════════════════════════════╗');
	console.log('║   QLoRA Training Dataset Generator                ║');
	console.log('║   Source: 153 cases + 59 canon chunks + 1239 evts ║');
	console.log('╚═══════════════════════════════════════════════════╝');

	// Ensure output directory exists
	fs.mkdirSync(outputDir, { recursive: true });

	const qaRecords = await generateLegalQAPairs();
	writeJsonl(path.join(outputDir, 'legal-qa-pairs.jsonl'), qaRecords);

	const summaryRecords = await generateCaseSummaries();
	writeJsonl(path.join(outputDir, 'case-summaries.jsonl'), summaryRecords);

	const statuteRecords = await generateStatuteAnalysis();
	writeJsonl(path.join(outputDir, 'statute-analysis.jsonl'), statuteRecords);

	const total = qaRecords.length + summaryRecords.length + statuteRecords.length;

	console.log('\n╔═══════════════════════════════════════════════════╗');
	console.log('║   Generation Complete                             ║');
	console.log('╠═══════════════════════════════════════════════════╣');
	console.log(`║  legal-qa-pairs.jsonl:    ${String(qaRecords.length).padStart(5)} records             ║`);
	console.log(`║  case-summaries.jsonl:    ${String(summaryRecords.length).padStart(5)} records             ║`);
	console.log(`║  statute-analysis.jsonl:  ${String(statuteRecords.length).padStart(5)} records             ║`);
	console.log(`║  TOTAL:                   ${String(total).padStart(5)} records             ║`);
	console.log('╚═══════════════════════════════════════════════════╝');

	// Verify format
	console.log('\n  Sample record (legal-qa-pairs):');
	if (qaRecords.length > 0) {
		const sample = qaRecords[0];
		console.log(`    System: ${sample.messages[0].content.slice(0, 60)}...`);
		console.log(`    User:   ${sample.messages[1].content.slice(0, 60)}...`);
		console.log(`    Asst:   ${sample.messages[2].content.slice(0, 60)}...`);
	}

	await pool.end();
}

main().catch((err) => {
	console.error('Fatal:', err);
	pool.end();
	process.exit(1);
});