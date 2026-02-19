-- Simple Test Case Creation (Fixed Schema)
-- Run with: PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -f scripts/create-simple-test-case.sql

-- 1. Create a test case with proper UUID
INSERT INTO cases (id, case_number, title, description, priority, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'TEST-2024-API',
  'API Test Case',
  'Test case for validating all API endpoints return database data',
  'medium',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (case_number) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Get the created case ID for reference
\set test_case_id `PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -t -c "SELECT id FROM cases WHERE case_number = 'TEST-2024-API';" | tr -d ' \n'`

-- 2. Create test evidence records (using correct schema)
INSERT INTO evidence (id, case_id, title, description, evidence_type, file_type, file_url)
VALUES
(
  gen_random_uuid(),
  (SELECT id FROM cases WHERE case_number = 'TEST-2024-API'),
  'API Test Evidence 1',
  'Digital evidence for API endpoint testing',
  'digital',
  'pdf',
  '/test/evidence1.pdf'
),
(
  gen_random_uuid(),
  (SELECT id FROM cases WHERE case_number = 'TEST-2024-API'),
  'API Test Evidence 2',
  'Physical evidence for API endpoint testing',
  'physical',
  'image',
  '/test/evidence2.jpg'
);

-- 3. Create additional test persons of interest
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
  position
) VALUES
(
  gen_random_uuid(),
  (SELECT id FROM cases WHERE case_number = 'TEST-2024-API'),
  'Test Subject Alpha',
  '["Alpha", "Subject A"]'::jsonb,
  'Primary Test Target',
  'low',
  'monitoring',
  '{
    "who": "Test subject for API validation",
    "what": "Mock person for testing endpoints",
    "role": "Test Subject",
    "age": 30,
    "dangerLevel": 2.0
  }'::jsonb,
  '["test", "api", "validation"]'::jsonb,
  '{"x": 100, "y": 100}'::jsonb
),
(
  gen_random_uuid(),
  (SELECT id FROM cases WHERE case_number = 'TEST-2024-API'),
  'Test Subject Beta',
  '["Beta", "Subject B"]'::jsonb,
  'Secondary Test Target',
  'low',
  'monitoring',
  '{
    "who": "Second test subject for API validation",
    "what": "Additional mock person for testing",
    "role": "Test Subject",
    "age": 25,
    "dangerLevel": 1.5
  }'::jsonb,
  '["test", "api", "secondary"]'::jsonb,
  '{"x": 200, "y": 200}'::jsonb
);

-- Display results
SELECT
  'TEST CASE CREATED' as status,
  c.case_number,
  c.id as case_id,
  c.title,
  (SELECT COUNT(*) FROM evidence WHERE case_id = c.id) as evidence_count,
  (SELECT COUNT(*) FROM persons_of_interest WHERE case_id = c.id) as poi_count
FROM cases c
WHERE c.case_number = 'TEST-2024-API';

-- Show the persons of interest
SELECT name, threat_level, status
FROM persons_of_interest
WHERE case_id = (SELECT id FROM cases WHERE case_number = 'TEST-2024-API');