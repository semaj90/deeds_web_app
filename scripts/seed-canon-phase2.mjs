/**
 * Canon Ingestion Phase 2 — Seed canonical documents, chunks, and legal terms
 *
 * Cross-ingests existing statutes + precedents from PostgreSQL into the
 * canonical_documents / canonical_chunks tables, adds FRE fundamentals,
 * and seeds the ExampleBank (legal_terms + term_examples).
 *
 * Usage: node scripts/seed-canon-phase2.mjs
 *
 * Requires: PostgreSQL running on 127.0.0.1:5434 (deeds-postgres-prod via proxy)
 * Optional: Ollama running on 127.0.0.1:11434 (for embeddings)
 */

import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({
	connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const OLLAMA_URL = 'http://localhost:11434';
const EMBED_MODEL = 'embeddinggemma:latest'; // 768-dim, primary embedding model
const SKIP_EMBEDDINGS = process.argv.includes('--skip-embed');

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeChunkId(docId, index, content) {
	const normalized = content.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
	const sha16 = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
	const docShort = docId.slice(0, 8);
	return `${docShort}:${index}:${sha16}`;
}

function chunkText(text, docType) {
	const CHUNK_TARGETS = {
		statute: { size: 1400, overlap: 200 },
		rule: { size: 1400, overlap: 200 },
		regulation: { size: 1400, overlap: 200 },
		jury_instruction: { size: 1600, overlap: 300 },
		opinion: { size: 3600, overlap: 600 },
		treatise: { size: 3600, overlap: 600 },
	};
	const config = CHUNK_TARGETS[docType] ?? { size: 2000, overlap: 300 };
	const chunks = [];
	const sentences = text.split(/(?<=[.!?])\s+/);
	let current = '';

	for (const sentence of sentences) {
		if (current.length + sentence.length > config.size && current.length > 0) {
			chunks.push(current.trim());
			const words = current.split(/\s+/);
			const overlapWords = Math.floor(config.overlap / 5);
			current = words.slice(-overlapWords).join(' ') + ' ' + sentence;
		} else {
			current += (current ? ' ' : '') + sentence;
		}
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks;
}

let skipEmbed = SKIP_EMBEDDINGS;

async function embed(texts) {
	if (skipEmbed) return texts.map(() => []);
	try {
		const ctrl = new AbortController();
		setTimeout(() => ctrl.abort(), 30000);
		const res = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
			signal: ctrl.signal,
		});
		if (!res.ok) throw new Error(`Ollama ${res.status}`);
		const data = await res.json();
		return data.embeddings ?? [];
	} catch (err) {
		console.warn(`  [embed] Failed: ${err.message} — skipping all remaining embeddings`);
		skipEmbed = true;
		return texts.map(() => []);
	}
}

function mapJurisdiction(jurisdiction) {
	if (!jurisdiction) return 'US-FED';
	const j = jurisdiction.toLowerCase();
	if (j.includes('federal') || j.includes('u.s.') || j.includes('us-fed')) return 'US-FED';
	if (j.includes('california') || j === 'ca') return 'CA';
	if (j.includes('new york') || j === 'ny') return 'NY';
	if (j.includes('texas') || j === 'tx') return 'TX';
	if (j.includes('washington')) return 'WA';
	return 'US-FED';
}

// ─── Step 1: Cross-ingest existing statutes ────────────────────────────────

async function ingestExistingStatutes() {
	console.log('\n═══ Step 1: Cross-ingest existing statutes ═══');
	const { rows: statutes } = await pool.query(
		'SELECT id, title, section, jurisdiction, category, content, source_url FROM statutes ORDER BY title'
	);
	console.log(`  Found ${statutes.length} statutes to cross-ingest`);

	let docCount = 0;
	let chunkCount = 0;

	for (const statute of statutes) {
		if (!statute.content || statute.content.trim().length === 0) continue;

		const docId = randomUUID();
		const citation = statute.section
			? `${statute.jurisdiction === 'Federal' ? '' : statute.jurisdiction + ' '}${statute.section}`
			: statute.title;
		const jur = mapJurisdiction(statute.jurisdiction);

		// Insert canonical document
		await pool.query(
			`INSERT INTO canonical_documents (id, title, doc_type, citation, jurisdiction, authority_level, source_name, license_tag, full_text, metadata)
			 VALUES ($1, $2, 'statute', $3, $4, 'primary', 'PostgreSQL corpus', 'internal', $5, $6)
			 ON CONFLICT DO NOTHING`,
			[
				docId,
				statute.title,
				citation,
				jur,
				statute.content,
				JSON.stringify({
					original_table: 'statutes',
					original_id: statute.id,
					category: statute.category,
					domains: [statute.category || 'criminal'],
				}),
			]
		);
		docCount++;

		// Chunk
		const textChunks = chunkText(statute.content, 'statute');
		const embeddings = await embed(textChunks);

		for (let i = 0; i < textChunks.length; i++) {
			const chunkId = makeChunkId(docId, i, textChunks[i]);
			const emb = embeddings[i] && embeddings[i].length === 768 ? embeddings[i] : null;
			const embStr = emb ? `[${emb.join(',')}]` : null;

			await pool.query(
				`INSERT INTO canonical_chunks (id, chunk_id, document_id, chunk_index, content, token_count, semantic_label, domains, key_terms, embedding, metadata)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 ON CONFLICT (chunk_id) DO NOTHING`,
				[
					randomUUID(),
					chunkId,
					docId,
					i,
					textChunks[i],
					Math.ceil(textChunks[i].length / 4),
					statute.category === 'evidence' ? 'evidentiary_rule' : 'elements_of_offense',
					JSON.stringify([statute.category || 'criminal']),
					JSON.stringify([]),
					embStr,
					JSON.stringify({ citation, jurisdiction: jur, authorityLevel: 'primary', docType: 'statute' }),
				]
			);
			chunkCount++;
		}
		process.stdout.write('.');
	}
	console.log(`\n  ✓ ${docCount} documents, ${chunkCount} chunks`);
}

// ─── Step 2: Cross-ingest existing legal precedents ────────────────────────

async function ingestExistingPrecedents() {
	console.log('\n═══ Step 2: Cross-ingest legal precedents ═══');
	const { rows: precedents } = await pool.query(
		'SELECT id, title, citation, court, summary FROM legal_precedents ORDER BY title'
	);
	console.log(`  Found ${precedents.length} precedents to cross-ingest`);

	let docCount = 0;
	let chunkCount = 0;

	for (const prec of precedents) {
		if (!prec.summary || prec.summary.trim().length === 0) continue;

		const docId = randomUUID();
		const court = prec.court || '';
		const jur = court.includes('U.S.') || court.includes('Federal')
			? 'US-FED'
			: court.includes('California')
				? 'CA'
				: court.includes('Washington')
					? 'WA'
					: 'US-FED';

		await pool.query(
			`INSERT INTO canonical_documents (id, title, doc_type, citation, jurisdiction, authority_level, source_name, license_tag, full_text, metadata)
			 VALUES ($1, $2, 'opinion', $3, $4, $5, 'PostgreSQL corpus', 'internal', $6, $7)
			 ON CONFLICT DO NOTHING`,
			[
				docId,
				prec.title,
				prec.citation,
				jur,
				court.includes('Supreme Court') ? 'primary' : 'persuasive',
				prec.summary,
				JSON.stringify({
					original_table: 'legal_precedents',
					original_id: prec.id,
					court: prec.court,
					domains: ['constitutional', 'criminal'],
				}),
			]
		);
		docCount++;

		const textChunks = chunkText(prec.summary, 'opinion');
		const embeddings = await embed(textChunks);

		for (let i = 0; i < textChunks.length; i++) {
			const chunkId = makeChunkId(docId, i, textChunks[i]);
			const emb = embeddings[i] && embeddings[i].length === 768 ? embeddings[i] : null;
			const embStr = emb ? `[${emb.join(',')}]` : null;

			await pool.query(
				`INSERT INTO canonical_chunks (id, chunk_id, document_id, chunk_index, content, token_count, semantic_label, domains, key_terms, embedding, metadata)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 ON CONFLICT (chunk_id) DO NOTHING`,
				[
					randomUUID(),
					chunkId,
					docId,
					i,
					textChunks[i],
					Math.ceil(textChunks[i].length / 4),
					'holding',
					JSON.stringify(['constitutional', 'criminal']),
					JSON.stringify([]),
					embStr,
					JSON.stringify({ citation: prec.citation, jurisdiction: jur, docType: 'opinion' }),
				]
			);
			chunkCount++;
		}
		process.stdout.write('.');
	}
	console.log(`\n  ✓ ${docCount} documents, ${chunkCount} chunks`);
}

// ─── Step 3: Seed FRE Fundamentals ─────────────────────────────────────────

const FRE_RULES = [
	{
		title: 'FRE Rule 401 — Test for Relevant Evidence',
		citation: 'FRE 401',
		docType: 'rule',
		text: `Rule 401. Test for Relevant Evidence. Evidence is relevant if: (a) it has any tendency to make a fact more or less probable than it would be without the evidence; and (b) the fact is of consequence in determining the action. Advisory Committee Notes: The standard of probability under the rule is "more probable than it would be without the evidence." Any more stringent requirement is unworkable and unrealistic. Problems of relevance call for an answer to the question whether an item of evidence, when tested by processes of proof, may be afforded a place in the mosaic of a case. The fact to which the evidence is directed need not be in dispute. While situations will arise where evidence offered to prove a fact will be excluded because the matter is not in dispute, this is not based on relevance but on considerations of undue delay, waste of time, or needless presentation of cumulative evidence.`,
		domains: ['evidence'],
		keyTerms: ['relevance', 'probative_value', 'materiality'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 402 — General Admissibility of Relevant Evidence',
		citation: 'FRE 402',
		docType: 'rule',
		text: `Rule 402. General Admissibility of Relevant Evidence. Relevant evidence is admissible unless any of the following provides otherwise: the United States Constitution; a federal statute; these rules; or other rules prescribed by the Supreme Court. Irrelevant evidence is not admissible. This rule is a restatement of the common law principle that all relevant evidence is admissible, subject to constitutional, statutory, and rule-based limitations. The exclusion of irrelevant evidence is a fundamental principle: evidence that does not tend to prove or disprove a fact in issue has no place in the proceedings.`,
		domains: ['evidence'],
		keyTerms: ['admissibility', 'relevance', 'exclusion'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 403 — Excluding Relevant Evidence for Prejudice, Confusion, Waste of Time, or Other Reasons',
		citation: 'FRE 403',
		docType: 'rule',
		text: `Rule 403. Excluding Relevant Evidence for Prejudice, Confusion, Waste of Time, or Other Reasons. The court may exclude relevant evidence if its probative value is substantially outweighed by a danger of one or more of the following: unfair prejudice, confusing the issues, misleading the jury, undue delay, wasting time, or needlessly presenting cumulative evidence. The balance favors admissibility — the probative value must be "substantially" outweighed, not merely outweighed. Unfair prejudice means an undue tendency to suggest decision on an improper basis, commonly though not necessarily an emotional one. The Committee rejected mechanical rules for applying this balancing test, recognizing that specific situations call for specific assessments. The availability of other means of proof may also be a relevant factor.`,
		domains: ['evidence'],
		keyTerms: ['probative_value', 'unfair_prejudice', 'balancing_test', 'rule_403'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 801 — Definitions That Apply to Hearsay',
		citation: 'FRE 801',
		docType: 'rule',
		text: `Rule 801. Definitions That Apply to This Article. (a) Statement. "Statement" means a person's oral assertion, written assertion, or nonverbal conduct, if the person intended it as an assertion. (b) Declarant. "Declarant" means the person who made the statement. (c) Hearsay. "Hearsay" means a statement that: (1) the declarant does not make while testifying at the current trial or hearing; and (2) a party offers in evidence to prove the truth of the matter asserted in the statement. (d) Statements That Are Not Hearsay. A statement that meets the following conditions is not hearsay: (1) A Declarant-Witness's Prior Statement — if the declarant testifies and is subject to cross-examination about a prior statement, and the statement is inconsistent with the declarant's testimony and was given under penalty of perjury, consistent with the declarant's testimony and offered to rebut an express or implied charge of fabrication, or identifies a person as someone the declarant perceived earlier. (2) An Opposing Party's Statement — offered against an opposing party and was made by the party in an individual capacity; the party manifested that it adopted or believed to be true; was made by a person whom the party authorized to make a statement on the subject; was made by the party's agent or employee on a matter within that relationship and during its existence; or was made by a coconspirator during and in furtherance of the conspiracy.`,
		domains: ['evidence'],
		keyTerms: ['hearsay', 'statement', 'declarant', 'truth_of_matter_asserted', 'prior_statement', 'opposing_party_statement'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 802 — The Rule Against Hearsay',
		citation: 'FRE 802',
		docType: 'rule',
		text: `Rule 802. The Rule Against Hearsay. Hearsay is not admissible unless any of the following provides otherwise: a federal statute; these rules; or other rules prescribed by the Supreme Court. The hearsay rule is a fundamental principle of evidence law. It excludes out-of-court statements offered for the truth of the matter asserted because the adverse party had no opportunity to cross-examine the declarant, and the trier of fact had no opportunity to observe the declarant's demeanor. The principal justification for the hearsay rule is the inability to test the perception, memory, narration, and sincerity of the out-of-court declarant through cross-examination. However, many exceptions exist where the circumstances of the statement provide inherent guarantees of reliability.`,
		domains: ['evidence'],
		keyTerms: ['hearsay_rule', 'cross_examination', 'out_of_court_statement'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 803 — Exceptions to the Rule Against Hearsay (Declarant Availability Immaterial)',
		citation: 'FRE 803',
		docType: 'rule',
		text: `Rule 803. Exceptions to the Rule Against Hearsay — Regardless of Whether the Declarant Is Available as a Witness. The following are not excluded by the rule against hearsay, regardless of whether the declarant is available as a witness: (1) Present Sense Impression — A statement describing or explaining an event or condition, made while or immediately after the declarant perceived it. (2) Excited Utterance — A statement relating to a startling event or condition, made while the declarant was under the stress of excitement that it caused. (3) Then-Existing Mental, Emotional, or Physical Condition — A statement of the declarant's then-existing state of mind (such as motive, intent, or plan) or emotional, sensory, or physical condition (such as mental feeling, pain, or bodily health). (4) Statement Made for Medical Diagnosis or Treatment — A statement that is made for — and is reasonably pertinent to — medical diagnosis or treatment, and describes medical history, past or present symptoms, their inception, or their general cause. (5) Recorded Recollection — A record that is on a matter the witness once knew about but now cannot recall well enough to testify fully and accurately; was made or adopted by the witness when the matter was fresh in the witness's memory; and accurately reflects the witness's knowledge. (6) Records of a Regularly Conducted Activity (Business Records) — A record of an act, event, condition, opinion, or diagnosis if the record was made at or near the time by someone with knowledge; the record was kept in the course of a regularly conducted activity of a business; making the record was a regular practice of that activity; all these conditions are shown by the testimony of the custodian or another qualified witness.`,
		domains: ['evidence'],
		keyTerms: ['hearsay_exceptions', 'present_sense_impression', 'excited_utterance', 'business_records', 'recorded_recollection'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 804 — Exceptions to the Rule Against Hearsay (Declarant Unavailable)',
		citation: 'FRE 804',
		docType: 'rule',
		text: `Rule 804. Exceptions to the Rule Against Hearsay — When the Declarant Is Unavailable as a Witness. (a) Criteria for Being Unavailable. A declarant is considered to be unavailable as a witness if the declarant: (1) is exempted from testifying about the subject matter of the declarant's statement because the court rules that a privilege applies; (2) refuses to testify despite a court order to do so; (3) testifies to not remembering the subject matter; (4) cannot be present or testify at the trial or hearing because of death or a then-existing infirmity, physical illness, or mental illness; or (5) is absent from the trial or hearing and the statement's proponent has not been able, by process or other reasonable means, to procure the declarant's attendance or testimony. (b) The Exceptions. (1) Former Testimony — Testimony that was given at a trial, hearing, or deposition and the party against whom the testimony is offered had an opportunity and similar motive to develop it by direct, cross-, or redirect examination. (2) Statement Under the Belief of Imminent Death — A statement that the declarant, while believing the declarant's death to be imminent, made about its cause or circumstances. (3) Statement Against Interest — A statement that a reasonable person in the declarant's position would have made only if the person believed it to be true, because when made it was so contrary to the declarant's proprietary or pecuniary interest, or had so great a tendency to invalidate the declarant's claim against someone else or to expose the declarant to civil or criminal liability.`,
		domains: ['evidence'],
		keyTerms: ['unavailability', 'former_testimony', 'dying_declaration', 'statement_against_interest'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 805 — Hearsay Within Hearsay',
		citation: 'FRE 805',
		docType: 'rule',
		text: `Rule 805. Hearsay Within Hearsay. Hearsay within hearsay is not excluded by the rule against hearsay if each part of the combined statements conforms with an exception to the rule. This rule addresses the "double hearsay" or "hearsay within hearsay" problem. When a hearsay statement itself contains another hearsay statement, both levels must independently qualify under a hearsay exception. For example, a hospital record (business record exception) that contains a patient's statement (statement for medical diagnosis) is admissible because each layer satisfies its own exception.`,
		domains: ['evidence'],
		keyTerms: ['double_hearsay', 'hearsay_within_hearsay', 'layered_exceptions'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: 'FRE Rule 807 — Residual Exception',
		citation: 'FRE 807',
		docType: 'rule',
		text: `Rule 807. Residual Exception. (a) In General. Under the following conditions, a hearsay statement is not excluded by the rule against hearsay even if the statement is not admissible under a hearsay exception in Rule 803 or 804: (1) the statement is supported by sufficient guarantees of trustworthiness — after considering the totality of circumstances under which it was made and evidence, if any, corroborating the statement; and (2) it is more probative on the point for which it is offered than any other evidence that the proponent can obtain through reasonable efforts. (b) Notice. The statement is admissible only if the proponent gives an adverse party reasonable notice of the intent to offer the statement — including its substance and the declarant's name — so that the party has a fair opportunity to meet it. The residual exception serves as a safety valve for hearsay that does not fit neatly into any established exception but nonetheless possesses particularized guarantees of trustworthiness equivalent to those supporting the enumerated exceptions.`,
		domains: ['evidence'],
		keyTerms: ['residual_exception', 'trustworthiness', 'catch_all_hearsay'],
		semanticLabel: 'evidentiary_rule',
	},
	{
		title: '18 U.S.C. § 1030 — Computer Fraud and Abuse Act (CFAA)',
		citation: '18 U.S.C. § 1030',
		docType: 'statute',
		text: `18 U.S.C. § 1030. Fraud and Related Activity in Connection with Computers. (a) Whoever— (1) having knowingly accessed a computer without authorization or exceeding authorized access, and by means of such conduct having obtained information from any protected computer; (2) intentionally accesses a computer without authorization or exceeds authorized access, and thereby obtains information from any department or agency of the United States, information from any protected computer, or information from any financial institution; (3) intentionally, without authorization to access any nonpublic computer of a department or agency of the United States, accesses such a computer; (4) knowingly and with intent to defraud, accesses a protected computer without authorization, or exceeds authorized access, and by means of such conduct furthers the intended fraud and obtains anything of value; (5) (A) knowingly causes the transmission of a program, information, code, or command, and as a result of such conduct, intentionally causes damage without authorization, to a protected computer; (B) intentionally accesses a protected computer without authorization, and as a result of such conduct, recklessly causes damage; or (C) intentionally accesses a protected computer without authorization, and as a result of such conduct, causes damage and loss — shall be punished as provided in subsection (c). The term "protected computer" means a computer exclusively for the use of a financial institution or the United States Government, or a computer which is used in or affecting interstate or foreign commerce or communication. The CFAA is the primary federal criminal statute addressing computer crimes, including unauthorized access, data theft, and computer damage.`,
		domains: ['criminal', 'cybercrime'],
		keyTerms: ['computer_fraud', 'unauthorized_access', 'protected_computer', 'CFAA'],
		semanticLabel: 'elements_of_offense',
	},
	{
		title: '18 U.S.C. § 922 — Unlawful Acts (Firearms)',
		citation: '18 U.S.C. § 922',
		docType: 'statute',
		text: `18 U.S.C. § 922. Unlawful Acts. (a)(1) It shall be unlawful for any person except a licensed importer, licensed manufacturer, or licensed dealer, to engage in the business of importing, manufacturing, or dealing in firearms, or in the course of such business to ship, transport, or receive any firearm in interstate or foreign commerce. (g) It shall be unlawful for any person who has been convicted in any court of a crime punishable by imprisonment for a term exceeding one year; who is a fugitive from justice; who is an unlawful user of or addicted to any controlled substance; who has been adjudicated as a mental defective or has been committed to any mental institution; who is an illegal alien; who has been discharged from the Armed Forces under dishonorable conditions; who, having been a citizen of the United States, has renounced such citizenship; who is subject to a court order restraining such person from harassing, stalking, or threatening an intimate partner; or who has been convicted of a misdemeanor crime of domestic violence — to ship or transport in interstate or foreign commerce, or possess in or affecting commerce, any firearm or ammunition; or to receive any firearm or ammunition which has been shipped or transported in interstate or foreign commerce. This section is enforced in conjunction with 18 U.S.C. § 924 for sentencing purposes and is central to federal firearms prosecution.`,
		domains: ['criminal', 'firearms'],
		keyTerms: ['firearms', 'felon_in_possession', 'prohibited_person', 'interstate_commerce'],
		semanticLabel: 'elements_of_offense',
	},
	{
		title: 'Fourth Amendment — Search and Seizure',
		citation: 'U.S. Const. amend. IV',
		docType: 'rule',
		text: `The right of the people to be secure in their persons, houses, papers, and effects, against unreasonable searches and seizures, shall not be violated, and no Warrants shall issue, but upon probable cause, supported by Oath or affirmation, and particularly describing the place to be searched, and the persons or things to be seized. The Fourth Amendment protects individuals from unreasonable government intrusions. The Supreme Court has developed an extensive body of law interpreting this amendment, including the warrant requirement, exceptions to the warrant requirement (exigent circumstances, plain view, consent, search incident to arrest, automobile exception, stop and frisk under Terry v. Ohio), the exclusionary rule (Mapp v. Ohio), the good faith exception (United States v. Leon), and the third-party doctrine (Smith v. Maryland). The reasonable expectation of privacy test from Katz v. United States (1967) established the modern framework: a search occurs when the government violates a subjective expectation of privacy that society recognizes as reasonable.`,
		domains: ['constitutional', 'criminal'],
		keyTerms: ['fourth_amendment', 'search_and_seizure', 'probable_cause', 'warrant_requirement', 'exclusionary_rule', 'reasonable_expectation_of_privacy'],
		semanticLabel: 'constitutional_provision',
	},
	{
		title: 'Fifth Amendment — Due Process and Self-Incrimination',
		citation: 'U.S. Const. amend. V',
		docType: 'rule',
		text: `No person shall be held to answer for a capital, or otherwise infamous crime, unless on a presentment or indictment of a Grand Jury, except in cases arising in the land or naval forces, or in the Militia, when in actual service in time of War or public danger; nor shall any person be subject for the same offence to be twice put in jeopardy of life or limb; nor shall be compelled in any criminal case to be a witness against himself, nor be deprived of life, liberty, or property, without due process of law; nor shall private property be taken for public use, without just compensation. The Fifth Amendment encompasses several critical protections: the Grand Jury Clause, the Double Jeopardy Clause, the Self-Incrimination Clause (which supports Miranda warnings), the Due Process Clause (incorporated against states via the Fourteenth Amendment), and the Takings Clause. Miranda v. Arizona (1966) established that custodial interrogation requires advisement of the right to remain silent and the right to counsel. The due process guarantee requires fundamental fairness in both criminal and civil proceedings.`,
		domains: ['constitutional', 'criminal'],
		keyTerms: ['fifth_amendment', 'due_process', 'self_incrimination', 'double_jeopardy', 'miranda_rights', 'grand_jury'],
		semanticLabel: 'constitutional_provision',
	},
	{
		title: 'Sixth Amendment — Right to Counsel and Confrontation',
		citation: 'U.S. Const. amend. VI',
		docType: 'rule',
		text: `In all criminal prosecutions, the accused shall enjoy the right to a speedy and public trial, by an impartial jury of the State and district wherein the crime shall have been committed, which district shall have been previously ascertained by law, and to be informed of the nature and cause of the accusation; to be confronted with the witnesses against him; to have compulsory process for obtaining witnesses in his favor, and to have the Assistance of Counsel for his defence. The Sixth Amendment is the bedrock of criminal trial rights. Gideon v. Wainwright (1963) established the right to appointed counsel for indigent defendants in felony cases. Strickland v. Washington (1984) set the two-prong test for ineffective assistance of counsel: deficient performance and prejudice. The Confrontation Clause, as interpreted in Crawford v. Washington (2004), requires that testimonial statements of absent witnesses be admitted only if the declarant is unavailable and the defendant had a prior opportunity for cross-examination. Batson v. Kentucky (1986) extended the Equal Protection Clause to prohibit racially discriminatory peremptory challenges during jury selection.`,
		domains: ['constitutional', 'criminal'],
		keyTerms: ['sixth_amendment', 'right_to_counsel', 'confrontation_clause', 'speedy_trial', 'jury_trial', 'effective_assistance'],
		semanticLabel: 'constitutional_provision',
	},
];

async function ingestFRERules() {
	console.log('\n═══ Step 3: Seed FRE fundamentals + constitutional provisions ═══');
	let docCount = 0;
	let chunkCount = 0;

	for (const rule of FRE_RULES) {
		const docId = randomUUID();

		await pool.query(
			`INSERT INTO canonical_documents (id, title, doc_type, citation, jurisdiction, authority_level, source_name, license_tag, full_text, metadata)
			 VALUES ($1, $2, $3, $4, 'US-FED', 'primary', 'Public domain', 'public_domain', $5, $6)
			 ON CONFLICT DO NOTHING`,
			[
				docId,
				rule.title,
				rule.docType,
				rule.citation,
				rule.text,
				JSON.stringify({ domains: rule.domains, key_terms: rule.keyTerms }),
			]
		);
		docCount++;

		const textChunks = chunkText(rule.text, rule.docType);
		const embeddings = await embed(textChunks);

		for (let i = 0; i < textChunks.length; i++) {
			const chunkId = makeChunkId(docId, i, textChunks[i]);
			const emb = embeddings[i] && embeddings[i].length === 768 ? embeddings[i] : null;
			const embStr = emb ? `[${emb.join(',')}]` : null;

			await pool.query(
				`INSERT INTO canonical_chunks (id, chunk_id, document_id, chunk_index, content, token_count, semantic_label, domains, key_terms, embedding, metadata)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
				 ON CONFLICT (chunk_id) DO NOTHING`,
				[
					randomUUID(),
					chunkId,
					docId,
					i,
					textChunks[i],
					Math.ceil(textChunks[i].length / 4),
					rule.semanticLabel,
					JSON.stringify(rule.domains),
					JSON.stringify(rule.keyTerms),
					embStr,
					JSON.stringify({ citation: rule.citation, jurisdiction: 'US-FED', authorityLevel: 'primary', docType: rule.docType }),
				]
			);
			chunkCount++;
		}
		process.stdout.write('.');
	}
	console.log(`\n  ✓ ${docCount} documents, ${chunkCount} chunks`);
}

// ─── Step 4: Seed Legal Terms (ExampleBank) ────────────────────────────────

const LEGAL_TERMS = [
	{
		term: 'Hearsay',
		domain: 'evidence',
		formalDefinition: 'A statement that the declarant does not make while testifying at the current trial or hearing, and that a party offers in evidence to prove the truth of the matter asserted in the statement. FRE 801(c).',
		plainDefinition: 'An out-of-court statement offered to prove what it says is true. Generally not admissible unless it fits an exception.',
		examples: [
			{ text: 'A witness testifies: "John told me he saw the defendant at the scene." If offered to prove the defendant was at the scene, this is hearsay because it relies on John\'s out-of-court assertion.', relationship: 'illustrates' },
			{ text: 'A witness testifies: "The defendant said, \'I\'m going to kill you.\'" Offered to show the defendant made a threat — not hearsay because not offered for the truth of the matter asserted (not offered to prove the defendant will actually kill someone).', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Probable Cause',
		domain: 'criminal',
		formalDefinition: 'A reasonable amount of suspicion, supported by circumstances sufficiently strong to justify a prudent and cautious person\'s belief that certain facts are probably true. Required by the Fourth Amendment for warrants and arrests.',
		plainDefinition: 'Enough facts and evidence that a reasonable person would believe a crime was committed or evidence of a crime exists at a particular place.',
		examples: [
			{ text: 'An officer smells marijuana emanating from a vehicle during a traffic stop and observes rolling papers on the dashboard. This provides probable cause to search the vehicle under the automobile exception.', relationship: 'illustrates' },
			{ text: 'An anonymous tip that "someone in a red jacket is selling drugs on Main Street" alone does not establish probable cause without corroboration (see Illinois v. Gates, 462 U.S. 213).', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Beyond a Reasonable Doubt',
		domain: 'criminal',
		formalDefinition: 'The standard of proof required to convict a criminal defendant. It does not require absolute certainty but requires that no reasonable doubt exists as to the defendant\'s guilt. In re Winship, 397 U.S. 358 (1970).',
		plainDefinition: 'The highest standard of proof in law. The jury must be firmly convinced — not 100% certain, but with no reasonable lingering doubt — that the defendant is guilty.',
		examples: [
			{ text: 'The prosecution presents DNA evidence, eyewitness testimony, surveillance footage, and the defendant\'s confession. The jury finds no reasonable doubt remains about the defendant\'s involvement.', relationship: 'illustrates' },
			{ text: 'Preponderance of the evidence (more likely than not, >50%) is the standard for civil cases, NOT criminal cases. Criminal conviction requires the higher beyond-a-reasonable-doubt standard.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Miranda Rights',
		domain: 'criminal',
		formalDefinition: 'The procedural safeguards required by Miranda v. Arizona, 384 U.S. 436 (1966), before custodial interrogation: the right to remain silent, the warning that statements may be used against the suspect, the right to counsel, and the right to appointed counsel if indigent.',
		plainDefinition: 'The warning police must give before questioning someone in custody: you have the right to remain silent, anything you say can be used against you, and you have the right to a lawyer.',
		examples: [
			{ text: 'A suspect is arrested and handcuffed. Before asking questions about the crime, the officer reads the Miranda warning. The suspect says "I want a lawyer." All questioning must stop until counsel is provided.', relationship: 'illustrates' },
			{ text: 'A spontaneous statement made by a suspect ("I did it!") without prompting during booking does not require Miranda warnings because there was no interrogation. Rhode Island v. Innis, 446 U.S. 291 (1980).', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Chain of Custody',
		domain: 'evidence',
		formalDefinition: 'The chronological documentation or paper trail showing the seizure, custody, control, transfer, analysis, and disposition of physical or electronic evidence. Required to establish that evidence has not been tampered with or substituted.',
		plainDefinition: 'A documented record of everyone who handled a piece of evidence, from collection to courtroom, proving it hasn\'t been altered.',
		examples: [
			{ text: 'A blood sample is collected at the crime scene, logged into evidence with the officer\'s name and time, transferred to the forensic lab with a signed receipt, analyzed by a technician who documents results, and stored in a secure facility. Each step is recorded.', relationship: 'illustrates' },
			{ text: 'If a gap exists in the chain — say, the evidence bag was left unattended overnight in an unlocked room — the defense can argue the evidence may have been contaminated or tampered with, potentially rendering it inadmissible.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Mens Rea',
		domain: 'criminal',
		formalDefinition: 'The mental state or "guilty mind" element of a crime. The Model Penal Code identifies four levels: purposely (conscious object), knowingly (awareness of conduct/result), recklessly (conscious disregard of substantial risk), and negligently (failure to be aware of substantial risk).',
		plainDefinition: 'The criminal intent or mental state required to be guilty of a crime. Most crimes require the prosecutor to prove the defendant had a particular mental state when they committed the act.',
		examples: [
			{ text: 'For first-degree murder, the prosecution must prove "premeditation and deliberation" — the defendant purposely planned and intended to kill. This is the highest level of mens rea.', relationship: 'illustrates' },
			{ text: 'Strict liability offenses (such as statutory rape or selling alcohol to minors in some jurisdictions) do NOT require proof of mens rea — the act itself is sufficient for criminal liability regardless of the defendant\'s intent.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Exclusionary Rule',
		domain: 'constitutional',
		formalDefinition: 'A judicially created remedy that prohibits the use of evidence obtained in violation of the Fourth Amendment in criminal proceedings against the victim of the illegal search or seizure. Established in Weeks v. United States (1914) for federal courts and extended to states in Mapp v. Ohio, 367 U.S. 643 (1961).',
		plainDefinition: 'Evidence obtained illegally by the government (e.g., without a valid warrant) generally cannot be used against a defendant in court — it gets "excluded."',
		examples: [
			{ text: 'Police search a home without a warrant and without any exception to the warrant requirement, finding illegal drugs. Under the exclusionary rule, the drugs cannot be admitted as evidence at trial.', relationship: 'illustrates' },
			{ text: 'The "good faith exception" (United States v. Leon, 468 U.S. 897) allows evidence obtained under a defective warrant if the officers reasonably relied on the warrant\'s validity. The exclusionary rule does not apply when officers act in objectively reasonable reliance.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Confrontation Clause',
		domain: 'constitutional',
		formalDefinition: 'The Sixth Amendment right of a criminal defendant to be confronted with the witnesses against him. As interpreted in Crawford v. Washington, 541 U.S. 36 (2004), testimonial statements of absent witnesses are inadmissible unless the declarant is unavailable and the defendant had a prior opportunity for cross-examination.',
		plainDefinition: 'A defendant\'s constitutional right to face and cross-examine the people who accuse them. Prosecutors generally can\'t use written or recorded statements as a substitute for live testimony.',
		examples: [
			{ text: 'A victim gives a sworn statement to police describing the assault. At trial, the victim is unavailable. Under Crawford, this testimonial statement cannot be admitted unless the defendant previously had an opportunity to cross-examine the victim.', relationship: 'illustrates' },
			{ text: 'A 911 call made during an ongoing emergency ("He\'s hitting me right now!") is typically non-testimonial under Davis v. Washington (2006) and may be admitted even without the caller testifying — the primary purpose was to address an ongoing emergency, not to create evidence.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Burden of Proof',
		domain: 'evidence',
		formalDefinition: 'The obligation to prove a disputed assertion or charge. Includes two components: the burden of production (presenting sufficient evidence to raise an issue) and the burden of persuasion (convincing the trier of fact to the required standard). The standard varies: beyond a reasonable doubt (criminal), clear and convincing evidence (civil commitment, fraud), or preponderance of the evidence (most civil cases).',
		plainDefinition: 'The responsibility to prove your case. In criminal trials, the prosecution bears the burden; in civil trials, the plaintiff does. Different types of cases require different levels of proof.',
		examples: [
			{ text: 'In a criminal trial, the prosecution must prove every element of the offense beyond a reasonable doubt. The defense need not prove anything — if the prosecution fails to meet its burden, the defendant must be acquitted.', relationship: 'illustrates' },
			{ text: 'Affirmative defenses (like self-defense or insanity) may shift the burden of production to the defendant. In some jurisdictions, the defendant must prove self-defense by a preponderance of the evidence; in others, the prosecution must disprove it beyond a reasonable doubt.', relationship: 'contrast_with' },
		],
	},
	{
		term: 'Brady Disclosure',
		domain: 'criminal',
		formalDefinition: 'The constitutional obligation, established in Brady v. Maryland, 373 U.S. 83 (1963), requiring the prosecution to disclose material evidence favorable to the defense that is either exculpatory or impeaching. A Brady violation occurs when favorable evidence is suppressed and prejudice results.',
		plainDefinition: 'Prosecutors must share evidence that could help the defendant — such as evidence of innocence or information that undermines a witness\'s credibility. Hiding helpful evidence is a constitutional violation.',
		examples: [
			{ text: 'The prosecution has a police report showing an eyewitness initially described the suspect as 6\'2" with a beard, but the defendant is 5\'8" and clean-shaven. Failing to disclose this report to the defense is a Brady violation.', relationship: 'illustrates' },
			{ text: 'Evidence that merely corroborates the prosecution\'s existing case or is cumulative of evidence already available to the defense may not trigger Brady obligations, as it would not be "material" to the outcome.', relationship: 'contrast_with' },
		],
	},
];

async function seedLegalTerms() {
	console.log('\n═══ Step 4: Seed legal terms + ExampleBank ═══');
	let termCount = 0;
	let exampleCount = 0;

	for (const term of LEGAL_TERMS) {
		const termId = randomUUID();

		await pool.query(
			`INSERT INTO legal_terms (id, term, domain, jurisdiction, formal_definition, plain_definition, related_chunk_ids, metadata)
			 VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
			 ON CONFLICT DO NOTHING`,
			[
				termId,
				term.term,
				term.domain,
				term.formalDefinition,
				term.plainDefinition,
				JSON.stringify([]),
				JSON.stringify({ source: 'seed-canon-phase2' }),
			]
		);
		termCount++;

		for (const ex of term.examples || []) {
			await pool.query(
				`INSERT INTO term_examples (id, term_id, example_text, relationship, source_chunk_id, metadata)
				 VALUES ($1, $2, $3, $4, NULL, $5)
				 ON CONFLICT DO NOTHING`,
				[
					randomUUID(),
					termId,
					ex.text,
					ex.relationship,
					JSON.stringify({ source: 'seed-canon-phase2' }),
				]
			);
			exampleCount++;
		}
		process.stdout.write('.');
	}
	console.log(`\n  ✓ ${termCount} terms, ${exampleCount} examples`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
	console.log('╔══════════════════════════════════════════════════════════╗');
	console.log('║  Canon Ingestion Phase 2 — Seeding Legal Knowledge Base ║');
	console.log('╚══════════════════════════════════════════════════════════╝');

	// Check Ollama availability
	try {
		const res = await fetch(`${OLLAMA_URL}/api/tags`);
		if (res.ok) {
			const data = await res.json();
			const models = data.models?.map(m => m.name) ?? [];
			const hasEmbed = models.some(m => m.includes('embeddinggemma'));
			console.log(`\n  Ollama: ${models.length} models loaded, embeddinggemma: ${hasEmbed ? 'YES' : 'NO'}`);
			if (!hasEmbed) console.log('  ⚠ Chunks will be stored without embeddings');
		}
	} catch {
		console.log('\n  ⚠ Ollama not available — storing without embeddings');
	}

	const t0 = Date.now();

	await ingestExistingStatutes();
	await ingestExistingPrecedents();
	await ingestFRERules();
	await seedLegalTerms();

	// Final counts
	const { rows: [docCount] } = await pool.query('SELECT count(*) as c FROM canonical_documents');
	const { rows: [chunkCount] } = await pool.query('SELECT count(*) as c FROM canonical_chunks');
	const { rows: [embCount] } = await pool.query('SELECT count(*) as c FROM canonical_chunks WHERE embedding IS NOT NULL');
	const { rows: [termCount] } = await pool.query('SELECT count(*) as c FROM legal_terms');
	const { rows: [exCount] } = await pool.query('SELECT count(*) as c FROM term_examples');

	console.log('\n╔══════════════════════════════════════════════════════════╗');
	console.log('║                    INGESTION COMPLETE                    ║');
	console.log('╠══════════════════════════════════════════════════════════╣');
	console.log(`║  canonical_documents: ${String(docCount.c).padStart(5)}                            ║`);
	console.log(`║  canonical_chunks:    ${String(chunkCount.c).padStart(5)}  (${String(embCount.c).padStart(4)} with embeddings)    ║`);
	console.log(`║  legal_terms:         ${String(termCount.c).padStart(5)}                            ║`);
	console.log(`║  term_examples:       ${String(exCount.c).padStart(5)}                            ║`);
	console.log(`║  Total time:          ${((Date.now() - t0) / 1000).toFixed(1)}s                          ║`);
	console.log('╚══════════════════════════════════════════════════════════╝');

	await pool.end();
}

main().catch(err => {
	console.error('Fatal error:', err);
	pool.end();
	process.exit(1);
});
