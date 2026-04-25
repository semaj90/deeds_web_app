-- Seed mock data for Persons of Interest
-- Run this with: PGPASSWORD=123456 psql -h localhost -p 5433 -U legal_admin -d legal_ai_db -f scripts/seed-mock-data.sql

-- First, let's create or get a case to associate with our persons of interest
INSERT INTO cases (id, case_number, title, description, priority, status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'CASE-2024-001',
  'Operation Digital Hunt',
  'High-profile cybercrime investigation involving multiple suspects and associates',
  'high',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (case_number) DO NOTHING;

-- Get the case ID for reference
WITH case_ref AS (
  SELECT id as case_id FROM cases WHERE case_number = 'CASE-2024-001' LIMIT 1
)

-- Insert Persons of Interest
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
  (SELECT case_id FROM case_ref),
  'John "The Ghost" Doe',
  '["The Ghost", "Ghost", "J.D.", "Johnny D"]'::jsonb,
  'Primary Suspect',
  'high',
  'wanted',
  '{
    "who": "Former military cybersecurity expert turned criminal hacker",
    "what": "Suspected of orchestrating major data breaches and identity theft operations",
    "why": "Financial gain and anti-corporate sentiment",
    "how": "Advanced social engineering and zero-day exploits",
    "role": "Lead Hacker",
    "height": "185 cm",
    "age": 45,
    "hair": "Brown",
    "eyes": "Blue",
    "weight": "82 kg",
    "distinguishingMarks": "Scar on left cheek, tribal tattoo on right arm",
    "associates": ["Maria \"The Shadow\" Smith", "Carlos \"El Lobo\" Rodriguez"],
    "habits": ["Prefers night operations", "Uses encrypted communications", "Frequent coffee shop visitor"],
    "lastKnownLocation": "Downtown Tech District",
    "vehicles": ["Black Honda Civic (stolen)", "Red Yamaha motorcycle"],
    "dangerLevel": 8.5
  }'::jsonb,
  '["hacker", "military-background", "high-risk", "fugitive", "armed-dangerous"]'::jsonb,
  '{"x": 100, "y": 150}'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  (SELECT case_id FROM case_ref),
  'Maria "The Shadow" Smith',
  '["The Shadow", "Shadow", "M.S.", "Maria Santos"]'::jsonb,
  'Key Accomplice',
  'medium',
  'person-of-interest',
  '{
    "who": "Financial analyst with insider trading connections",
    "what": "Suspected money laundering operations and financial fraud",
    "why": "Debt and family financial pressure",
    "how": "Sophisticated financial instruments and offshore accounts",
    "role": "Financial Coordinator",
    "height": "165 cm",
    "age": 32,
    "hair": "Black",
    "eyes": "Green",
    "weight": "58 kg",
    "distinguishingMarks": "Small butterfly tattoo behind left ear",
    "associates": ["John \"The Ghost\" Doe", "Various financial contacts"],
    "habits": ["Early riser", "Yoga practitioner", "Drives luxury vehicles"],
    "lastKnownLocation": "Financial District",
    "vehicles": ["White BMW 3 Series", "Silver Tesla Model S"],
    "dangerLevel": 6.0
  }'::jsonb,
  '["financial-crimes", "white-collar", "money-laundering", "insider-trading"]'::jsonb,
  '{"x": 250, "y": 300}'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  (SELECT case_id FROM case_ref),
  'Carlos "El Lobo" Rodriguez',
  '["El Lobo", "Wolf", "C.R.", "Charlie"]'::jsonb,
  'Associate',
  'low',
  'monitoring',
  '{
    "who": "Small-time dealer with connections to larger criminal network",
    "what": "Suspected of providing logistical support and communication services",
    "why": "Financial necessity and peer pressure",
    "how": "Street-level operations and courier services",
    "role": "Support Network",
    "height": "170 cm",
    "age": 28,
    "hair": "Black",
    "eyes": "Brown",
    "weight": "70 kg",
    "distinguishingMarks": "Gold tooth, wolf tattoo on neck",
    "associates": ["John \"The Ghost\" Doe", "Street-level contacts"],
    "habits": ["Night owl", "Pool player", "Motorcycle enthusiast"],
    "lastKnownLocation": "East Side Neighborhoods",
    "vehicles": ["Harley-Davidson motorcycle", "Old pickup truck"],
    "dangerLevel": 3.5
  }'::jsonb,
  '["street-level", "support-network", "communications", "logistics"]'::jsonb,
  '{"x": 400, "y": 200}'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  (SELECT case_id FROM case_ref),
  'Diana "Cipher" Chen',
  '["Cipher", "D.C.", "The Decoder", "DiChen"]'::jsonb,
  'Technical Expert',
  'high',
  'suspect',
  '{
    "who": "Elite cryptographer and security researcher",
    "what": "Suspected of developing encryption tools for criminal operations",
    "why": "Ideological opposition to surveillance state",
    "how": "Advanced cryptographic techniques and security bypasses",
    "role": "Technical Specialist",
    "height": "162 cm",
    "age": 29,
    "hair": "Black with blue streaks",
    "eyes": "Dark Brown",
    "weight": "55 kg",
    "distinguishingMarks": "Multiple ear piercings, circuit board tattoo on wrist",
    "associates": ["John \"The Ghost\" Doe", "Underground tech community"],
    "habits": ["All-night coding sessions", "Energy drink consumer", "Privacy advocate"],
    "lastKnownLocation": "University District",
    "vehicles": ["Electric bicycle", "Shared rideshare services only"],
    "dangerLevel": 7.8
  }'::jsonb,
  '["cryptographer", "technical-expert", "privacy-advocate", "high-intelligence"]'::jsonb,
  '{"x": 300, "y": 400}'::jsonb,
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  (SELECT case_id FROM case_ref),
  'Viktor "The Broker" Petrov',
  '["The Broker", "V.P.", "Viktor P", "Russian Viktor"]'::jsonb,
  'Information Broker',
  'medium',
  'informant',
  '{
    "who": "Former intelligence operative turned information broker",
    "what": "Sells sensitive information and provides criminal intelligence",
    "why": "Profit motive and maintaining criminal network position",
    "how": "Extensive network of contacts and information trading",
    "role": "Intelligence Broker",
    "height": "178 cm",
    "age": 52,
    "hair": "Gray",
    "eyes": "Blue",
    "weight": "85 kg",
    "distinguishingMarks": "Distinctive Russian accent, gold watch",
    "associates": ["Various criminal organizations", "Government contacts"],
    "habits": ["Chess player", "Fine dining", "Cigar smoker"],
    "lastKnownLocation": "Upscale Hotel District",
    "vehicles": ["Black Mercedes-Benz S-Class", "Private driver"],
    "dangerLevel": 5.5
  }'::jsonb,
  '["information-broker", "ex-intelligence", "informant", "international"]'::jsonb,
  '{"x": 150, "y": 350}'::jsonb,
  NOW(),
  NOW()
);

-- Display results
SELECT
  name,
  threat_level,
  status,
  relationship,
  profile_data->>'role' as role
FROM persons_of_interest
WHERE case_id = (SELECT id FROM cases WHERE case_number = 'CASE-2024-001')
ORDER BY
  CASE threat_level
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
  END;