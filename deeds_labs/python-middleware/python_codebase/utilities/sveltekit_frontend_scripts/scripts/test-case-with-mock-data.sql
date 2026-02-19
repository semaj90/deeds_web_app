-- Test Case Creation with Mock Data
-- This creates a comprehensive test case with all related data types
-- Run with: PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -f scripts/test-case-with-mock-data.sql

-- 1. Create a test case
INSERT INTO cases (id, case_number, title, description, priority, status, created_at, updated_at)
VALUES (
  'test-case-001',
  'TEST-2024-001',
  'Integration Test Case',
  'Comprehensive test case for API endpoint validation with mock data',
  'medium',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (case_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 2. Create test evidence records
INSERT INTO evidence (id, case_id, title, description, file_path, file_type, created_at, updated_at)
VALUES
(
  gen_random_uuid(),
  'test-case-001',
  'Digital Evidence - Laptop',
  'Seized laptop containing encrypted files and communication logs',
  '/evidence/laptop-001.img',
  'disk-image',
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Financial Records',
  'Bank statements and transaction records showing suspicious transfers',
  '/evidence/financial-records.pdf',
  'document',
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Surveillance Video',
  'Security camera footage from crime scene',
  '/evidence/surveillance-001.mp4',
  'video',
  NOW(),
  NOW()
);

-- 3. Create test persons of interest for this case
INSERT INTO persons_of_interest (
  id,
  case_id,
  name,
  aliases,
  relationship,
  threat_level,
  status,
  profile_data,
  tags,
  position,
  created_at,
  updated_at
) VALUES
(
  gen_random_uuid(),
  'test-case-001',
  'Alex "Phantom" Johnson',
  '["Phantom", "A.J.", "Ghost Walker"]'::jsonb,
  'Primary Suspect',
  'high',
  'wanted',
  '{
    "who": "Former IT security specialist turned cybercriminal",
    "what": "Suspected of major corporate data breaches",
    "why": "Revenge against former employer and financial gain",
    "how": "Advanced persistent threats and social engineering",
    "role": "Lead Cybercriminal",
    "height": "180 cm",
    "age": 34,
    "hair": "Brown",
    "eyes": "Hazel",
    "weight": "75 kg",
    "dangerLevel": 9.0
  }'::jsonb,
  '["cybercrime", "data-breach", "high-risk", "wanted"]'::jsonb,
  '{"x": 200, "y": 100}'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Sarah "Digital" Martinez',
  '["Digital", "S.M.", "Code Red"]'::jsonb,
  'Technical Associate',
  'medium',
  'person-of-interest',
  '{
    "who": "Software developer with hacking skills",
    "what": "Suspected of providing technical support for cyber attacks",
    "why": "Financial difficulties and peer influence",
    "how": "Custom malware development and network exploitation",
    "role": "Technical Support",
    "height": "165 cm",
    "age": 27,
    "hair": "Black",
    "eyes": "Brown",
    "weight": "60 kg",
    "dangerLevel": 6.5
  }'::jsonb,
  '["malware", "technical-support", "coding", "medium-risk"]'::jsonb,
  '{"x": 350, "y": 250}'::jsonb,
  NOW(),
  NOW()
);

-- 4. Create test legal documents
INSERT INTO legal_documents (id, case_id, title, document_type, file_path, content, metadata, created_at, updated_at)
VALUES
(
  gen_random_uuid(),
  'test-case-001',
  'Search Warrant - Residence',
  'warrant',
  '/legal/search-warrant-001.pdf',
  'Search warrant for suspect residence at 123 Main Street',
  '{
    "issuing_court": "District Court",
    "judge": "Judge Smith",
    "date_issued": "2024-09-01",
    "valid_until": "2024-09-15",
    "scope": "digital devices and financial records"
  }'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Indictment Document',
  'indictment',
  '/legal/indictment-001.pdf',
  'Formal charges against Alex Johnson for computer fraud and data theft',
  '{
    "charges": ["computer fraud", "identity theft", "wire fraud"],
    "filing_date": "2024-09-10",
    "prosecutor": "Jane Prosecutor",
    "case_status": "pending"
  }'::jsonb,
  NOW(),
  NOW()
);

-- 5. Create test activities/timeline
INSERT INTO activities (id, case_id, title, description, activity_type, activity_date, created_at, updated_at)
VALUES
(
  gen_random_uuid(),
  'test-case-001',
  'Initial Investigation',
  'Case opened following report of data breach at TechCorp Inc.',
  'investigation',
  '2024-08-15',
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Search Warrant Executed',
  'Searched suspect residence, seized computer equipment and documents',
  'search',
  '2024-09-02',
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'test-case-001',
  'Forensic Analysis Completed',
  'Digital forensics team completed analysis of seized devices',
  'analysis',
  '2024-09-08',
  NOW(),
  NOW()
);

-- Display test case summary
SELECT
  'TEST CASE CREATED' as status,
  c.case_number,
  c.title,
  (SELECT COUNT(*) FROM evidence WHERE case_id = c.id) as evidence_count,
  (SELECT COUNT(*) FROM persons_of_interest WHERE case_id = c.id) as poi_count,
  (SELECT COUNT(*) FROM legal_documents WHERE case_id = c.id) as legal_docs_count,
  (SELECT COUNT(*) FROM activities WHERE case_id = c.id) as activities_count
FROM cases c
WHERE c.id = 'test-case-001';

-- Show the persons of interest for verification
SELECT name, threat_level, status, relationship
FROM persons_of_interest
WHERE case_id = 'test-case-001';