/**
 * Generate procedural timeline events for all fictional cases.
 *
 * Creates realistic criminal/civil procedure timelines anchored to each case's
 * incident_date. Events link to canonical chunks where applicable (FRE rules,
 * landmark SCOTUS cases).
 *
 * Usage: node scripts/generate-fictional-case-events.mjs
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
});

// ── Canon Chunk IDs (verified from legal_canon_chunks collection) ──
const CANON = {
	// Landmark SCOTUS
	miranda: '322b2e58:0:c86b0212e9559b92',       // 384 U.S. 436 — Miranda v. Arizona
	gideon: '7e640377:0:888fa4cf1468c318',          // 372 U.S. 335 — Gideon v. Wainwright
	mapp: 'ea3c4f9d:0:2704f4095355cf4f',            // 367 U.S. 643 — Mapp v. Ohio (exclusionary)
	katz: '41468610:0:580cfbc58b7079ce',            // 389 U.S. 347 — Katz v. United States
	terry: 'e687d865:0:109d3e6492a689b7',           // 392 U.S. 1 — Terry v. Ohio
	// FRE
	fre401: 'b2b1b3d9:0:d6f799548c15bcf6',         // Relevance
	fre402: '62e8cce3:0:8b8089c936bd5ee6',          // Relevant Evidence Admissible
	fre403: '2f77bd5e:0:e55a3627ea69a6b6',          // Prejudice
	fre801: '632fbf19:0:1715a5cd06d80f54',          // Hearsay Definitions
	fre802: '0ef90cda:0:01c3fbf66b806515',          // Hearsay Rule
	fre803: '7b5bf66b:0:c72be1bcd3aaa6e4',          // Hearsay Exceptions
	// Federal statutes
	wirefraud: '1a972c6a:0:e84cc0eceeabdc92',       // 18 USC §1343
	compfraud: 'eb47a32e:0:64cfba14790445dd',       // 18 U.S.C. § 1030
	firearms: '0dc8f56e:0:bd4fcc64368619b1',        // 18 U.S.C. § 922
	obstruction1512: 'f6b010bf:0:8342c71ec3cf219d', // 18 USC §1512
	obstruction1519: '27739670:0:8382ff3bd1d5bf02', // 18 USC §1519
	mailfraud: 'db8ffcca:0:a5efe736972ee1af',       // 18 USC §1341
};

// ── Category to federal/civil classification ──
const CRIMINAL_CATEGORIES = new Set([
	'wire_fraud', 'drug_trafficking', 'firearms', 'cybercrime', 'obstruction',
]);
const CIVIL_CATEGORIES = new Set([
	'verbal_contracts', 'tort_federal', 'federal_employee_liability',
]);

function addDays(dateStr, days) {
	const d = new Date(dateStr);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

// Deterministic "random" offset from case ID hash
function caseHash(caseId) {
	let h = 0;
	for (let i = 0; i < caseId.length; i++) {
		h = ((h << 5) - h + caseId.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

function jitter(caseId, base, range) {
	return base + (caseHash(caseId) % range);
}

// ── Generate criminal procedure events ──
function generateCriminalEvents(c) {
	const incidentDate = c.incident_date;
	const h = caseHash(c.case_id);
	const isFederal = c.jurisdiction === 'US-FED';
	const events = [];

	// 1. Investigation
	const investigationDesc = {
		wire_fraud: `Federal agents initiated investigation into alleged wire fraud scheme involving ${c.defendant_name}. Financial records subpoenaed from banking institutions.`,
		drug_trafficking: `Law enforcement began surveillance operation targeting suspected drug trafficking activity. Confidential informant provided initial intelligence.`,
		firearms: `ATF agents received tip regarding illegal firearms possession. Background check revealed potential prohibited person status for ${c.defendant_name}.`,
		cybercrime: `FBI Cyber Division opened investigation after network intrusion detected. Digital forensics team deployed to preserve electronic evidence.`,
		obstruction: `During ongoing federal investigation, evidence surfaced suggesting obstruction of justice by ${c.defendant_name}.`,
	};
	events.push({
		eventType: 'investigation',
		eventDate: addDays(incidentDate, -(jitter(c.case_id, 14, 30))),
		description: investigationDesc[c.category] || `Investigation opened regarding ${c.charge} involving ${c.defendant_name}.`,
		canonChunkIds: c.category === 'cybercrime' ? [CANON.katz] : [],
		orderIndex: 0,
	});

	// 2. Arrest
	const arrestDay = jitter(c.case_id + 'arrest', 1, 14);
	events.push({
		eventType: 'arrest',
		eventDate: addDays(incidentDate, arrestDay),
		description: `${c.defendant_name} placed under arrest by ${isFederal ? 'federal agents' : 'local law enforcement'} in ${c.jurisdiction_city || 'the jurisdiction'}. Miranda warnings administered. Defendant taken into custody without incident.`,
		canonChunkIds: [CANON.miranda, CANON.terry],
		orderIndex: 1,
	});

	// 3. Initial appearance (within 48 hours of arrest)
	const initialAppDay = arrestDay + jitter(c.case_id + 'init', 1, 2);
	events.push({
		eventType: 'initial_appearance',
		eventDate: addDays(incidentDate, initialAppDay),
		description: `${c.defendant_name} appeared before ${isFederal ? 'U.S. Magistrate Judge' : 'the court'} for initial appearance. Right to counsel advised. ${h % 3 === 0 ? 'Bail set at $' + ((h % 50 + 5) * 10000).toLocaleString() + '.' : 'Defendant remanded to custody pending bail hearing.'}`,
		canonChunkIds: [CANON.gideon],
		orderIndex: 2,
	});

	// 4. Grand jury indictment (federal) or preliminary hearing (state)
	const indictmentDay = initialAppDay + jitter(c.case_id + 'indict', 14, 21);
	if (isFederal) {
		events.push({
			eventType: 'indictment',
			eventDate: addDays(incidentDate, indictmentDay),
			description: `Federal grand jury returned ${h % 4 === 0 ? 'a superseding' : 'an'} indictment charging ${c.defendant_name} with ${c.charge}${c.primary_statute ? ' in violation of ' + c.primary_statute : ''}. ${h % 3 === 0 ? 'Additional counts added.' : ''}`,
			canonChunkIds: getStatuteChunks(c.category),
			orderIndex: 3,
		});
	} else {
		events.push({
			eventType: 'preliminary_hearing',
			eventDate: addDays(incidentDate, indictmentDay),
			description: `Preliminary hearing held. Prosecution presented probable cause evidence for ${c.charge}. Court found sufficient basis to bind case over for trial.`,
			canonChunkIds: getStatuteChunks(c.category),
			orderIndex: 3,
		});
	}

	// 5. Arraignment
	const arraignmentDay = indictmentDay + jitter(c.case_id + 'arraign', 7, 14);
	const pleas = ['not guilty', 'not guilty', 'not guilty', 'guilty'];
	const plea = pleas[h % pleas.length];
	events.push({
		eventType: 'arraignment',
		eventDate: addDays(incidentDate, arraignmentDay),
		description: `Formal arraignment before ${isFederal ? 'U.S. District Court' : 'the trial court'}. Charges read in open court. ${c.defendant_name} entered a plea of ${plea}. ${plea === 'not guilty' ? 'Case set for trial.' : 'Sentencing hearing scheduled.'}`,
		canonChunkIds: [CANON.gideon],
		orderIndex: 4,
	});

	if (plea === 'guilty') {
		// Short path: sentencing
		events.push({
			eventType: 'sentencing',
			eventDate: addDays(incidentDate, arraignmentDay + jitter(c.case_id + 'sent', 30, 60)),
			description: `Sentencing hearing held. Court considered guidelines range, nature of offense, and defendant's criminal history. ${c.defendant_name} sentenced pursuant to plea agreement.`,
			canonChunkIds: [],
			orderIndex: 5,
		});
		return events;
	}

	// 6. Discovery
	const discoveryDay = arraignmentDay + jitter(c.case_id + 'disc', 14, 30);
	events.push({
		eventType: 'discovery',
		eventDate: addDays(incidentDate, discoveryDay),
		description: `Discovery phase commenced. Government produced ${h % 5 + 2} boxes of documents and electronic records. Defense filed Brady/Giglio request for exculpatory material.${h % 4 === 0 ? ' Motion to compel additional discovery filed by defense.' : ''}`,
		canonChunkIds: [],
		orderIndex: 5,
	});

	// 7. Pretrial motions
	const motionDay = discoveryDay + jitter(c.case_id + 'motion', 21, 45);
	const motionTypes = getMotionDescription(c, h);
	events.push({
		eventType: 'pretrial_motion',
		eventDate: addDays(incidentDate, motionDay),
		description: motionTypes.description,
		canonChunkIds: motionTypes.canonChunkIds,
		orderIndex: 6,
	});

	// 8. Trial
	const trialDay = motionDay + jitter(c.case_id + 'trial', 30, 90);
	const trialDuration = jitter(c.case_id + 'dur', 3, 10);
	events.push({
		eventType: 'trial',
		eventDate: addDays(incidentDate, trialDay),
		description: `Jury trial commenced before ${isFederal ? 'U.S. District Judge' : 'the Honorable Judge'}. ${trialDuration}-day trial. Prosecution presented ${h % 4 + 3} witnesses. Defense called ${h % 3 + 1} witnesses. Key evidence included ${getKeyEvidence(c.category)}.`,
		canonChunkIds: [CANON.fre401, CANON.fre402, CANON.fre801],
		orderIndex: 7,
	});

	// 9. Verdict
	const verdictDay = trialDay + trialDuration;
	const verdicts = ['guilty', 'guilty', 'guilty', 'not guilty', 'guilty'];
	const verdict = verdicts[h % verdicts.length];
	events.push({
		eventType: 'verdict',
		eventDate: addDays(incidentDate, verdictDay),
		description: `Jury returned verdict of ${verdict} on ${h % 2 === 0 ? 'all counts' : 'the primary count'}. ${verdict === 'guilty' ? 'Sentencing hearing scheduled.' : 'Defendant released from custody. Government considering appeal.'}`,
		canonChunkIds: [],
		orderIndex: 8,
	});

	// 10. Sentencing (if guilty)
	if (verdict === 'guilty') {
		events.push({
			eventType: 'sentencing',
			eventDate: addDays(incidentDate, verdictDay + jitter(c.case_id + 'sent', 30, 60)),
			description: `Sentencing hearing conducted. Court reviewed pre-sentence report, victim impact statements, and sentencing guidelines. ${c.defendant_name} sentenced to ${getSentence(c.category, h)}.`,
			canonChunkIds: [],
			orderIndex: 9,
		});
	}

	return events;
}

// ── Generate civil procedure events ──
function generateCivilEvents(c) {
	const incidentDate = c.incident_date;
	const h = caseHash(c.case_id);
	const events = [];

	// 1. Filing
	events.push({
		eventType: 'complaint_filed',
		eventDate: addDays(incidentDate, jitter(c.case_id, 30, 90)),
		description: `Plaintiff filed ${c.category === 'tort_federal' ? 'federal tort claim' : c.category === 'federal_employee_liability' ? 'civil complaint under FTCA' : 'breach of contract action'} against ${c.defendant_name}. ${c.financial_loss ? 'Damages sought: $' + Number(c.financial_loss).toLocaleString() + '.' : ''}`,
		canonChunkIds: c.category === 'federal_employee_liability' ? ['7030c997:0:e5d02ad610b670af'] : [],
		orderIndex: 0,
	});

	// 2. Service + Answer
	const serviceDay = jitter(c.case_id, 30, 90) + jitter(c.case_id + 'svc', 14, 21);
	events.push({
		eventType: 'answer_filed',
		eventDate: addDays(incidentDate, serviceDay),
		description: `Defendant ${c.defendant_name} filed answer denying material allegations.${h % 3 === 0 ? ' Counterclaim asserted.' : ''} ${h % 4 === 0 ? 'Affirmative defenses included statute of limitations and contributory negligence.' : ''}`,
		canonChunkIds: [],
		orderIndex: 1,
	});

	// 3. Scheduling conference
	const confDay = serviceDay + jitter(c.case_id + 'conf', 14, 28);
	events.push({
		eventType: 'scheduling_conference',
		eventDate: addDays(incidentDate, confDay),
		description: `Initial scheduling conference held. Court set discovery deadline, dispositive motion deadline, and trial date. ${h % 3 === 0 ? 'Parties referred to mediation.' : 'Case management order entered.'}`,
		canonChunkIds: [],
		orderIndex: 2,
	});

	// 4. Discovery
	const discoveryDay = confDay + jitter(c.case_id + 'disc', 30, 60);
	events.push({
		eventType: 'discovery',
		eventDate: addDays(incidentDate, discoveryDay),
		description: `Written discovery exchanged. ${h % 2 === 0 ? 'Depositions of key witnesses conducted.' : 'Interrogatories and requests for production served.'} ${h % 5 === 0 ? 'Motion to compel discovery filed.' : ''}`,
		canonChunkIds: [],
		orderIndex: 3,
	});

	// 5. Summary judgment motion
	const sjDay = discoveryDay + jitter(c.case_id + 'sj', 30, 45);
	const sjGranted = h % 5 === 0;
	events.push({
		eventType: 'summary_judgment',
		eventDate: addDays(incidentDate, sjDay),
		description: `${h % 2 === 0 ? 'Defendant' : 'Plaintiff'} filed motion for summary judgment. Court ${sjGranted ? 'granted summary judgment, disposing of the case' : 'denied the motion, finding genuine issues of material fact remain for trial'}.`,
		canonChunkIds: [],
		orderIndex: 4,
	});

	if (sjGranted) return events;

	// 6. Mediation/Settlement attempt
	if (h % 3 !== 0) {
		events.push({
			eventType: 'mediation',
			eventDate: addDays(incidentDate, sjDay + jitter(c.case_id + 'med', 14, 30)),
			description: `Court-ordered mediation conducted. ${h % 2 === 0 ? 'Parties reached partial agreement on liability; damages remain in dispute.' : 'Mediation unsuccessful. Case proceeds to trial.'}`,
			canonChunkIds: [],
			orderIndex: 5,
		});
	}

	// 7. Trial
	const trialDay = sjDay + jitter(c.case_id + 'trial', 45, 90);
	const benchOrJury = h % 3 === 0 ? 'bench' : 'jury';
	events.push({
		eventType: 'trial',
		eventDate: addDays(incidentDate, trialDay),
		description: `${benchOrJury === 'jury' ? 'Jury' : 'Bench'} trial commenced. ${jitter(c.case_id + 'dur', 2, 5)}-day trial. Testimony from ${h % 3 + 2} fact witnesses and ${h % 2 + 1} expert witnesses. Key evidence: ${getCivilEvidence(c.category)}.`,
		canonChunkIds: [CANON.fre401, CANON.fre803],
		orderIndex: 6,
	});

	// 8. Verdict/Judgment
	const verdictDay = trialDay + jitter(c.case_id + 'dur', 2, 5);
	const plaintiffWins = h % 3 !== 2;
	events.push({
		eventType: 'judgment',
		eventDate: addDays(incidentDate, verdictDay),
		description: `${benchOrJury === 'jury' ? 'Jury' : 'Court'} ${plaintiffWins ? 'found in favor of plaintiff' : 'found in favor of defendant'}. ${plaintiffWins && c.financial_loss ? 'Damages awarded: $' + Math.round(Number(c.financial_loss) * (0.4 + (h % 6) * 0.1)).toLocaleString() + '.' : ''} ${!plaintiffWins ? 'Complaint dismissed with prejudice.' : ''}`,
		canonChunkIds: [],
		orderIndex: 7,
	});

	return events;
}

function getStatuteChunks(category) {
	const map = {
		wire_fraud: [CANON.wirefraud, CANON.mailfraud],
		drug_trafficking: [],
		firearms: [CANON.firearms],
		cybercrime: [CANON.compfraud],
		obstruction: [CANON.obstruction1512, CANON.obstruction1519],
	};
	return map[category] || [];
}

function getMotionDescription(c, h) {
	const motions = [
		{
			description: `Defense filed motion to suppress evidence obtained during search of defendant's ${c.category === 'cybercrime' ? 'electronic devices' : 'premises'}, arguing Fourth Amendment violation. Government opposed. Court ${h % 3 === 0 ? 'granted the motion in part' : 'denied the motion'}.`,
			canonChunkIds: [CANON.mapp, CANON.katz],
		},
		{
			description: `Defense filed motion in limine to exclude ${c.category === 'wire_fraud' ? 'financial records' : 'witness testimony'} as hearsay. Government argued business records exception. Court ${h % 2 === 0 ? 'excluded certain statements' : 'admitted the evidence under FRE 803(6)'}.`,
			canonChunkIds: [CANON.fre801, CANON.fre802, CANON.fre803],
		},
		{
			description: `Defense moved to dismiss for insufficient evidence. Court reviewed the indictment and prosecution's proffer. Motion ${h % 4 === 0 ? 'granted on one count' : 'denied'}. Prosecution also filed motion under FRE 403 to limit prejudicial evidence.`,
			canonChunkIds: [CANON.fre403],
		},
	];
	return motions[h % motions.length];
}

function getKeyEvidence(category) {
	const map = {
		wire_fraud: 'wire transfer records, email communications, and financial statements',
		drug_trafficking: 'surveillance footage, controlled buy recordings, and lab analysis results',
		firearms: 'recovered firearm, ATF trace report, and prior conviction records',
		cybercrime: 'server logs, digital forensic analysis, and network traffic captures',
		obstruction: 'communications records, witness testimony regarding threats, and documentary evidence',
	};
	return map[category] || 'documentary evidence and witness testimony';
}

function getCivilEvidence(category) {
	const map = {
		verbal_contracts: 'text messages, witness testimony regarding oral agreement, and partial performance documentation',
		tort_federal: 'incident reports, medical records, expert damage assessments, and agency correspondence',
		federal_employee_liability: 'employment records, agency investigation files, whistleblower complaints, and expert testimony',
	};
	return map[category] || 'documentary evidence and expert testimony';
}

function getSentence(category, h) {
	const map = {
		wire_fraud: `${h % 10 + 18} months federal imprisonment and $${((h % 30 + 10) * 25000).toLocaleString()} in restitution`,
		drug_trafficking: `${h % 15 + 36} months federal imprisonment${h % 3 === 0 ? ' and 3 years supervised release' : ''}`,
		firearms: `${h % 8 + 12} months imprisonment${h % 2 === 0 ? ' followed by 2 years supervised release' : ''}`,
		cybercrime: `${h % 12 + 12} months federal imprisonment, $${((h % 20 + 5) * 10000).toLocaleString()} in restitution, and 3 years supervised release`,
		obstruction: `${h % 6 + 6} months imprisonment${h % 4 === 0 ? ' (concurrent with related sentence)' : ''}`,
	};
	return map[category] || `${h % 10 + 12} months imprisonment`;
}

async function main() {
	console.log('\n=== Generating Fictional Case Events ===\n');

	// Check for existing events
	const { rows: [{ c: existingCount }] } = await pool.query('SELECT count(*) as c FROM fictional_case_events');
	if (Number(existingCount) > 0) {
		console.log(`Found ${existingCount} existing events. Clearing...`);
		await pool.query('DELETE FROM fictional_case_events');
	}

	// Fetch all fictional cases
	const { rows: cases } = await pool.query(`
		SELECT id, case_id, category, charge, primary_statute, defendant_name,
		       incident_date, jurisdiction_city, jurisdiction, financial_loss
		FROM fictional_cases
		ORDER BY created_at
	`);

	console.log(`Generating events for ${cases.length} cases...\n`);

	let totalEvents = 0;
	let criminalCount = 0;
	let civilCount = 0;
	const eventTypeCounts = {};

	for (const c of cases) {
		const isCriminal = CRIMINAL_CATEGORIES.has(c.category);
		const events = isCriminal ? generateCriminalEvents(c) : generateCivilEvents(c);

		if (isCriminal) criminalCount++;
		else civilCount++;

		// Batch insert events for this case
		for (const evt of events) {
			await pool.query(
				`INSERT INTO fictional_case_events
				 (fictional_case_id, event_type, event_date, description, canon_chunk_ids, order_index, metadata)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[
					c.id,
					evt.eventType,
					evt.eventDate,
					evt.description,
					JSON.stringify(evt.canonChunkIds),
					evt.orderIndex,
					JSON.stringify({ generated: true, procedure_type: isCriminal ? 'criminal' : 'civil' }),
				]
			);
			eventTypeCounts[evt.eventType] = (eventTypeCounts[evt.eventType] || 0) + 1;
		}

		totalEvents += events.length;
		process.stdout.write('.');
	}

	// Final counts
	const { rows: [{ c: finalCount }] } = await pool.query('SELECT count(*) as c FROM fictional_case_events');

	console.log('\n');
	console.log('╔════════════════════════════════════════════════════╗');
	console.log('║   Fictional Case Events Generation Complete        ║');
	console.log('╠════════════════════════════════════════════════════╣');
	console.log(`║  Total cases processed:    ${String(cases.length).padStart(5)}                    ║`);
	console.log(`║  Criminal procedure:       ${String(criminalCount).padStart(5)}                    ║`);
	console.log(`║  Civil procedure:          ${String(civilCount).padStart(5)}                    ║`);
	console.log(`║  Total events generated:   ${String(totalEvents).padStart(5)}                    ║`);
	console.log(`║  Events in DB:             ${String(finalCount).padStart(5)}                    ║`);
	console.log('╠════════════════════════════════════════════════════╣');

	// Event type breakdown
	const sortedTypes = Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1]);
	for (const [type, count] of sortedTypes) {
		console.log(`║  ${type.padEnd(26)} ${String(count).padStart(5)}                    ║`);
	}
	console.log('╚════════════════════════════════════════════════════╝');

	// Show a sample case timeline
	const sampleCase = cases[0];
	const { rows: sampleEvents } = await pool.query(
		`SELECT event_type, event_date, substring(description, 1, 80) as desc_preview
		 FROM fictional_case_events
		 WHERE fictional_case_id = $1
		 ORDER BY order_index`,
		[sampleCase.id]
	);

	console.log(`\nSample timeline for ${sampleCase.defendant_name} (${sampleCase.charge}):`);
	for (const evt of sampleEvents) {
		console.log(`  ${evt.event_date?.toISOString().slice(0, 10) || 'N/A'} | ${evt.event_type.padEnd(22)} | ${evt.desc_preview}...`);
	}

	await pool.end();
}

main().catch((err) => {
	console.error('Fatal:', err);
	pool.end();
	process.exit(1);
});
