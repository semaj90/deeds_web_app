-- Seed research_summaries with 45 diverse legal research entries
-- Required for P6-C research graph build (needs >= 40 rows)

INSERT INTO research_summaries (source, pipeline, entity_type, query, query_hash, title, summary, entity_tags, relevance_score, jurisdiction) VALUES

-- Federal Rules of Evidence
('corpus', 'ace', 'legal_rule', 'Federal Rules of Evidence Rule 401', 'a1b2c3d4',
 'FRE 401 — Test for Relevant Evidence',
 'Evidence is relevant if it has any tendency to make a fact more or less probable than it would be without the evidence, and the fact is of consequence in determining the action. This is the broadest possible standard for admissibility.',
 ARRAY['FRE', 'relevance', 'admissibility'], 0.92, 'federal'),

('corpus', 'ace', 'legal_rule', 'Federal Rules of Evidence Rule 403', 'b2c3d4e5',
 'FRE 403 — Excluding Relevant Evidence for Prejudice',
 'The court may exclude relevant evidence if its probative value is substantially outweighed by a danger of unfair prejudice, confusing the issues, misleading the jury, undue delay, wasting time, or needlessly presenting cumulative evidence.',
 ARRAY['FRE', 'prejudice', 'exclusion', 'balancing test'], 0.91, 'federal'),

('corpus', 'ace', 'legal_rule', 'Federal Rules of Evidence Rule 702', 'c3d4e5f6',
 'FRE 702 — Testimony by Expert Witnesses',
 'A witness who is qualified as an expert by knowledge, skill, experience, training, or education may testify in the form of an opinion if the testimony is based on sufficient facts or data, the testimony is the product of reliable principles and methods, and the expert has reliably applied the principles and methods to the facts of the case. The Daubert standard governs expert testimony admissibility.',
 ARRAY['FRE', 'expert witness', 'Daubert', 'scientific evidence'], 0.93, 'federal'),

('corpus', 'ace', 'legal_rule', 'Federal Rules of Evidence Rule 801 hearsay definition', 'd4e5f6a7',
 'FRE 801 — Definitions of Hearsay',
 'Hearsay is a statement that the declarant does not make while testifying at the current trial or hearing, and a party offers in evidence to prove the truth of the matter asserted. Prior statements by witnesses and opposing party statements are excluded from the hearsay definition under 801(d).',
 ARRAY['FRE', 'hearsay', 'declarant', 'truth of matter asserted'], 0.95, 'federal'),

('corpus', 'ace', 'legal_rule', 'Federal Rules of Evidence Rule 804 hearsay exceptions', 'e5f6a7b8',
 'FRE 804 — Hearsay Exceptions When Declarant Is Unavailable',
 'When a declarant is unavailable, exceptions include former testimony, dying declarations, statements against interest, statements of personal or family history, and the residual exception. Unavailability includes privilege, refusal, lack of memory, death or illness, and absence.',
 ARRAY['FRE', 'hearsay exception', 'unavailable declarant', 'dying declaration'], 0.90, 'federal'),

-- Constitutional Law
('research', 'ace', 'constitutional', 'Fourth Amendment search and seizure requirements', 'f6a7b8c9',
 'Fourth Amendment — Unreasonable Search and Seizure',
 'The Fourth Amendment protects against unreasonable searches and seizures by requiring warrants based on probable cause. The exclusionary rule prohibits use of illegally obtained evidence. Key exceptions include consent, plain view, exigent circumstances, search incident to arrest, and the automobile exception.',
 ARRAY['Fourth Amendment', 'search warrant', 'probable cause', 'exclusionary rule'], 0.94, 'federal'),

('research', 'ace', 'constitutional', 'Fifth Amendment due process and self-incrimination', 'a7b8c9d0',
 'Fifth Amendment — Due Process and Self-Incrimination',
 'The Fifth Amendment guarantees due process of law, protects against double jeopardy, and provides the privilege against self-incrimination. Miranda v. Arizona established that custodial interrogation requires warnings about the right to remain silent and the right to an attorney.',
 ARRAY['Fifth Amendment', 'due process', 'Miranda', 'self-incrimination'], 0.93, 'federal'),

('research', 'ace', 'constitutional', 'Sixth Amendment right to counsel', 'b8c9d0e1',
 'Sixth Amendment — Right to Counsel',
 'The Sixth Amendment guarantees the right to assistance of counsel in criminal prosecutions. Gideon v. Wainwright extended this right to state courts for felony defendants. Strickland v. Washington established the two-prong test for ineffective assistance of counsel: deficient performance and prejudice.',
 ARRAY['Sixth Amendment', 'right to counsel', 'Gideon', 'Strickland', 'ineffective assistance'], 0.92, 'federal'),

('research', 'ace', 'constitutional', 'Fourteenth Amendment equal protection', 'c9d0e1f2',
 'Fourteenth Amendment — Equal Protection Clause',
 'The Equal Protection Clause requires states to provide equal protection under the law. Courts apply three tiers of scrutiny: strict scrutiny for suspect classifications like race, intermediate scrutiny for gender, and rational basis for economic regulations. Brown v. Board of Education held that separate but equal is inherently unequal.',
 ARRAY['Fourteenth Amendment', 'equal protection', 'strict scrutiny', 'Brown v. Board'], 0.91, 'federal'),

-- Criminal Law
('research', 'ace', 'criminal', 'elements of murder and manslaughter', 'd0e1f2a3',
 'Homicide — Murder and Manslaughter Distinctions',
 'Murder requires malice aforethought, which can be express (intent to kill) or implied (reckless disregard for human life). First-degree murder requires premeditation and deliberation. Voluntary manslaughter involves intentional killing in the heat of passion upon adequate provocation. Involuntary manslaughter involves unintentional killing through criminal negligence.',
 ARRAY['murder', 'manslaughter', 'malice aforethought', 'premeditation', 'heat of passion'], 0.89, 'federal'),

('research', 'ace', 'criminal', 'mens rea criminal intent standards', 'e1f2a3b4',
 'Mens Rea — Criminal Intent Standards',
 'The Model Penal Code defines four levels of culpability: purposely (conscious object to engage in conduct), knowingly (awareness that conduct is of a particular nature), recklessly (conscious disregard of a substantial and unjustifiable risk), and negligently (should be aware of a substantial and unjustifiable risk).',
 ARRAY['mens rea', 'intent', 'MPC', 'purposely', 'knowingly', 'recklessly', 'negligently'], 0.88, 'federal'),

('research', 'ace', 'criminal', 'defenses to criminal liability', 'f2a3b4c5',
 'Criminal Defenses Overview',
 'Common defenses include self-defense (reasonable belief of imminent harm), insanity (various tests including M''Naghten and irresistible impulse), duress (threat of imminent death or serious bodily harm), necessity (lesser of two evils), entrapment (government inducement), and intoxication (voluntary vs. involuntary).',
 ARRAY['self-defense', 'insanity', 'duress', 'necessity', 'entrapment'], 0.87, 'federal'),

-- Civil Procedure
('research', 'ace', 'procedure', 'personal jurisdiction requirements', 'a3b4c5d6',
 'Personal Jurisdiction — Due Process Requirements',
 'A court must have personal jurisdiction over a defendant. General jurisdiction exists where a defendant is domiciled or has continuous and systematic contacts. Specific jurisdiction requires minimum contacts with the forum, that the claim arises from those contacts, and that the exercise of jurisdiction is reasonable. International Shoe Co. v. Washington established the minimum contacts test.',
 ARRAY['personal jurisdiction', 'minimum contacts', 'International Shoe', 'due process'], 0.90, 'federal'),

('research', 'ace', 'procedure', 'summary judgment standard Rule 56', 'b4c5d6e7',
 'Summary Judgment — FRCP Rule 56',
 'A court shall grant summary judgment if the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law. The nonmoving party must show specific facts creating a genuine issue for trial. Anderson v. Liberty Lobby held that the standard mirrors the directed verdict standard.',
 ARRAY['summary judgment', 'Rule 56', 'material fact', 'Anderson v. Liberty Lobby'], 0.89, 'federal'),

('research', 'ace', 'procedure', 'class action requirements Rule 23', 'c5d6e7f8',
 'Class Actions — FRCP Rule 23',
 'Class certification requires numerosity, commonality, typicality, and adequacy of representation. Rule 23(b) provides three types: prejudice classes (b)(1), injunctive/declaratory classes (b)(2), and damages classes (b)(3) requiring predominance and superiority. Wal-Mart v. Dukes tightened the commonality requirement.',
 ARRAY['class action', 'Rule 23', 'certification', 'commonality', 'Wal-Mart v. Dukes'], 0.88, 'federal'),

-- Contract Law
('research', 'ace', 'contract', 'contract formation offer acceptance consideration', 'd6e7f8a9',
 'Contract Formation — Offer, Acceptance, and Consideration',
 'A valid contract requires offer, acceptance, and consideration. An offer is a manifestation of willingness to enter a bargain. Acceptance must be a mirror image of the offer under common law, but the UCC allows different terms between merchants. Consideration requires a bargained-for exchange of legal value.',
 ARRAY['contract formation', 'offer', 'acceptance', 'consideration', 'UCC'], 0.87, 'federal'),

('research', 'ace', 'contract', 'statute of frauds writing requirements', 'e7f8a9b0',
 'Statute of Frauds — Writing Requirements',
 'Certain contracts must be in writing to be enforceable: contracts for the sale of land, contracts that cannot be performed within one year, contracts in consideration of marriage, suretyship agreements, and contracts for the sale of goods over $500 (UCC). The writing must identify the parties, subject matter, and essential terms.',
 ARRAY['statute of frauds', 'writing requirement', 'UCC', 'enforceability'], 0.85, 'federal'),

('research', 'ace', 'contract', 'breach of contract remedies damages', 'f8a9b0c1',
 'Breach of Contract — Remedies and Damages',
 'Remedies for breach include expectation damages (put the non-breaching party in the position they would have been in), reliance damages (restore the status quo ante), restitution (prevent unjust enrichment), specific performance (for unique goods or land), and liquidated damages (if reasonable at time of contracting). Hadley v. Baxendale limits consequential damages to foreseeable losses.',
 ARRAY['breach', 'damages', 'specific performance', 'Hadley v. Baxendale'], 0.86, 'federal'),

-- Tort Law
('research', 'ace', 'tort', 'negligence elements duty breach causation damages', 'a9b0c1d2',
 'Negligence — Four Elements',
 'Negligence requires duty, breach, causation, and damages. Duty is generally owed to all foreseeable plaintiffs (Palsgraf v. Long Island Railroad). Breach is measured by the reasonable person standard. Causation has two components: cause-in-fact (but-for test) and proximate cause (foreseeability). Damages must be actual, not speculative.',
 ARRAY['negligence', 'duty', 'breach', 'causation', 'Palsgraf', 'reasonable person'], 0.90, 'federal'),

('research', 'ace', 'tort', 'strict liability product liability', 'b0c1d2e3',
 'Strict Liability — Product Liability',
 'Under strict product liability, a manufacturer or seller is liable for a defective product that causes injury regardless of fault. Three types of defects: manufacturing defects (departure from intended design), design defects (risk-utility or consumer expectation test), and failure to warn (inadequate instructions or warnings). Restatement (Third) of Torts governs.',
 ARRAY['strict liability', 'product liability', 'manufacturing defect', 'design defect', 'failure to warn'], 0.88, 'federal'),

('research', 'ace', 'tort', 'intentional torts assault battery false imprisonment', 'c1d2e3f4',
 'Intentional Torts — Assault, Battery, False Imprisonment',
 'Battery is the intentional harmful or offensive contact with another person. Assault is the intentional creation of apprehension of imminent harmful or offensive contact. False imprisonment is the intentional confinement within fixed boundaries without consent or legal authority. Each requires intent and lack of consent.',
 ARRAY['intentional tort', 'assault', 'battery', 'false imprisonment'], 0.86, 'federal'),

-- Property Law
('research', 'ace', 'property', 'adverse possession requirements', 'd2e3f4a5',
 'Adverse Possession — Elements and Requirements',
 'Adverse possession requires possession that is actual, open and notorious, exclusive, continuous for the statutory period, and hostile (without permission). Some jurisdictions also require payment of taxes. The statutory period varies by state, typically 5-20 years. Color of title may reduce the required period.',
 ARRAY['adverse possession', 'open and notorious', 'hostile', 'statutory period'], 0.85, 'state'),

('research', 'ace', 'property', 'easements creation and types', 'e3f4a5b6',
 'Easements — Creation and Classification',
 'Easements can be created by express grant, reservation, implication, necessity, or prescription. Appurtenant easements benefit a dominant tenement and burden a servient tenement. Easements in gross benefit a person rather than land. Easements can be terminated by merger, release, abandonment, estoppel, or prescription.',
 ARRAY['easement', 'appurtenant', 'in gross', 'prescription', 'dominant tenement'], 0.84, 'state'),

-- Evidence — Expert Testimony
('corpus', 'ace', 'legal_rule', 'Daubert standard scientific evidence admissibility', 'f4a5b6c7',
 'Daubert v. Merrell Dow — Scientific Evidence Standard',
 'Daubert v. Merrell Dow Pharmaceuticals established a multi-factor test for admitting scientific expert testimony: (1) whether the theory can be and has been tested, (2) whether it has been subjected to peer review and publication, (3) the known or potential error rate, and (4) general acceptance in the relevant scientific community. The trial judge serves as a gatekeeper.',
 ARRAY['Daubert', 'expert testimony', 'scientific evidence', 'gatekeeper', 'FRE 702'], 0.94, 'federal'),

-- Criminal Procedure
('research', 'ace', 'criminal_procedure', 'Miranda rights custodial interrogation', 'a5b6c7d8',
 'Miranda v. Arizona — Custodial Interrogation Warnings',
 'Before custodial interrogation, law enforcement must inform suspects of: the right to remain silent, that anything said can be used against them, the right to an attorney, and the right to appointed counsel if indigent. Statements obtained without Miranda warnings are inadmissible. The public safety exception allows questioning without warnings in emergency situations.',
 ARRAY['Miranda', 'custodial interrogation', 'right to silence', 'public safety exception'], 0.93, 'federal'),

('research', 'ace', 'criminal_procedure', 'bail and pretrial detention', 'b6c7d8e9',
 'Bail and Pretrial Detention — Eighth Amendment',
 'The Eighth Amendment prohibits excessive bail. United States v. Salerno upheld the Bail Reform Act of 1984, which allows pretrial detention when no conditions of release can reasonably assure community safety. Factors include the nature of the offense, weight of evidence, history, and danger to the community.',
 ARRAY['bail', 'pretrial detention', 'Eighth Amendment', 'Salerno', 'Bail Reform Act'], 0.85, 'federal'),

-- Administrative Law
('research', 'ace', 'administrative', 'Chevron deference agency interpretation', 'c7d8e9f0',
 'Chevron Deference — Agency Statutory Interpretation',
 'Chevron U.S.A. v. NRDC established a two-step framework: (1) whether Congress has directly spoken to the precise question at issue, and (2) if the statute is ambiguous, whether the agency interpretation is reasonable. Courts defer to reasonable agency interpretations of ambiguous statutes they administer. NOTE: Loper Bright Enterprises v. Raimondo (2024) overruled Chevron deference.',
 ARRAY['Chevron', 'agency deference', 'statutory interpretation', 'Loper Bright'], 0.91, 'federal'),

('research', 'ace', 'administrative', 'APA rulemaking notice and comment', 'd8e9f0a1',
 'Administrative Procedure Act — Notice-and-Comment Rulemaking',
 'The APA requires agencies to publish proposed rules in the Federal Register, allow interested persons to participate through submission of comments, and publish final rules with a statement of basis and purpose. Formal rulemaking requires a trial-type hearing. Exemptions exist for interpretive rules, policy statements, and good cause.',
 ARRAY['APA', 'rulemaking', 'notice and comment', 'Federal Register'], 0.87, 'federal'),

-- Family Law
('research', 'ace', 'family', 'child custody best interests standard', 'e9f0a1b2',
 'Child Custody — Best Interests of the Child',
 'Courts determine custody based on the best interests of the child, considering factors such as the emotional ties between parent and child, capacity to provide food and shelter, mental and physical health, stability of the home environment, and the preference of the child if of sufficient age. Joint custody arrangements are increasingly favored.',
 ARRAY['child custody', 'best interests', 'joint custody', 'family law'], 0.84, 'state'),

-- Immigration Law
('research', 'ace', 'immigration', 'asylum requirements well-founded fear', 'f0a1b2c3',
 'Asylum — Well-Founded Fear of Persecution',
 'To obtain asylum, an applicant must demonstrate a well-founded fear of persecution on account of race, religion, nationality, membership in a particular social group, or political opinion. The applicant must file within one year of arrival. The one-year bar has exceptions for changed or extraordinary circumstances. Withholding of removal has a higher standard: more likely than not.',
 ARRAY['asylum', 'well-founded fear', 'persecution', 'particular social group'], 0.86, 'federal'),

-- Intellectual Property
('research', 'ace', 'ip', 'fair use copyright defense', 'a1b2c3e4',
 'Fair Use — Copyright Defense Under 17 USC 107',
 'Fair use considers four factors: (1) the purpose and character of the use, including whether it is transformative, (2) the nature of the copyrighted work, (3) the amount and substantiality of the portion used, and (4) the effect on the potential market. Campbell v. Acuff-Rose Music held that commercial parody can be fair use.',
 ARRAY['fair use', 'copyright', 'transformative use', 'Campbell v. Acuff-Rose'], 0.88, 'federal'),

('research', 'ace', 'ip', 'patent claim construction and infringement', 'b2c3d4f5',
 'Patent Law — Claim Construction and Infringement',
 'Patent infringement occurs when someone makes, uses, sells, or imports the patented invention without authorization. Claim construction (Markman hearing) determines the scope of patent claims. Literal infringement requires each element of the claim. The doctrine of equivalents captures insubstantial differences. Willful infringement can lead to treble damages.',
 ARRAY['patent', 'claim construction', 'Markman', 'doctrine of equivalents', 'infringement'], 0.87, 'federal'),

-- Employment Law
('research', 'ace', 'employment', 'Title VII employment discrimination', 'c3d4e5a6',
 'Title VII — Employment Discrimination',
 'Title VII prohibits employment discrimination based on race, color, religion, sex, or national origin. Disparate treatment requires discriminatory intent (McDonnell Douglas burden-shifting). Disparate impact requires showing a facially neutral policy disproportionately affects a protected group. Sexual harassment includes quid pro quo and hostile work environment claims.',
 ARRAY['Title VII', 'discrimination', 'disparate treatment', 'disparate impact', 'McDonnell Douglas'], 0.89, 'federal'),

-- Environmental Law
('research', 'ace', 'environmental', 'NEPA environmental impact statements', 'd4e5f6b7',
 'NEPA — Environmental Impact Statements',
 'The National Environmental Policy Act requires federal agencies to prepare an Environmental Impact Statement (EIS) for major federal actions significantly affecting the quality of the human environment. An Environmental Assessment (EA) determines whether an EIS is needed. The EIS must consider alternatives, including no action. NEPA is procedural, not substantive.',
 ARRAY['NEPA', 'EIS', 'environmental review', 'federal action'], 0.83, 'federal'),

-- Securities Law
('research', 'ace', 'securities', 'Rule 10b-5 securities fraud', 'e5f6a7c8',
 'Rule 10b-5 — Securities Fraud',
 'Rule 10b-5 prohibits fraud in connection with the purchase or sale of securities. Elements: (1) material misrepresentation or omission, (2) scienter (intent to deceive), (3) connection with purchase or sale, (4) reliance, (5) economic loss, and (6) loss causation. Basic Inc. v. Levinson established the fraud-on-the-market theory creating a rebuttable presumption of reliance.',
 ARRAY['10b-5', 'securities fraud', 'scienter', 'fraud on the market', 'Basic v. Levinson'], 0.90, 'federal'),

-- Tax Law
('research', 'ace', 'tax', 'charitable deduction requirements IRC 170', 'f6a7b8d9',
 'IRC Section 170 — Charitable Contribution Deductions',
 'Taxpayers may deduct contributions to qualified organizations under IRC 170. Contributions must be to organizations described in 170(c), including religious, charitable, educational, and governmental entities. The deduction is limited to a percentage of adjusted gross income (typically 60% for cash, 30% for appreciated property). Substantiation requirements increase with the amount of the contribution.',
 ARRAY['IRC 170', 'charitable deduction', 'qualified organization', 'substantiation'], 0.82, 'federal'),

-- International Law
('research', 'ace', 'international', 'treaty interpretation Vienna Convention', 'a7b8c9e0',
 'Vienna Convention — Treaty Interpretation',
 'The Vienna Convention on the Law of Treaties (1969) establishes rules for interpreting international agreements. Article 31 requires interpretation in good faith in accordance with the ordinary meaning of terms in their context and in light of the treaty object and purpose. Supplementary means of interpretation (travaux preparatoires) may be used under Article 32.',
 ARRAY['Vienna Convention', 'treaty interpretation', 'good faith', 'travaux preparatoires'], 0.81, 'federal'),

-- Bankruptcy Law
('research', 'ace', 'bankruptcy', 'Chapter 7 vs Chapter 13 bankruptcy', 'b8c9d0f1',
 'Bankruptcy — Chapter 7 vs. Chapter 13 Comparison',
 'Chapter 7 provides for liquidation of non-exempt assets to pay creditors, with remaining debts discharged. Chapter 13 allows individuals with regular income to create a 3-5 year repayment plan. The means test determines Chapter 7 eligibility. Certain debts (student loans, recent taxes, child support) are non-dischargeable under both chapters.',
 ARRAY['Chapter 7', 'Chapter 13', 'discharge', 'means test', 'non-dischargeable'], 0.84, 'federal'),

-- Legal Ethics
('research', 'ace', 'ethics', 'attorney client privilege and work product', 'c9d0e1a2',
 'Attorney-Client Privilege and Work Product Doctrine',
 'Attorney-client privilege protects confidential communications between attorney and client made for the purpose of obtaining legal advice. The work product doctrine (Hickman v. Taylor) protects materials prepared in anticipation of litigation. The crime-fraud exception pierces privilege when the client seeks legal advice to further a crime or fraud. Waiver can be express or implied.',
 ARRAY['attorney-client privilege', 'work product', 'Hickman v. Taylor', 'crime-fraud exception'], 0.92, 'federal'),

-- Antitrust
('research', 'ace', 'antitrust', 'Sherman Act Section 1 restraint of trade', 'd0e1f2b3',
 'Sherman Act Section 1 — Restraint of Trade',
 'Section 1 of the Sherman Act prohibits contracts, combinations, and conspiracies in restraint of trade. Per se violations include price fixing, market allocation, bid rigging, and group boycotts. The rule of reason applies to other restraints, balancing procompetitive justifications against anticompetitive effects. Quick look analysis applies to restraints that are not obviously per se illegal but appear anticompetitive.',
 ARRAY['Sherman Act', 'restraint of trade', 'per se', 'rule of reason', 'price fixing'], 0.87, 'federal'),

-- Real Property — Landlord Tenant
('research', 'ace', 'property', 'landlord tenant implied warranty habitability', 'e1f2a3c4',
 'Implied Warranty of Habitability',
 'Most jurisdictions recognize an implied warranty of habitability in residential leases, requiring landlords to maintain premises in a condition fit for human habitation. Tenants may withhold rent, repair and deduct, or terminate the lease when the warranty is breached. The warranty cannot typically be waived. Javins v. First National Realty Corp. was the landmark case.',
 ARRAY['habitability', 'landlord tenant', 'Javins', 'rent withholding', 'residential lease'], 0.83, 'state'),

-- Evidence — Privilege
('corpus', 'ace', 'legal_rule', 'spousal privilege marital communications', 'f2a3b4d5',
 'Spousal Privilege — Testimonial and Communications',
 'Two distinct spousal privileges exist: (1) the testimonial privilege, which in federal courts is held by the witness-spouse and prevents testimony against a defendant spouse during marriage, and (2) the marital communications privilege, which protects confidential communications made during marriage and survives divorce. Exceptions exist for crimes against the spouse or children.',
 ARRAY['spousal privilege', 'marital communications', 'testimonial privilege'], 0.86, 'federal'),

-- Constitutional — First Amendment
('research', 'ace', 'constitutional', 'First Amendment free speech strict scrutiny', 'a3b4c5e6',
 'First Amendment — Free Speech and Content-Based Restrictions',
 'Content-based restrictions on speech are presumptively unconstitutional and subject to strict scrutiny, requiring a compelling government interest and narrow tailoring. Content-neutral restrictions receive intermediate scrutiny. Unprotected categories include incitement (Brandenburg v. Ohio), true threats, fighting words, obscenity (Miller v. California), and child pornography. Commercial speech receives intermediate protection.',
 ARRAY['First Amendment', 'free speech', 'strict scrutiny', 'Brandenburg', 'Miller test'], 0.93, 'federal'),

-- Federal Sentencing
('research', 'ace', 'criminal', 'federal sentencing guidelines', 'b4c5d6f7',
 'Federal Sentencing Guidelines',
 'The U.S. Sentencing Guidelines provide a framework for federal sentencing based on offense level and criminal history category. United States v. Booker made the guidelines advisory rather than mandatory. Judges must consult the guidelines but may impose non-guidelines sentences based on 18 USC 3553(a) factors, including the nature of the offense, deterrence, and need for rehabilitation.',
 ARRAY['sentencing guidelines', 'Booker', '3553(a)', 'offense level', 'criminal history'], 0.88, 'federal');
