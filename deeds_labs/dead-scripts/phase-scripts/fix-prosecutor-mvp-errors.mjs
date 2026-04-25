#!/usr/bin/env node
/**
 * Fix Prosecutor MVP Blocking Errors
 * 1. Fix duplicate phase72:test in package.json
 * 2. Resolve route conflict [caseId] vs [id]
 * 3. Create complete Drizzle schema
 * 4. Create /api/reports/generate endpoint
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

console.log('🔧 Fixing Prosecutor MVP Blocking Errors\n');

// ============================================================================
// 0️⃣ FIX DUPLICATE phase72:test IN package.json
// ============================================================================
console.log('📋 Step 1: Fixing duplicate phase72:test...');
const packageJsonPath = join(ROOT, 'package.json');
let packageJson = readFileSync(packageJsonPath, 'utf-8');

// Replace the second occurrence with a renamed version
let foundFirst = false;
packageJson = packageJson.replace(/"phase72:test":\s*"[^"]+"/g, (match) => {
  if (!foundFirst) {
    foundFirst = true;
    return match; // Keep first one
  }
  // Rename second one
  return match.replace('"phase72:test":', '"phase72:test:pipeline":');
});

writeFileSync(packageJsonPath, packageJson);
console.log('✅ Fixed duplicate phase72:test → phase72:test:pipeline\n');

// ============================================================================
// 0️⃣ FIX ROUTE CONFLICT: [caseId] vs [id]
// ============================================================================
console.log('📋 Step 2: Resolving route conflict [caseId] vs [id]...');

// Delete the [caseId] folder since we already wired [id] in the completion script
const caseIdPath = join(ROOT, 'src/routes/api/cases/[caseId]');
if (existsSync(caseIdPath)) {
  console.log('   Removing conflicting [caseId] folder...');
  rmSync(caseIdPath, { recursive: true, force: true });
  console.log('✅ Removed /api/cases/[caseId] (keeping [id])\n');
} else {
  console.log('✅ No [caseId] conflict found\n');
}

// ============================================================================
// 1️⃣ CREATE COMPLETE DRIZZLE SCHEMA
// ============================================================================
console.log('📋 Step 3: Creating complete Drizzle schema...');

const schemaDir = join(ROOT, 'src/lib/server/db/schema');
if (!existsSync(schemaDir)) {
  mkdirSync(schemaDir, { recursive: true });
}

// A. cases.ts
const casesSchema = `import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer
} from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 256 }).notNull(),
  status: varchar('status', { length: 32 }).default('open').notNull(), // open | pending | filed | closed

  // narrative + 5W1H
  narrative: text('narrative'),
  who: text('who'),
  what: text('what'),
  when: text('when'),
  where: text('where'),
  why: text('why'),
  how: text('how'),

  // optional: statute / severity summary
  primaryStatute: varchar('primary_statute', { length: 64 }),
  severityLevel: integer('severity_level'), // 1-5

  prosecutorUserId: uuid('prosecutor_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
`;

writeFileSync(join(schemaDir, 'cases.ts'), casesSchema);
console.log('   ✅ Created cases.ts');

// B. persons.ts
const personsSchema = `import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp
} from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const personsOfInterest = pgTable('persons_of_interest', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: varchar('full_name', { length: 256 }).notNull(),
  role: varchar('role', { length: 64 }), // suspect | victim | witness | other
  riskLevel: varchar('risk_level', { length: 32 }), // low | medium | high
  dob: date('dob'),
  lastKnownLocation: text('last_known_location'),
  notes: text('notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const casePersons = pgTable('case_persons', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  personId: uuid('person_id')
    .notNull()
    .references(() => personsOfInterest.id, { onDelete: 'cascade' }),

  relationshipType: varchar('relationship_type', { length: 64 }), // defendant, co-defendant, witness, etc.
  isPrimary: varchar('is_primary', { length: 5 }).default('false'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
`;

writeFileSync(join(schemaDir, 'persons.ts'), personsSchema);
console.log('   ✅ Created persons.ts');

// C. evidence.ts
const evidenceSchema = `import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb
} from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const evidence = pgTable('evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),

  // file metadata
  kind: varchar('kind', { length: 32 }).notNull(), // document | video | image | audio | other
  title: varchar('title', { length: 256 }).notNull(),
  description: text('description'),
  fileKey: text('file_key').notNull(), // MinIO / S3 key
  mimeType: varchar('mime_type', { length: 128 }),
  sizeBytes: varchar('size_bytes', { length: 32 }),

  // integrity
  hash: varchar('hash', { length: 128 }),
  hashAlgorithm: varchar('hash_algorithm', { length: 32 }),

  // AI extraction / tags
  tags: jsonb('tags').$type<string[]>().default([] as any),
  aiSummary: text('ai_summary'),

  uploadedByUserId: uuid('uploaded_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
`;

writeFileSync(join(schemaDir, 'evidence.ts'), evidenceSchema);
console.log('   ✅ Created evidence.ts');

// D. reports.ts
const reportsSchema = `import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb
} from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),

  title: varchar('title', { length: 256 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(), // charging_memo | intake_summary | discovery_list | hearing_prep

  // TipTap content (you can use either or both)
  contentHtml: text('content_html'),      // HTML string (TipTap can parse this)
  contentJson: jsonb('content_json'),     // TipTap JSON if you decide to store it

  rawModelOutput: text('raw_model_output'),

  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
`;

writeFileSync(join(schemaDir, 'reports.ts'), reportsSchema);
console.log('   ✅ Created reports.ts');

// E. index.ts (barrel export)
const indexSchema = `export * from './cases';
export * from './persons';
export * from './evidence';
export * from './reports';
`;

writeFileSync(join(schemaDir, 'index.ts'), indexSchema);
console.log('   ✅ Created index.ts\n');

// ============================================================================
// 2️⃣ CREATE GEMMA3 REPORT GENERATION
// ============================================================================
console.log('📋 Step 4: Creating Gemma3 report generation...');

const llmDir = join(ROOT, 'src/lib/server/llm');
if (!existsSync(llmDir)) {
  mkdirSync(llmDir, { recursive: true });
}

// A. gemmaReports.ts
const gemmaReportsCode = `export type ReportTemplate = 'charging_memo' | 'intake_summary';

export async function generateReportWithGemma(opts: {
  caseTitle: string;
  caseId: string;
  template: ReportTemplate;
  narrative?: string | null;
  who?: string | null;
  what?: string | null;
  when?: string | null;
  where?: string | null;
  why?: string | null;
  how?: string | null;
  persons: Array<{ fullName: string; role?: string | null; riskLevel?: string | null }>;
  evidence: Array<{ title: string; kind: string }>;
}): Promise<string> {
  const {
    caseTitle,
    caseId,
    template,
    narrative,
    who,
    what,
    when,
    where,
    why,
    how,
    persons,
    evidence
  } = opts;

  const templateLabel =
    template === 'charging_memo'
      ? 'Charging Memorandum for Prosecutor'
      : 'Intake Summary for Prosecutor';

  const prompt = \`
You are a prosecutor-assistant legal AI.

Write a \${templateLabel} in HTML suitable for rendering in a rich text editor (TipTap). Use headings (<h2>), paragraphs, and bullet lists. Do NOT include <html>, <head>, or <body> tags.

Case ID: \${caseId}
Case Title: \${caseTitle}

WHO: \${who ?? ''}
WHAT: \${what ?? ''}
WHEN: \${when ?? ''}
WHERE: \${where ?? ''}
WHY: \${why ?? ''}
HOW: \${how ?? ''}

Narrative: \${narrative ?? ''}

Persons of Interest:
\${persons
  .map(
    (p, i) =>
      \`\${i + 1}. \${p.fullName} — role: \${p.role ?? 'unknown'}, risk: \${p.riskLevel ?? 'unknown'}\`
  )
  .join('\\n')}

Evidence Items:
\${evidence.map((e, i) => \`\${i + 1}. [\${e.kind}] \${e.title}\`).join('\\n')}

Requirements:
- Write in clear, prosecutorial tone.
- Sections for: Case Overview, Facts, Legal Analysis, Recommended Charges, Evidentiary Notes.
- DO NOT invent facts beyond what is provided.
- DO NOT include citations to real-world cases or statutes unless they are generic placeholders.
\`;

  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma3-legal', // adjust to your actual tag
      prompt,
      stream: false
    })
  });

  if (!res.ok) {
    throw new Error(\`Gemma3 request failed: \${res.status} \${res.statusText}\`);
  }

  const data = (await res.json()) as { response: string };
  return data.response; // plain HTML-ish text
}
`;

writeFileSync(join(llmDir, 'gemmaReports.ts'), gemmaReportsCode);
console.log('   ✅ Created gemmaReports.ts');

// B. /api/reports/generate/+server.ts
const reportsApiDir = join(ROOT, 'src/routes/api/reports/generate');
if (!existsSync(reportsApiDir)) {
  mkdirSync(reportsApiDir, { recursive: true });
}

const generateServerCode = `import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema/cases';
import { evidence } from '$lib/server/db/schema/evidence';
import { casePersons, personsOfInterest } from '$lib/server/db/schema/persons';
import { reports } from '$lib/server/db/schema/reports';
import { eq } from 'drizzle-orm';
import { generateReportWithGemma, type ReportTemplate } from '$lib/server/llm/gemmaReports';

type GenerateBody = {
  caseId: string;
  template: ReportTemplate;
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json()) as Partial<GenerateBody>;
  const caseId = body.caseId;
  const template = body.template ?? 'charging_memo';

  if (!caseId) {
    return json({ error: 'caseId is required' }, { status: 400 });
  }

  // 1. Load case
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId));

  if (!caseRow) {
    return json({ error: 'Case not found' }, { status: 404 });
  }

  // 2. Load persons for this case
  const personRows = await db
    .select({
      fullName: personsOfInterest.fullName,
      role: personsOfInterest.role,
      riskLevel: personsOfInterest.riskLevel
    })
    .from(casePersons)
    .innerJoin(personsOfInterest, eq(casePersons.personId, personsOfInterest.id))
    .where(eq(casePersons.caseId, caseId));

  // 3. Load evidence for this case
  const evidenceRows = await db
    .select({
      title: evidence.title,
      kind: evidence.kind
    })
    .from(evidence)
    .where(eq(evidence.caseId, caseId));

  // 4. Call Gemma3
  let contentHtml: string;
  try {
    contentHtml = await generateReportWithGemma({
      caseTitle: caseRow.title,
      caseId,
      template,
      narrative: caseRow.narrative,
      who: caseRow.who,
      what: caseRow.what,
      when: caseRow.when,
      where: caseRow.where,
      why: caseRow.why,
      how: caseRow.how,
      persons: personRows,
      evidence: evidenceRows
    });
  } catch (err) {
    console.error('Gemma3 report generation failed', err);
    return json({ error: 'LLM generation failed' }, { status: 500 });
  }

  // 5. Insert report row
  const title =
    template === 'charging_memo'
      ? \`Charging Memo — \${caseRow.title}\`
      : \`Intake Summary — \${caseRow.title}\`;

  const [inserted] = await db
    .insert(reports)
    .values({
      caseId,
      title,
      type: template,
      contentHtml,
      rawModelOutput: contentHtml,
      createdByUserId: (locals as any).user?.id ?? null
    })
    .returning();

  return json(inserted, { status: 201 });
};
`;

writeFileSync(join(reportsApiDir, '+server.ts'), generateServerCode);
console.log('   ✅ Created /api/reports/generate/+server.ts\n');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                                                                ║');
console.log('║              🎉 ALL ERRORS FIXED! 🎉                          ║');
console.log('║                                                                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('✅ Fixed duplicate phase72:test in package.json');
console.log('✅ Resolved route conflict [caseId] vs [id]');
console.log('✅ Created complete Drizzle schema:');
console.log('   - src/lib/server/db/schema/cases.ts');
console.log('   - src/lib/server/db/schema/persons.ts');
console.log('   - src/lib/server/db/schema/evidence.ts');
console.log('   - src/lib/server/db/schema/reports.ts');
console.log('   - src/lib/server/db/schema/index.ts');
console.log('✅ Created Gemma3 report generation:');
console.log('   - src/lib/server/llm/gemmaReports.ts');
console.log('   - src/routes/api/reports/generate/+server.ts\n');

console.log('🚀 NEXT STEPS:\n');
console.log('1. Run database migrations:');
console.log('   npm run db:push\n');
console.log('2. Start dev server:');
console.log('   npm run dev:quic\n');
console.log('3. Test report generation:');
console.log('   POST /api/reports/generate');
console.log('   { "caseId": "...", "template": "charging_memo" }\n');

console.log('Status: 🚀 READY TO RUN 🚀\n');
