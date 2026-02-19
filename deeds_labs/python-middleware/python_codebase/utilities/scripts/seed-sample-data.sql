-- Sample Data Seeding for Enhanced Legal AI System
-- Creates realistic legal data for development and testing
-- Low memory optimized - limited but comprehensive sample data

-- Insert sample users with different roles
INSERT INTO users (id, email, username, password_hash, first_name, last_name, role, profile_data, preferences, ai_settings, bio, specializations) VALUES 
(
    '11111111-1111-1111-1111-111111111111',
    'admin@legalai.demo',
    'admin',
    '$2b$12$LQv3c1yqBwLFaAGVn5.9.u4Bg9S8Z4JE1a9v2m3B4k5L6N7P8Q9R0S',
    'Sarah',
    'Chen',
    'admin',
    '{"department": "Administration", "bar_number": "ADMIN2024", "years_experience": 15}',
    '{"theme": "dark", "notifications": true, "auto_save": true}',
    '{"detective_mode": true, "auto_recommendations": true, "embedding_model": "nomic-embed-text", "max_tokens": 1024}',
    'Senior Legal Administrator with expertise in case management and AI integration.',
    ARRAY['Legal Technology', 'Case Management', 'AI Integration']
),
(
    '22222222-2222-2222-2222-222222222222',
    'prosecutor@legalai.demo',
    'prosecutor',
    '$2b$12$LQv3c1yqBwLFaAGVn5.9.u4Bg9S8Z4JE1a9v2m3B4k5L6N7P8Q9R0S',
    'Michael',
    'Rodriguez',
    'prosecutor',
    '{"department": "Criminal Division", "bar_number": "PR789123", "years_experience": 8}',
    '{"theme": "light", "notifications": true, "detective_mode_default": true}',
    '{"detective_mode": true, "auto_recommendations": true, "embedding_model": "nomic-embed-text"}',
    'Criminal prosecutor specializing in white-collar crime and digital forensics.',
    ARRAY['Criminal Law', 'White Collar Crime', 'Digital Forensics', 'Evidence Analysis']
),
(
    '33333333-3333-3333-3333-333333333333',
    'defense@legalai.demo',
    'defense_attorney',
    '$2b$12$LQv3c1yqBwLFaAGVn5.9.u4Bg9S8Z4JE1a9v2m3B4k5L6N7P8Q9R0S',
    'Emily',
    'Thompson',
    'defense_attorney',
    '{"department": "Public Defender", "bar_number": "PD456789", "years_experience": 6}',
    '{"theme": "light", "notifications": true, "canvas_mode": true}',
    '{"detective_mode": true, "auto_recommendations": true, "embedding_model": "nomic-embed-text"}',
    'Public defender focused on criminal defense and civil rights cases.',
    ARRAY['Criminal Defense', 'Civil Rights', 'Appeals', 'Constitutional Law']
),
(
    '44444444-4444-4444-4444-444444444444',
    'paralegal@legalai.demo',
    'paralegal',
    '$2b$12$LQv3c1yqBwLFaAGVn5.9.u4Bg9S8Z4JE1a9v2m3B4k5L6N7P8Q9R0S',
    'James',
    'Wilson',
    'paralegal',
    '{"department": "Legal Research", "certification": "CP", "years_experience": 4}',
    '{"theme": "auto", "notifications": true, "research_mode": true}',
    '{"detective_mode": false, "auto_recommendations": true, "embedding_model": "nomic-embed-text"}',
    'Certified paralegal specializing in legal research and document preparation.',
    ARRAY['Legal Research', 'Document Preparation', 'Case Investigation']
),
(
    '55555555-5555-5555-5555-555555555555',
    'civillaw@legalai.demo',
    'civil_attorney',
    '$2b$12$LQv3c1yqBwLFaAGVn5.9.u4Bg9S8Z4JE1a9v2m3B4k5L6N7P8Q9R0S',
    'Lisa',
    'Martinez',
    'attorney',
    '{"department": "Civil Division", "bar_number": "CV234567", "years_experience": 12}',
    '{"theme": "light", "notifications": true, "contract_focus": true}',
    '{"detective_mode": false, "auto_recommendations": true, "embedding_model": "nomic-embed-text"}',
    'Civil attorney specializing in contract law and personal injury cases.',
    ARRAY['Contract Law', 'Personal Injury', 'Tort Law', 'Litigation']
);

-- Insert sample cases with variety of types and statuses
INSERT INTO cases (id, user_id, title, description, content, case_number, status, priority, case_type, jurisdiction, court, judge, opposing_counsel, client_info, metadata, tags, deadlines) VALUES 
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'State v. DataCorp - Embezzlement Investigation',
    'Investigation into alleged embezzlement of company funds through fraudulent accounting practices.',
    'DataCorp, a mid-size tech company, is under investigation for alleged embezzlement schemes involving the manipulation of financial records to hide the theft of approximately $2.3 million over a 3-year period. The case involves complex digital forensics analysis of accounting software, email communications, and financial transaction records. Key evidence includes suspicious journal entries, altered invoices, and irregular bank transfers. The investigation has identified three potential suspects within the accounting department who had access to the financial systems during the relevant time period.',
    'CR-2024-1001',
    'active',
    'high',
    'Criminal - White Collar',
    'State',
    'Superior Court of California, County of San Francisco',
    'Hon. Margaret Chen',
    'Williams & Associates Defense',
    '{"victim": "DataCorp Inc.", "estimated_loss": 2300000, "investigation_start": "2024-01-15"}',
    '{"complexity": "high", "digital_evidence": true, "expert_witnesses": ["forensic_accountant", "digital_forensics"], "estimated_trial_date": "2024-08-15"}',
    ARRAY['embezzlement', 'white-collar', 'digital-forensics', 'accounting-fraud', 'corporate-crime'],
    '[{"type": "discovery_deadline", "date": "2024-06-01", "description": "Complete discovery exchange"}, {"type": "expert_witness_deadline", "date": "2024-07-01", "description": "Expert witness disclosures due"}, {"type": "trial_date", "date": "2024-08-15", "description": "Trial commencement"}]'
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'People v. Johnson - Drug Trafficking',
    'Multi-defendant drug trafficking case involving interstate distribution network.',
    'Large-scale drug trafficking operation involving the distribution of fentanyl and cocaine across state lines. The case involves multiple defendants organized in a hierarchical distribution network. Evidence includes wiretap recordings, surveillance footage, seized narcotics, financial records showing money laundering activities, and cooperating witness testimony. The investigation spans 18 months and involves coordination with federal agencies. Key challenges include establishing the chain of command within the organization and proving knowledge and intent for each defendant.',
    'CR-2024-0987',
    'active',
    'high',
    'Criminal - Drug Trafficking',
    'State',
    'Superior Court of California, County of Los Angeles',
    'Hon. Robert Kim',
    'Federal Public Defender Office',
    '{"defendants": ["Marcus Johnson", "Lisa Davis", "Tony Rodriguez"], "substances": ["fentanyl", "cocaine"], "estimated_street_value": 1800000}',
    '{"conspiracy_charges": true, "federal_coordination": true, "wiretap_evidence": true, "asset_forfeiture": true}',
    ARRAY['drug-trafficking', 'conspiracy', 'wiretap', 'money-laundering', 'interstate'],
    '[{"type": "suppression_motion", "date": "2024-05-15", "description": "Motion to suppress wiretap evidence"}, {"type": "plea_deadline", "date": "2024-06-30", "description": "Plea negotiation deadline"}, {"type": "trial_date", "date": "2024-09-10", "description": "Jury trial begins"}]'
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'State v. Martinez - Assault Defense',
    'Defense of client charged with aggravated assault - self-defense claim.',
    'Defense case for Roberto Martinez, charged with aggravated assault with a deadly weapon. Client claims self-defense after being attacked outside a nightclub. Key issues include witness credibility, surveillance video analysis, and forensic evidence of injuries. The prosecution alleges premeditation based on text messages, while the defense argues the attack was unprovoked and client feared for his life. Case involves complex witness statements with conflicting accounts of the incident sequence.',
    'CR-2024-0756',
    'active',
    'medium',
    'Criminal - Assault',
    'State',
    'Superior Court of California, County of Orange',
    'Hon. Sandra Liu',
    'Orange County District Attorney',
    '{"defendant": "Roberto Martinez", "alleged_victim": "Kevin Brown", "incident_date": "2024-02-14", "location": "Sunset Nightclub parking lot"}',
    '{"self_defense_claim": true, "surveillance_video": true, "witness_conflicts": true, "forensic_injuries": true}',
    ARRAY['assault', 'self-defense', 'surveillance-video', 'witness-testimony', 'forensic-evidence'],
    '[{"type": "expert_witness", "date": "2024-05-20", "description": "Defense expert witness on use of force"}, {"type": "motion_hearing", "date": "2024-06-05", "description": "Motion to exclude prejudicial evidence"}, {"type": "trial_date", "date": "2024-07-22", "description": "Jury selection begins"}]'
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '55555555-5555-5555-5555-555555555555',
    'Anderson v. TechStart Inc. - Contract Dispute',
    'Breach of contract lawsuit involving software development agreement.',
    'Contract dispute between software developer Jennifer Anderson and startup company TechStart Inc. Anderson claims breach of contract after TechStart terminated the development agreement early and refused to pay outstanding invoices totaling $485,000. TechStart counterclaims that Anderson failed to deliver working software meeting specifications and seeks damages for project delays. The case involves complex technical issues regarding software functionality, project management methodologies, and contract interpretation of "commercially reasonable" software standards.',
    'CV-2024-2234',
    'discovery',
    'medium',
    'Civil - Contract Dispute',
    'State',
    'Superior Court of California, County of Santa Clara',
    'Hon. David Park',
    'Morrison Tech Law Group',
    '{"plaintiff": "Jennifer Anderson", "defendant": "TechStart Inc.", "contract_value": 485000, "project_duration": "18 months"}',
    '{"software_development": true, "technical_specifications": true, "payment_dispute": true, "counterclaim": true}',
    ARRAY['contract-breach', 'software-development', 'payment-dispute', 'technical-specifications', 'startup'],
    '[{"type": "discovery_cutoff", "date": "2024-06-15", "description": "All discovery must be completed"}, {"type": "expert_depositions", "date": "2024-07-01", "description": "Technical expert depositions"}, {"type": "mediation", "date": "2024-07-20", "description": "Court-ordered mediation"}]'
),
(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '55555555-5555-5555-5555-555555555555',
    'Wilson v. City General Hospital - Medical Malpractice',
    'Medical malpractice claim involving misdiagnosis and delayed treatment.',
    'Medical malpractice lawsuit filed by the family of Patricia Wilson against City General Hospital and Dr. Richard Hayes. Wilson died from complications of acute appendicitis after being misdiagnosed with gastroenteritis in the emergency department. The case involves analysis of medical records, expert testimony on emergency medicine standards of care, and hospital policies regarding diagnostic testing. Plaintiffs claim the misdiagnosis resulted from failure to order appropriate imaging studies and inadequate patient monitoring.',
    'CV-2024-1876',
    'active',
    'high',
    'Civil - Medical Malpractice',
    'State',
    'Superior Court of California, County of Alameda',
    'Hon. Patricia Wong',
    'Hillside Medical Defense',
    '{"plaintiff": "Wilson Family Estate", "defendants": ["City General Hospital", "Dr. Richard Hayes"], "incident_date": "2023-11-08", "death_date": "2023-11-12"}',
    '{"misdiagnosis": "gastroenteritis vs appendicitis", "medical_experts": true, "hospital_policies": true, "wrongful_death": true}',
    ARRAY['medical-malpractice', 'misdiagnosis', 'wrongful-death', 'emergency-medicine', 'standard-of-care'],
    '[{"type": "medical_records", "date": "2024-05-30", "description": "Complete medical records production"}, {"type": "expert_depositions", "date": "2024-07-15", "description": "Medical expert depositions"}, {"type": "trial_date", "date": "2024-10-01", "description": "Trial scheduled to begin"}]'
),
(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '44444444-4444-4444-4444-444444444444',
    'Environmental Compliance Investigation - GreenTech Corp',
    'Investigation into potential environmental violations and regulatory compliance.',
    'Preliminary investigation into GreenTech Corp for potential violations of environmental regulations related to hazardous waste disposal. The case involves review of EPA compliance reports, waste management procedures, and employee safety protocols. Initial evidence suggests possible improper disposal of chemical solvents and failure to maintain required environmental monitoring systems. The investigation is in early stages with document review and witness interviews ongoing.',
    'ENV-2024-0445',
    'investigation',
    'medium',
    'Environmental Compliance',
    'Federal',
    'U.S. District Court, Northern District of California',
    'To be assigned',
    'Environmental Defense Counsel',
    '{"company": "GreenTech Corp", "violations": "hazardous waste disposal", "epa_involved": true, "employee_safety": true}',
    '{"environmental_law": true, "regulatory_compliance": true, "document_review": true, "witness_interviews": true}',
    ARRAY['environmental-law', 'hazardous-waste', 'epa-compliance', 'regulatory-violation', 'corporate'],
    '[{"type": "document_production", "date": "2024-06-01", "description": "Environmental compliance documents due"}, {"type": "site_inspection", "date": "2024-06-15", "description": "EPA site inspection scheduled"}]'
);

-- Insert sample evidence linked to cases
INSERT INTO evidence (id, case_id, user_id, filename, original_filename, file_path, file_size, mime_type, file_hash, upload_method, extracted_text, metadata, tags, annotations, ocr_data, analysis_results) VALUES 
(
    '11111111-aaaa-bbbb-cccc-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'financial_records_datacorp_2021_2023.pdf',
    'DataCorp Financial Records 2021-2023.pdf',
    '/evidence/datacorp/financial_records_datacorp_2021_2023.pdf',
    2456789,
    'application/pdf',
    'sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    'manual',
    'Financial records showing journal entries, account balances, and transaction details for DataCorp from January 2021 through December 2023. Notable irregularities include: 1) Journal entry reversals totaling $847,000 in Q3 2022 without supporting documentation, 2) Unusual patterns in accounts receivable adjustments, 3) Discrepancies between bank statements and recorded cash balances.',
    '{"document_type": "financial_records", "date_range": "2021-2023", "pages": 247, "confidentiality": "attorney_client_privileged"}',
    ARRAY['financial-records', 'journal-entries', 'embezzlement-evidence', 'accounting-irregularities'],
    '[{"page": 45, "annotation": "Suspicious journal entry reversal - no supporting docs", "annotator": "M. Rodriguez", "date": "2024-03-15"}, {"page": 78, "annotation": "Pattern of unusual A/R adjustments begins here", "annotator": "Financial Expert", "date": "2024-03-20"}]',
    '{"confidence": 0.94, "text_extraction_method": "OCR", "language": "en"}',
    '{"ai_analysis": {"anomaly_score": 0.87, "suspicious_patterns": ["irregular_journal_entries", "timing_patterns", "amount_clustering"], "keywords_extracted": ["journal reversal", "cash adjustment", "accounts receivable"]}, "expert_review": {"status": "pending", "assigned_to": "Forensic Accountant"}}'
),
(
    '22222222-bbbb-cccc-dddd-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'wiretap_transcript_20240215.txt',
    'Wiretap Transcript - February 15, 2024.txt',
    '/evidence/drug_case/wiretap_transcript_20240215.txt',
    156789,
    'text/plain',
    'sha256:b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567',
    'law_enforcement',
    'Wiretap conversation between Marcus Johnson and Lisa Davis discussing drug shipment logistics and payment arrangements. Key excerpts: "The package from the east coast supplier arrives Tuesday" and "We need to move 50 units through the southern route by Friday." Contains coded language consistent with drug trafficking operations.',
    '{"wiretap_date": "2024-02-15", "duration": "23 minutes", "participants": ["Marcus Johnson", "Lisa Davis"], "court_authorization": "SW-2024-0156"}',
    ARRAY['wiretap-evidence', 'drug-trafficking', 'conspiracy', 'coded-language'],
    '[{"timestamp": "00:04:23", "annotation": "Discussion of east coast supplier", "annotator": "Detective Smith", "date": "2024-02-16"}, {"timestamp": "00:18:45", "annotation": "Reference to 50 units - likely drug quantity", "annotator": "DEA Agent Johnson", "date": "2024-02-16"}]',
    '{"audio_quality": "high", "transcript_confidence": 0.92, "language": "en"}',
    '{"ai_analysis": {"drug_terminology_detected": true, "conspiracy_indicators": ["coordinated_timing", "quantity_references", "coded_language"], "key_phrases": ["east coast supplier", "50 units", "southern route"]}, "law_enforcement_review": {"status": "complete", "reviewer": "DEA Analyst"}}'
),
(
    '33333333-cccc-dddd-eeee-333333333333',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'surveillance_video_nightclub_incident.mp4',
    'Nightclub Parking Lot Surveillance - Feb 14 2024.mp4',
    '/evidence/assault_case/surveillance_video_nightclub_incident.mp4',
    45678901,
    'video/mp4',
    'sha256:c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    'subpoena',
    'Surveillance footage from Sunset Nightclub parking lot showing the incident on February 14, 2024. Video shows initial verbal confrontation escalating to physical altercation. Quality is adequate for identifying individuals but audio is poor due to distance from cameras.',
    '{"video_duration": "8 minutes 34 seconds", "resolution": "1080p", "frame_rate": "30fps", "timestamp": "2024-02-14 23:47:12"}',
    ARRAY['surveillance-video', 'assault-evidence', 'self-defense', 'witness-corroboration'],
    '[{"timestamp": "00:02:15", "annotation": "Initial verbal confrontation begins", "annotator": "E. Thompson", "date": "2024-03-10"}, {"timestamp": "00:04:48", "annotation": "First physical contact - appears defensive", "annotator": "Defense Investigator", "date": "2024-03-10"}]',
    '{"video_quality": "good", "audio_quality": "poor", "enhancement_applied": false}',
    '{"ai_analysis": {"violence_detection": true, "timeline_extracted": true, "body_language_analysis": "defensive_posture_detected", "crowd_analysis": "multiple_witnesses_present"}, "expert_review": {"status": "scheduled", "expert_type": "forensic_video_analyst"}}'
),
(
    '44444444-dddd-eeee-ffff-444444444444',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '55555555-5555-5555-5555-555555555555',
    'software_development_contract.pdf',
    'TechStart Software Development Agreement.pdf',
    '/evidence/contract_dispute/software_development_contract.pdf',
    345678,
    'application/pdf',
    'sha256:d4e5f6789012345678901234567890abcdef1234567890abcdef123456789',
    'client_provided',
    'Software development agreement between Jennifer Anderson and TechStart Inc. Contract specifies development of mobile application with specific technical requirements, payment schedule, and delivery milestones. Key terms include performance standards, intellectual property rights, and termination clauses.',
    '{"contract_date": "2022-08-15", "contract_value": 485000, "duration": "18 months", "pages": 24}',
    ARRAY['contract', 'software-development', 'payment-terms', 'technical-specifications'],
    '[{"page": 8, "annotation": "Payment milestone definitions", "annotator": "L. Martinez", "date": "2024-03-25"}, {"page": 15, "annotation": "Technical specification requirements", "annotator": "Tech Expert", "date": "2024-03-25"}]',
    '{"legal_document": true, "contract_analysis": "pending", "language": "en"}',
    '{"ai_analysis": {"contract_type": "software_development", "key_clauses_identified": ["payment_terms", "delivery_milestones", "termination_conditions"], "risk_factors": ["vague_specifications", "aggressive_timeline"]}, "legal_review": {"status": "in_progress", "reviewer": "Contract Specialist"}}'
),
(
    '55555555-eeee-ffff-aaaa-555555555555',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    '55555555-5555-5555-5555-555555555555',
    'medical_records_wilson_patricia.pdf',
    'Patricia Wilson - Complete Medical Records.pdf',
    '/evidence/malpractice/medical_records_wilson_patricia.pdf',
    567890,
    'application/pdf',
    'sha256:e5f6789012345678901234567890abcdef1234567890abcdef1234567890',
    'medical_records_request',
    'Complete medical records for Patricia Wilson including emergency department visit, diagnostic tests, treatment notes, and follow-up care. Records show initial presentation with abdominal pain, diagnosis of gastroenteritis, and subsequent deterioration leading to emergency surgery for ruptured appendix.',
    '{"patient": "Patricia Wilson", "date_range": "2023-11-08 to 2023-11-12", "hospital": "City General Hospital", "pages": 89, "hipaa_compliant": true}',
    ARRAY['medical-records', 'emergency-medicine', 'misdiagnosis', 'appendicitis'],
    '[{"page": 12, "annotation": "Initial ED assessment - abdominal pain", "annotator": "Medical Expert", "date": "2024-04-02"}, {"page": 34, "annotation": "Diagnostic imaging orders - none placed", "annotator": "L. Martinez", "date": "2024-04-02"}]',
    '{"medical_record": true, "hipaa_authorization": "on_file", "language": "en"}',
    '{"ai_analysis": {"medical_terminology_detected": true, "timeline_extracted": true, "critical_decisions": ["no_imaging_ordered", "gastroenteritis_diagnosis"], "red_flags": ["delayed_diagnosis", "symptom_progression"]}, "medical_expert_review": {"status": "pending", "expert_specialty": "emergency_medicine"}}'
);

-- Insert sample user behavior data for AI recommendations
INSERT INTO user_behavior (id, user_id, session_id, action_type, entity_type, entity_id, context, timestamp, ip_address, duration_ms, success) VALUES 
(uuid_generate_v4(), '22222222-2222-2222-2222-222222222222', 'sess_001', 'view', 'case', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"page": "case_details", "tab": "evidence"}', CURRENT_TIMESTAMP - INTERVAL '2 hours', '192.168.1.100', 15000, true),
(uuid_generate_v4(), '22222222-2222-2222-2222-222222222222', 'sess_001', 'search', 'evidence', null, '{"query": "financial records", "results_count": 5}', CURRENT_TIMESTAMP - INTERVAL '1 hour 45 minutes', '192.168.1.100', 3000, true),
(uuid_generate_v4(), '33333333-3333-3333-3333-333333333333', 'sess_002', 'edit', 'case', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '{"field": "notes", "action": "add_annotation"}', CURRENT_TIMESTAMP - INTERVAL '1 hour', '192.168.1.101', 8000, true),
(uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'sess_003', 'upload', 'evidence', '44444444-dddd-eeee-ffff-444444444444', '{"file_type": "pdf", "size_mb": 0.3}', CURRENT_TIMESTAMP - INTERVAL '30 minutes', '192.168.1.102', 12000, true),
(uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'sess_004', 'ai_query', 'assistant', null, '{"query": "contract law basics", "model": "gemma3-legal-ai", "response_length": 512}', CURRENT_TIMESTAMP - INTERVAL '15 minutes', '192.168.1.103', 25000, true);

-- Insert sample AI recommendations
INSERT INTO ai_recommendations (id, user_id, recommendation_type, entity_type, entity_id, score, reasoning, context, created_at, expires_at, is_active) VALUES 
(uuid_generate_v4(), '22222222-2222-2222-2222-222222222222', 'similar_case', 'case', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0.87, 'Similar white-collar crime case with financial evidence patterns', '{"similarity_factors": ["case_type", "evidence_type", "complexity"]}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '7 days', true),
(uuid_generate_v4(), '33333333-3333-3333-3333-333333333333', 'expert_witness', 'case', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 0.92, 'Forensic video analysis expert recommended for surveillance evidence', '{"evidence_type": "video", "expertise_needed": "forensic_analysis"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '14 days', true),
(uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'research_topic', 'case', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 0.78, 'Recent case law on software development contract disputes', '{"practice_area": "contract_law", "specialization": "software_development"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', true);

-- Insert sample investigations for detective mode
INSERT INTO investigations (id, case_id, user_id, title, description, investigation_type, status, findings, timeline, connections, evidence_links, ai_insights) VALUES 
(
    'inv11111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222',
    'Financial Fraud Pattern Analysis',
    'Investigation into the systematic patterns of financial manipulation at DataCorp to establish timeline and methodology.',
    'financial_fraud',
    'active',
    '[{"finding": "Consistent pattern of end-of-quarter journal reversals", "confidence": 0.89, "evidence": ["financial_records", "audit_trail"]}, {"finding": "Three employees had access during all suspicious periods", "confidence": 0.95, "evidence": ["access_logs", "hr_records"]}]',
    '[{"date": "2021-03-31", "event": "First suspicious journal entry", "source": "Financial records"}, {"date": "2021-06-30", "event": "Pattern emerges - Q2 reversals", "source": "Audit analysis"}, {"date": "2023-12-15", "event": "Investigation initiated", "source": "Whistleblower report"}]',
    '[{"from": "accounting_department", "to": "bank_accounts", "relationship": "unauthorized_access", "strength": 0.8}, {"from": "suspect_employees", "to": "financial_systems", "relationship": "access_pattern", "strength": 0.9}]',
    ARRAY['11111111-aaaa-bbbb-cccc-111111111111'],
    '{"ai_analysis": {"pattern_recognition": "quarterly_fraud_cycle", "risk_assessment": "high", "recommended_actions": ["forensic_audit", "employee_interviews", "system_access_review"]}, "ml_insights": {"anomaly_detection": 0.91, "prediction_confidence": 0.85}}'
),
(
    'inv22222-2222-2222-2222-222222222222',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'Self-Defense Evidence Timeline',
    'Reconstruction of events leading to the assault incident to support self-defense claim.',
    'timeline_reconstruction',
    'active',
    '[{"finding": "Client showed defensive body language throughout incident", "confidence": 0.82, "evidence": ["surveillance_video", "witness_statements"]}, {"finding": "Alleged victim initiated physical contact", "confidence": 0.76, "evidence": ["video_analysis", "injury_patterns"]}]',
    '[{"date": "2024-02-14 23:45:00", "event": "Verbal confrontation begins", "source": "Surveillance video"}, {"date": "2024-02-14 23:47:30", "event": "Alleged victim advances aggressively", "source": "Video analysis"}, {"date": "2024-02-14 23:48:15", "event": "Physical contact initiated by alleged victim", "source": "Frame-by-frame analysis"}]',
    '[{"from": "verbal_confrontation", "to": "physical_altercation", "relationship": "escalation", "strength": 0.9}, {"from": "client_behavior", "to": "self_defense", "relationship": "supports_claim", "strength": 0.8}]',
    ARRAY['33333333-cccc-dddd-eeee-333333333333'],
    '{"ai_analysis": {"timeline_confidence": 0.84, "self_defense_indicators": ["defensive_posture", "reactive_behavior", "proportional_response"], "recommended_experts": ["forensic_video_analyst", "use_of_force_expert"]}, "defense_strategy": {"strength": "strong", "key_evidence": "surveillance_video"}}'
);

-- Insert sample canvas data for interactive visualizations
INSERT INTO canvas_data (id, case_id, investigation_id, user_id, canvas_type, canvas_data, version, metadata) VALUES 
(
    'canvas11-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'inv11111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'investigation',
    '{"nodes": [{"id": "datacorp", "type": "company", "label": "DataCorp Inc.", "x": 100, "y": 100}, {"id": "accounting_dept", "type": "department", "label": "Accounting Department", "x": 300, "y": 100}, {"id": "suspect1", "type": "person", "label": "John Smith - Accountant", "x": 500, "y": 50}, {"id": "suspect2", "type": "person", "label": "Mary Jones - Controller", "x": 500, "y": 150}], "edges": [{"from": "datacorp", "to": "accounting_dept", "label": "contains"}, {"from": "accounting_dept", "to": "suspect1", "label": "employee"}, {"from": "accounting_dept", "to": "suspect2", "label": "employee"}], "annotations": [{"x": 400, "y": 200, "text": "Both suspects had system access during fraud period", "type": "note"}]}',
    1,
    '{"created_by": "M. Rodriguez", "last_modified": "2024-04-15T10:30:00Z", "collaboration": true}'
),
(
    'canvas22-2222-2222-2222-222222222222',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'inv22222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'timeline',
    '{"timeline": [{"time": "23:45:00", "event": "Verbal confrontation begins", "x": 50, "y": 100, "evidence": "surveillance_video"}, {"time": "23:47:30", "event": "Alleged victim advances", "x": 200, "y": 100, "evidence": "video_analysis"}, {"time": "23:48:15", "event": "Physical contact initiated", "x": 350, "y": 100, "evidence": "frame_analysis"}], "connections": [{"from": 0, "to": 1, "type": "escalation"}, {"from": 1, "to": 2, "type": "aggression"}], "defense_markers": [{"x": 375, "y": 120, "label": "Self-defense begins", "color": "green"}]}',
    1,
    '{"created_by": "E. Thompson", "last_modified": "2024-04-12T14:15:00Z", "timeline_type": "incident_reconstruction"}'
);

-- Insert sample AI conversations
INSERT INTO ai_conversations (id, user_id, case_id, conversation_type, title, messages, context, model_used, total_tokens) VALUES 
(
    'conv1111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'case_analysis',
    'DataCorp Embezzlement Analysis',
    '[{"role": "user", "content": "Analyze the financial evidence patterns in the DataCorp embezzlement case", "timestamp": "2024-04-15T09:00:00Z"}, {"role": "assistant", "content": "Based on the financial records, I identify several key patterns: 1) Quarterly journal reversals timing suggests end-of-period manipulation, 2) Amounts cluster around $50K-100K ranges, 3) Three-person access pattern indicates potential conspiracy. Recommend forensic accounting review and employee interview prioritization.", "timestamp": "2024-04-15T09:00:45Z"}]',
    '{"case_type": "embezzlement", "evidence_focus": "financial_records", "analysis_depth": "pattern_detection"}',
    'gemma3-legal-ai',
    267
),
(
    'conv2222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'legal_research',
    'Self-Defense Legal Standards',
    '[{"role": "user", "content": "What are the key elements for establishing self-defense in California assault cases?", "timestamp": "2024-04-12T11:30:00Z"}, {"role": "assistant", "content": "California self-defense law requires: 1) Reasonable belief of imminent harm, 2) Proportional response to threat, 3) No reasonable means of escape (duty to retreat in some circumstances). Key case law includes People v. Humphrey establishing subjective standard for reasonable belief. Video evidence and witness testimony will be crucial for establishing timeline and threat perception.", "timestamp": "2024-04-12T11:30:52Z"}]',
    '{"jurisdiction": "California", "legal_area": "self_defense", "case_type": "assault"}',
    'gemma3-legal-ai',
    198
);

-- Create some basic document embeddings (placeholder for vector data)
INSERT INTO document_embeddings (id, entity_type, entity_id, embedding_type, model_name, chunk_index, chunk_text, metadata) VALUES 
(uuid_generate_v4(), 'case', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'title', 'nomic-embed-text', 0, 'State v. DataCorp - Embezzlement Investigation', '{"source": "case_title", "case_type": "criminal"}'),
(uuid_generate_v4(), 'case', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'title', 'nomic-embed-text', 0, 'People v. Johnson - Drug Trafficking', '{"source": "case_title", "case_type": "criminal"}'),
(uuid_generate_v4(), 'case', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'title', 'nomic-embed-text', 0, 'State v. Martinez - Assault Defense', '{"source": "case_title", "case_type": "criminal"}'),
(uuid_generate_v4(), 'evidence', '11111111-aaaa-bbbb-cccc-111111111111', 'content', 'nomic-embed-text', 0, 'Financial records showing journal entries and irregularities in DataCorp accounting systems', '{"source": "evidence_content", "evidence_type": "financial_document"}'),
(uuid_generate_v4(), 'evidence', '22222222-bbbb-cccc-dddd-222222222222', 'content', 'nomic-embed-text', 0, 'Wiretap conversation discussing drug shipment logistics and coded language', '{"source": "evidence_content", "evidence_type": "surveillance"}');

-- Log successful completion
SELECT 'Enhanced Legal AI sample data seeded successfully!' as result;
SELECT 'Users created: ' || count(*) as user_count FROM users;
SELECT 'Cases created: ' || count(*) as case_count FROM cases;
SELECT 'Evidence items: ' || count(*) as evidence_count FROM evidence;
SELECT 'Investigations: ' || count(*) as investigation_count FROM investigations;
