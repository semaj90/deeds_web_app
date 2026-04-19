/**
 * seed-research-summaries.mjs
 *
 * Seeds research_summaries with 40 legal research entries, each embedded via
 * Ollama embeddinggemma:latest (768-dim). Needed for P6-C graph build (k-means ≥40).
 *
 * Usage: node scripts/tests/seed-research-summaries.mjs
 */

import pg from 'pg';

const DB_URL    = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const EMBED_URL = 'http://localhost:11434/api/embed';
const MODEL     = 'embeddinggemma:latest';
const BATCH     = 8; // embed 8 at a time to stay under Ollama token limits

const ENTRIES = [
  { query: 'hearsay evidence exceptions federal rules', pipeline: 'ace', entity_type: 'evidence',
    summary: 'Hearsay is an out-of-court statement offered for the truth of the matter asserted. FRE 803 lists 23 exceptions including present sense impression, excited utterance, and business records. FRE 804 adds declarant-unavailability exceptions such as former testimony and dying declarations.',
    entity_tags: ['hearsay', 'evidence', 'federal rules', 'exceptions', 'admissibility'] },

  { query: 'Fourth Amendment unreasonable search and seizure exclusionary rule', pipeline: 'rag', entity_type: 'constitutional',
    summary: 'The Fourth Amendment prohibits unreasonable searches and seizures without a warrant supported by probable cause. The exclusionary rule bars illegally obtained evidence under Mapp v Ohio. Exceptions include good faith, inevitable discovery, independent source, and attenuation.',
    entity_tags: ['Fourth Amendment', 'search and seizure', 'probable cause', 'exclusionary rule', 'warrant'] },

  { query: 'statute of limitations discovery rule California civil claims', pipeline: 'ace', entity_type: 'civil_procedure',
    summary: 'California Code of Civil Procedure sets varying limitations periods: 2 years for personal injury, 3 years for fraud, 4 years for written contracts. The discovery rule tolls limitations until plaintiff knew or reasonably should have known of injury and its cause.',
    entity_tags: ['statute of limitations', 'discovery rule', 'California', 'civil claims', 'tolling'] },

  { query: 'elements of negligence duty breach causation damages', pipeline: 'rag', entity_type: 'tort',
    summary: 'Negligence requires: (1) duty of care, (2) breach of that duty by failing to meet the reasonable person standard, (3) actual and proximate causation, and (4) damages. Negligence per se arises when a statute creates the standard of care and defendant violates it.',
    entity_tags: ['negligence', 'duty', 'breach', 'causation', 'damages', 'tort'] },

  { query: 'Miranda rights Fifth Amendment custodial interrogation waiver', pipeline: 'ace', entity_type: 'criminal',
    summary: 'Miranda v Arizona requires police to advise suspects of rights to silence and counsel before custodial interrogation. A valid waiver must be knowing, voluntary, and intelligent. Invocation must be unambiguous; police must immediately cease questioning.',
    entity_tags: ['Miranda', 'Fifth Amendment', 'custodial interrogation', 'waiver', 'right to counsel'] },

  { query: 'attorney client privilege confidentiality crime fraud exception', pipeline: 'kag', entity_type: 'privilege',
    summary: 'Attorney-client privilege protects confidential communications made for the purpose of obtaining legal advice. The crime-fraud exception pierces privilege when the client seeks assistance in committing a future crime or fraud. Waiver occurs through voluntary disclosure.',
    entity_tags: ['attorney-client privilege', 'confidentiality', 'crime-fraud exception', 'waiver'] },

  { query: 'res judicata collateral estoppel claim preclusion issue preclusion', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'Res judicata (claim preclusion) bars relitigation of all claims arising from the same transaction that were or could have been raised. Collateral estoppel (issue preclusion) bars relitigation of specific issues actually litigated and necessarily decided in prior proceedings.',
    entity_tags: ['res judicata', 'collateral estoppel', 'claim preclusion', 'issue preclusion'] },

  { query: 'chain of custody evidence authentication admissibility standards', pipeline: 'ace', entity_type: 'evidence',
    summary: 'Chain of custody documents the handling of physical evidence from collection through trial to establish authenticity and integrity. FRE 901 requires authentication sufficient to support a finding that the item is what the proponent claims. Gaps affect weight not admissibility.',
    entity_tags: ['chain of custody', 'authentication', 'admissibility', 'physical evidence', 'FRE 901'] },

  { query: 'mens rea actus reus criminal intent elements of crime', pipeline: 'ace', entity_type: 'criminal',
    summary: 'Criminal liability requires both actus reus (guilty act) and mens rea (guilty mind). MPC mental states: purpose, knowledge, recklessness, negligence. Strict liability crimes require only actus reus. Specific intent crimes require proof defendant acted with a particular mental purpose.',
    entity_tags: ['mens rea', 'actus reus', 'criminal intent', 'Model Penal Code', 'strict liability'] },

  { query: 'habeas corpus petition ineffective assistance of counsel Strickland standard', pipeline: 'kag', entity_type: 'criminal',
    summary: 'Federal habeas corpus under 28 USC 2254 allows state prisoners to challenge unconstitutional confinement. Ineffective assistance under Strickland v Washington requires: (1) deficient performance below objective reasonableness, and (2) prejudice—reasonable probability outcome would differ.',
    entity_tags: ['habeas corpus', 'ineffective assistance', 'Strickland', 'Sixth Amendment', 'prejudice'] },

  { query: 'Brady disclosure exculpatory material due process Giglio impeachment', pipeline: 'ace', entity_type: 'criminal',
    summary: 'Brady v Maryland requires prosecutors to disclose material exculpatory evidence before trial. Giglio extends this to impeachment evidence undermining witness credibility. Suppressed evidence is material if there is reasonable probability of different outcome absent the suppression.',
    entity_tags: ['Brady', 'exculpatory evidence', 'due process', 'Giglio', 'impeachment', 'disclosure'] },

  { query: 'summary judgment motion standard genuine dispute material fact FRCP 56', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'FRCP 56 grants summary judgment when no genuine dispute of material fact exists and movant is entitled to judgment as a matter of law. The non-moving party must present specific facts showing a triable issue. Courts view facts in light most favorable to non-movant.',
    entity_tags: ['summary judgment', 'FRCP 56', 'genuine dispute', 'material fact', 'burden of proof'] },

  { query: 'Daubert standard expert testimony scientific reliability admissibility', pipeline: 'ace', entity_type: 'evidence',
    summary: 'Daubert v Merrell Dow requires trial judges to act as gatekeepers for expert testimony under FRE 702. Factors include: testability, peer review, error rates, and general acceptance. Kumho Tire extends Daubert to technical and other specialized knowledge.',
    entity_tags: ['Daubert', 'expert testimony', 'scientific reliability', 'FRE 702', 'gatekeeping'] },

  { query: 'class action certification requirements FRCP 23 commonality typicality adequacy', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'FRCP 23(a) requires: numerosity, commonality, typicality, and adequacy of representation. Rule 23(b) requires action to fall into category (1) inconsistent adjudications, (2) injunctive/declaratory relief, or (3) predominance of common questions and superiority.',
    entity_tags: ['class action', 'FRCP 23', 'certification', 'commonality', 'typicality', 'adequacy'] },

  { query: 'personal jurisdiction minimum contacts due process International Shoe', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'International Shoe requires minimum contacts such that maintenance of suit does not offend traditional notions of fair play and substantial justice. Specific jurisdiction arises from forum-related activities. General jurisdiction requires continuous and systematic contacts making defendant essentially at home.',
    entity_tags: ['personal jurisdiction', 'minimum contacts', 'due process', 'International Shoe', 'forum'] },

  { query: 'contract formation offer acceptance consideration breach remedies', pipeline: 'ace', entity_type: 'contract',
    summary: 'A binding contract requires offer, acceptance, and consideration. Consideration is a bargained-for exchange of legal value. Breach occurs when a party fails to perform a contractual obligation. Remedies include expectation damages, consequential damages, specific performance, and restitution.',
    entity_tags: ['contract', 'offer', 'acceptance', 'consideration', 'breach', 'remedies'] },

  { query: 'promissory estoppel detrimental reliance equitable remedy', pipeline: 'kag', entity_type: 'contract',
    summary: 'Promissory estoppel substitutes for consideration when: (1) a clear and definite promise, (2) reasonable and foreseeable reliance, (3) actual detrimental reliance, and (4) injustice without enforcement. Used to enforce otherwise unenforceable promises under Restatement Second of Contracts § 90.',
    entity_tags: ['promissory estoppel', 'detrimental reliance', 'consideration', 'equitable remedy'] },

  { query: 'fraud misrepresentation elements scienter intent to deceive justifiable reliance', pipeline: 'ace', entity_type: 'tort',
    summary: 'Common law fraud requires: (1) false representation of material fact, (2) knowledge of falsity or reckless disregard (scienter), (3) intent to induce reliance, (4) justifiable reliance, and (5) resulting damages. Negligent misrepresentation requires less culpable mental state.',
    entity_tags: ['fraud', 'misrepresentation', 'scienter', 'reliance', 'damages', 'material fact'] },

  { query: 'strict products liability design defect manufacturing defect failure to warn', pipeline: 'rag', entity_type: 'tort',
    summary: 'Products liability covers manufacturing defects (deviation from intended design), design defects (entire line unreasonably dangerous under consumer expectations or risk-utility test), and failure to warn of non-obvious dangers. Restatement Third Products Liability applies risk-utility test for design defects.',
    entity_tags: ['products liability', 'design defect', 'manufacturing defect', 'failure to warn', 'strict liability'] },

  { query: 'First Amendment free speech time place manner restrictions content neutral', pipeline: 'kag', entity_type: 'constitutional',
    summary: 'Content-based speech restrictions receive strict scrutiny. Content-neutral time, place, and manner regulations are upheld if: (1) justified without reference to content, (2) narrowly tailored to serve significant government interest, and (3) leave open ample alternative channels.',
    entity_tags: ['First Amendment', 'free speech', 'content neutral', 'strict scrutiny', 'time place manner'] },

  { query: 'equal protection strict scrutiny suspect classification race national origin', pipeline: 'ace', entity_type: 'constitutional',
    summary: 'Equal protection requires government treat similarly situated people alike. Strict scrutiny applies to suspect classifications (race, national origin) requiring compelling government interest and narrow tailoring. Intermediate scrutiny applies to quasi-suspect classifications (sex, legitimacy). Rational basis applies to economic/social legislation.',
    entity_tags: ['equal protection', 'strict scrutiny', 'suspect class', 'rational basis', 'intermediate scrutiny'] },

  { query: 'due process substantive procedural liberty property interest deprivation', pipeline: 'rag', entity_type: 'constitutional',
    summary: 'Substantive due process protects fundamental rights (marriage, contraception, child-rearing) from government interference absent compelling interest. Procedural due process requires notice and meaningful opportunity to be heard before deprivation of protected life, liberty, or property interests.',
    entity_tags: ['due process', 'substantive', 'procedural', 'liberty interest', 'property interest'] },

  { query: 'Title VII employment discrimination disparate treatment disparate impact McDonnell Douglas', pipeline: 'ace', entity_type: 'employment',
    summary: 'Title VII prohibits employment discrimination based on race, sex, religion, national origin. McDonnell Douglas burden-shifting: plaintiff establishes prima facie case, burden shifts to employer to articulate legitimate reason, plaintiff shows pretext. Disparate impact claims require showing facially neutral policy disproportionately affects protected class.',
    entity_tags: ['Title VII', 'employment discrimination', 'disparate treatment', 'disparate impact', 'McDonnell Douglas'] },

  { query: 'copyright infringement substantial similarity originality fair use defense', pipeline: 'kag', entity_type: 'intellectual_property',
    summary: 'Copyright protects original works of authorship fixed in tangible medium. Infringement requires copying and substantial similarity to protectable expression. Fair use defense considers: (1) purpose and character of use, (2) nature of work, (3) amount taken, (4) market effect.',
    entity_tags: ['copyright', 'infringement', 'substantial similarity', 'originality', 'fair use'] },

  { query: 'Fourth Amendment digital privacy cell phone search warrant Carpenter', pipeline: 'ace', entity_type: 'constitutional',
    summary: 'Carpenter v United States held that government access to CSLI records constitutes a Fourth Amendment search requiring a warrant. The third-party doctrine does not apply to comprehensive digital records. Warrantless acquisition of seven or more days of CSLI is unconstitutional.',
    entity_tags: ['Fourth Amendment', 'digital privacy', 'CSLI', 'Carpenter', 'third-party doctrine', 'warrant'] },

  { query: 'qualified immunity excessive force Section 1983 clearly established right', pipeline: 'rag', entity_type: 'civil_rights',
    summary: 'Section 1983 provides cause of action against state actors for constitutional violations. Qualified immunity shields officers unless they violated clearly established statutory or constitutional right that reasonable person would have known. Graham v Connor uses objective reasonableness standard for excessive force claims.',
    entity_tags: ['qualified immunity', 'Section 1983', 'excessive force', 'clearly established', 'civil rights'] },

  { query: 'best evidence rule original document secondary evidence FRE 1002', pipeline: 'ace', entity_type: 'evidence',
    summary: 'FRE 1002 requires original writing, recording, or photograph to prove its content. Exceptions under FRE 1003-1004 allow duplicates and secondary evidence when original is lost, destroyed, or unobtainable. FRE 1007 permits admission of opponent\'s testimony about content.',
    entity_tags: ['best evidence rule', 'original document', 'FRE 1002', 'duplicate', 'secondary evidence'] },

  { query: 'attorney fees prevailing party fee shifting civil rights ERISA', pipeline: 'kag', entity_type: 'remedies',
    summary: 'American Rule requires parties to bear their own fees absent statutory authorization. Civil Rights Attorney Fees Award Act (42 USC 1988) allows prevailing party fees in Section 1983 cases. Lodestar method multiplies reasonable hours by reasonable hourly rate. Exceptional cases under 35 USC 285 in patent litigation.',
    entity_tags: ['attorney fees', 'fee shifting', 'prevailing party', 'lodestar', '42 USC 1988'] },

  { query: 'preliminary injunction Ninth Circuit four factor Winter standard irreparable harm', pipeline: 'rag', entity_type: 'remedies',
    summary: 'Winter v NRDC requires: (1) likelihood of success on merits, (2) likelihood of irreparable harm absent preliminary relief, (3) balance of equities tips in movant\'s favor, and (4) preliminary injunction in the public interest. Sliding scale approach rejected by Winter.',
    entity_tags: ['preliminary injunction', 'Winter standard', 'irreparable harm', 'likelihood of success', 'Ninth Circuit'] },

  { query: 'standing injury in fact traceability redressability Lujan Article III', pipeline: 'kag', entity_type: 'constitutional',
    summary: 'Article III standing requires: (1) concrete and particularized injury in fact, (2) causation—fairly traceable to defendant\'s conduct, and (3) redressability—likely to be redressed by favorable decision. Lujan v Defenders of Wildlife established these constitutional minimums. Organizational standing requires member injury.',
    entity_tags: ['standing', 'injury in fact', 'traceability', 'redressability', 'Lujan', 'Article III'] },

  { query: 'business judgment rule duty of care corporate directors fiduciary', pipeline: 'ace', entity_type: 'corporate',
    summary: 'Business judgment rule protects corporate directors from liability for decisions made in good faith, with due care, and in honest belief they serve corporate interests. Duty of care requires informed decision-making. Enhanced scrutiny applies to change of control transactions under Revlon.',
    entity_tags: ['business judgment rule', 'duty of care', 'fiduciary duty', 'corporate directors', 'Revlon'] },

  { query: 'bankruptcy automatic stay Chapter 7 exemptions discharge of debt', pipeline: 'rag', entity_type: 'bankruptcy',
    summary: 'Filing bankruptcy petition triggers automatic stay preventing all collection actions against debtor or property. Chapter 7 liquidation discharges most unsecured debts after exempt property is protected. Non-dischargeable debts include student loans, alimony, child support, and debts from fraud.',
    entity_tags: ['bankruptcy', 'automatic stay', 'Chapter 7', 'discharge', 'exemptions', 'non-dischargeable'] },

  { query: 'confrontation clause Sixth Amendment testimonial hearsay Crawford Davis', pipeline: 'ace', entity_type: 'criminal',
    summary: 'Crawford v Washington holds Confrontation Clause bars testimonial hearsay unless declarant is unavailable and defendant had prior opportunity to cross-examine. Davis v Washington distinguishes testimonial (primary purpose to establish past facts) from nontestimonial (ongoing emergency) statements.',
    entity_tags: ['Confrontation Clause', 'Sixth Amendment', 'testimonial', 'hearsay', 'Crawford', 'Davis'] },

  { query: 'Fourth Amendment automobile exception Carroll doctrine warrantless search', pipeline: 'rag', entity_type: 'constitutional',
    summary: 'Carroll doctrine allows warrantless search of automobile when officer has probable cause to believe contraband or evidence is present. The entire vehicle including containers may be searched. Reduced expectation of privacy in vehicles due to mobility and pervasive regulation.',
    entity_tags: ['automobile exception', 'Carroll doctrine', 'probable cause', 'warrantless search', 'Fourth Amendment'] },

  { query: 'Eighth Amendment cruel unusual punishment proportionality death penalty Graham', pipeline: 'kag', entity_type: 'constitutional',
    summary: 'Eighth Amendment prohibits grossly disproportionate punishments. Atkins v Virginia bars execution of intellectually disabled; Roper v Simmons bars juvenile death penalty. Graham v Florida prohibits life without parole for juveniles committing non-homicide offenses.',
    entity_tags: ['Eighth Amendment', 'cruel unusual punishment', 'proportionality', 'death penalty', 'juvenile'] },

  { query: 'double jeopardy Fifth Amendment same elements Blockburger successive prosecutions', pipeline: 'ace', entity_type: 'criminal',
    summary: 'Double Jeopardy Clause bars successive prosecutions and cumulative punishment for same offense. Blockburger test: two crimes are same offense unless each requires proof of fact the other does not. Dual sovereignty doctrine allows both federal and state prosecution for same conduct.',
    entity_tags: ['double jeopardy', 'Fifth Amendment', 'Blockburger', 'same offense', 'dual sovereignty'] },

  { query: 'voir dire jury selection peremptory challenges Batson challenge race sex', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'Voir dire is the juror selection process. Batson v Kentucky prohibits race-based peremptory challenges. J.E.B. v Alabama extends Batson to sex discrimination. Three-step Batson process: prima facie showing, race-neutral explanation, pretext determination by trial court.',
    entity_tags: ['voir dire', 'peremptory challenges', 'Batson', 'jury selection', 'race discrimination'] },

  { query: 'spoliation evidence sanctions adverse inference instruction bad faith', pipeline: 'ace', entity_type: 'evidence',
    summary: 'Spoliation is destruction or material alteration of evidence. FRCP 37(e) governs ESI spoliation. Courts may impose sanctions including adverse inference instruction, striking pleadings, or dismissal. Adverse inference requires showing: duty to preserve, culpable mind, prejudice.',
    entity_tags: ['spoliation', 'adverse inference', 'sanctions', 'FRCP 37', 'duty to preserve', 'bad faith'] },

  { query: 'federal preemption supremacy clause conflict preemption field preemption', pipeline: 'kag', entity_type: 'constitutional',
    summary: 'Supremacy Clause preempts conflicting state law. Express preemption: Congress explicitly states intent. Conflict preemption: impossible to comply with both laws or state law stands as obstacle to federal objectives. Field preemption: federal regulation so pervasive it occupies entire field.',
    entity_tags: ['preemption', 'supremacy clause', 'conflict preemption', 'field preemption', 'federal'] },

  { query: 'writ of certiorari Supreme Court discretionary review circuit split', pipeline: 'rag', entity_type: 'civil_procedure',
    summary: 'Supreme Court review is discretionary via writ of certiorari, requiring four justices to grant (Rule of Four). Court typically grants cert to resolve circuit splits, important federal questions, or errors by lower courts. Approximately 1% of petitions are granted annually.',
    entity_tags: ['certiorari', 'Supreme Court', 'discretionary review', 'circuit split', 'Rule of Four'] },

  { query: 'qui tam False Claims Act whistleblower relator government contractor fraud', pipeline: 'ace', entity_type: 'regulatory',
    summary: 'False Claims Act allows private relators to file qui tam actions on government\'s behalf and receive 15-30% of recovery. Protects against fraud on federal government including Medicare/Medicaid fraud, defense contractor fraud. Government may intervene and control litigation.',
    entity_tags: ['qui tam', 'False Claims Act', 'whistleblower', 'relator', 'government fraud', 'Medicare'] },

  { query: 'RICO enterprise pattern racketeering predicate acts civil treble damages', pipeline: 'kag', entity_type: 'criminal',
    summary: 'RICO requires enterprise plus pattern of racketeering activity (two predicate acts within 10 years). Civil RICO under 18 USC 1964(c) allows treble damages plus attorney fees. Predicate acts include mail fraud, wire fraud, extortion, and drug trafficking.',
    entity_tags: ['RICO', 'racketeering', 'predicate acts', 'civil RICO', 'enterprise', 'treble damages'] },

  { query: 'specific performance injunction equitable remedy contract real property unique', pipeline: 'ace', entity_type: 'remedies',
    summary: 'Specific performance is an equitable remedy requiring breach party to perform contract obligations. Available when damages are inadequate, typically for unique goods or real property. Court requires certainty of terms, valid contract, plaintiff\'s performance or tender, and no equitable defenses.',
    entity_tags: ['specific performance', 'injunction', 'equitable remedy', 'real property', 'unique goods'] },
];

async function batchEmbed(texts) {
  const resp = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`Ollama embed ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.embeddings ?? [];
}

function fnv1a(text) {
  let h = 2166136261;
  for (let i = 0; i < Math.min(text.length, 512); i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function main() {
  const client = new pg.Client(DB_URL);
  await client.connect();

  try {
    console.log(`Embedding ${ENTRIES.length} summaries via Ollama ${MODEL}…`);

    // Process in batches
    let inserted = 0;
    for (let i = 0; i < ENTRIES.length; i += BATCH) {
      const slice = ENTRIES.slice(i, i + BATCH);
      const texts = slice.map(e => e.summary);

      let vectors = [];
      try {
        vectors = await batchEmbed(texts);
        console.log(`  batch ${Math.floor(i/BATCH)+1}: ${vectors.length} embeddings`);
      } catch (err) {
        console.warn(`  batch ${Math.floor(i/BATCH)+1}: embed failed — inserting without vector: ${err.message}`);
      }

      for (let j = 0; j < slice.length; j++) {
        const e = slice[j];
        const vec = vectors[j];
        const vecLiteral = vec?.length ? `[${vec.join(',')}]` : null;

        await client.query(
          `INSERT INTO research_summaries
             (source, pipeline, entity_type, query, query_hash, title,
              url, collection, citation_label, section_path, jurisdiction,
              summary, entity_tags, relevance_score, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::vector(768))
           ON CONFLICT DO NOTHING`,
          [
            'corpus', e.pipeline, e.entity_type,
            e.query, fnv1a(e.query),
            e.query.slice(0, 120),   // title
            null, null, null, null, null,
            e.summary,
            e.entity_tags,
            0.85,
            vecLiteral,
          ]
        );
        inserted++;
      }
    }

    const { rows } = await client.query(
      `SELECT COUNT(*) AS total, COUNT(embedding) AS with_embed FROM research_summaries`
    );
    console.log(`\nDone. Inserted ${inserted} rows.`);
    console.log(`research_summaries total=${rows[0].total}, with_embedding=${rows[0].with_embed}`);

  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
