/**
 * Seed script to populate the database with mock Persons of Interest data
 * Run this script: node scripts/seed-persons-of-interest.mjs
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Since we can't import TS files directly in Node.js, we'll use direct SQL
// import { cases, personsOfInterest, users } from '../src/lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgres://legal_admin:123456@localhost:5434/legal_ai_db';
const sql = postgres(connectionString);
const db = drizzle(sql);

async function seedPersonsOfInterest() {
  console.log('🌱 Seeding Persons of Interest data...');

  try {
    // This script uses raw SQL table names to avoid missing schema imports.
    // Check for an existing case to associate with
    const existingCases = await sql`SELECT id, title FROM cases LIMIT 1`;
    let caseId = null;

    if (existingCases.length > 0) {
      caseId = existingCases[0].id;
      console.log(`📁 Using existing case: ${existingCases[0].title}`);
    } else {
      const insertedCase = await sql`
        INSERT INTO cases (case_number, title, description, priority, status)
        VALUES ('CASE-2024-001', 'Operation Digital Hunt', 'High-profile cybercrime investigation involving multiple suspects', 'high', 'active')
        RETURNING id, title
      `;
      caseId = insertedCase[0].id;
      console.log(`📁 Created new case: ${insertedCase[0].title}`);
    }

    // Get an existing user id if any
    const existingUsers = await sql`SELECT id, email FROM users LIMIT 1`;
    let userId = existingUsers.length > 0 ? existingUsers[0].id : null;
    if (userId) console.log(`👤 Using existing user: ${existingUsers[0].email}`);

    // Clear existing persons_of_interest entries to avoid duplicates
    await sql`DELETE FROM persons_of_interest`;

    // Mock Persons of Interest data matching our FugitiveDx interface
    const mockPersons = [
      {
        caseId,
        name: 'John "The Ghost" Doe',
        aliases: ['The Ghost', 'Ghost', 'J.D.', 'Johnny D'],
        relationship: 'Primary Suspect',
        threatLevel: 'high',
        status: 'wanted',
        profileData: {
          who: 'Former military cybersecurity expert turned criminal hacker',
          what: 'Suspected of orchestrating major data breaches and identity theft operations',
          why: 'Financial gain and anti-corporate sentiment',
          how: 'Advanced social engineering and zero-day exploits',
          role: 'Lead Hacker',
          height: '185 cm',
          age: 45,
          hair: 'Brown',
          eyes: 'Blue',
          weight: '82 kg',
          distinguishingMarks: 'Scar on left cheek, tribal tattoo on right arm',
          associates: ['Maria "The Shadow" Smith', 'Carlos "El Lobo" Rodriguez', 'Unknown accomplices'],
          habits: ['Prefers night operations', 'Uses encrypted communications', 'Frequent coffee shop visitor'],
          lastKnownLocation: 'Downtown Tech District',
          vehicles: ['Black Honda Civic (stolen)', 'Red Yamaha motorcycle'],
          dangerLevel: 8.5,
        },
        tags: ['hacker', 'military-background', 'high-risk', 'fugitive', 'armed-dangerous'],
        position: { x: 100, y: 150 },
        createdBy: userId,
      },
      {
        caseId,
        name: 'Maria "The Shadow" Smith',
        aliases: ['The Shadow', 'Shadow', 'M.S.', 'Maria Santos'],
        relationship: 'Key Accomplice',
        threatLevel: 'medium',
        status: 'person-of-interest',
        profileData: {
          who: 'Financial analyst with insider trading connections',
          what: 'Suspected money laundering operations and financial fraud',
          why: 'Debt and family financial pressure',
          how: 'Sophisticated financial instruments and offshore accounts',
          role: 'Financial Coordinator',
          height: '165 cm',
          age: 32,
          hair: 'Black',
          eyes: 'Green',
          weight: '58 kg',
          distinguishingMarks: 'Small butterfly tattoo behind left ear',
          associates: ['John "The Ghost" Doe', 'Various financial contacts'],
          habits: ['Early riser', 'Yoga practitioner', 'Drives luxury vehicles'],
          lastKnownLocation: 'Financial District',
          vehicles: ['White BMW 3 Series', 'Silver Tesla Model S'],
          dangerLevel: 6.0,
        },
        tags: ['financial-crimes', 'white-collar', 'money-laundering', 'insider-trading'],
        position: { x: 250, y: 300 },
        createdBy: userId,
      },
      {
        caseId,
        name: 'Carlos "El Lobo" Rodriguez',
        aliases: ['El Lobo', 'Wolf', 'C.R.', 'Charlie'],
        relationship: 'Associate',
        threatLevel: 'low',
        status: 'monitoring',
        profileData: {
          who: 'Small-time dealer with connections to larger criminal network',
          what: 'Suspected of providing logistical support and communication services',
          why: 'Financial necessity and peer pressure',
          how: 'Street-level operations and courier services',
          role: 'Support Network',
          height: '170 cm',
          age: 28,
          hair: 'Black',
          eyes: 'Brown',
          weight: '70 kg',
          distinguishingMarks: 'Gold tooth, wolf tattoo on neck',
          associates: ['John "The Ghost" Doe', 'Street-level contacts'],
          habits: ['Night owl', 'Pool player', 'Motorcycle enthusiast'],
          lastKnownLocation: 'East Side Neighborhoods',
          vehicles: ['Harley-Davidson motorcycle', 'Old pickup truck'],
          dangerLevel: 3.5,
        },
        tags: ['street-level', 'support-network', 'communications', 'logistics'],
        position: { x: 400, y: 200 },
        createdBy: userId,
      },
      {
        caseId,
        name: 'Diana "Cipher" Chen',
        aliases: ['Cipher', 'D.C.', 'The Decoder', 'DiChen'],
        relationship: 'Technical Expert',
        threatLevel: 'high',
        status: 'suspect',
        profileData: {
          who: 'Elite cryptographer and security researcher',
          what: 'Suspected of developing encryption tools for criminal operations',
          why: 'Ideological opposition to surveillance state',
          how: 'Advanced cryptographic techniques and security bypasses',
          role: 'Technical Specialist',
          height: '162 cm',
          age: 29,
          hair: 'Black with blue streaks',
          eyes: 'Dark Brown',
          weight: '55 kg',
          distinguishingMarks: 'Multiple ear piercings, circuit board tattoo on wrist',
          associates: ['John "The Ghost" Doe', 'Underground tech community'],
          habits: ['All-night coding sessions', 'Energy drink consumer', 'Privacy advocate'],
          lastKnownLocation: 'University District',
          vehicles: ['Electric bicycle', 'Shared rideshare services only'],
          dangerLevel: 7.8,
        },
        tags: ['cryptographer', 'technical-expert', 'privacy-advocate', 'high-intelligence'],
        position: { x: 300, y: 400 },
        createdBy: userId,
      },
      {
        caseId,
        name: 'Viktor "The Broker" Petrov',
        aliases: ['The Broker', 'V.P.', 'Viktor P', 'Russian Viktor'],
        relationship: 'Information Broker',
        threatLevel: 'medium',
        status: 'informant',
        profileData: {
          who: 'Former intelligence operative turned information broker',
          what: 'Sells sensitive information and provides criminal intelligence',
          why: 'Profit motive and maintaining criminal network position',
          how: 'Extensive network of contacts and information trading',
          role: 'Intelligence Broker',
          height: '178 cm',
          age: 52,
          hair: 'Gray',
          eyes: 'Blue',
          weight: '85 kg',
          distinguishingMarks: 'Distinctive Russian accent, gold watch',
          associates: ['Various criminal organizations', 'Government contacts'],
          habits: ['Chess player', 'Fine dining', 'Cigar smoker'],
          lastKnownLocation: 'Upscale Hotel District',
          vehicles: ['Black Mercedes-Benz S-Class', 'Private driver'],
          dangerLevel: 5.5,
        },
        tags: ['information-broker', 'ex-intelligence', 'informant', 'international'],
        position: { x: 150, y: 350 },
        createdBy: userId,
      },
    ];

    console.log('📝 Inserting persons of interest...');

    for (const person of mockPersons) {
      const res = await sql`
        INSERT INTO persons_of_interest
          (case_id, name, aliases, relationship, threat_level, status, profile_data, tags, position, created_by)
        VALUES (
          ${person.caseId},
          ${person.name},
          ${JSON.stringify(person.aliases)},
          ${person.relationship},
          ${person.threatLevel},
          ${person.status},
          ${JSON.stringify(person.profileData)},
          ${JSON.stringify(person.tags)},
          ${JSON.stringify(person.position)},
          ${person.createdBy}
        ) RETURNING id, name, threat_level;
      `;

      if (res && res[0]) {
        console.log(`✅ Added: ${res[0].name} (Threat: ${String(res[0].threat_level).toUpperCase()})`);
      } else {
        console.log(`⚠️ Insert may have failed for: ${person.name}`);
      }
    }

    console.log(`🎉 Successfully seeded ${mockPersons.length} persons of interest!`);
    console.log('🔗 View them at: http://localhost:5174/persons-of-interest');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await sql.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPersonsOfInterest();
}

export { seedPersonsOfInterest };
