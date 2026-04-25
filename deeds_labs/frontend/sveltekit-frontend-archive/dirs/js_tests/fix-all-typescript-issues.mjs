#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Fixing all TypeScript and Svelte issues...\n');

// 1. First, update the database schema to include missing tables
const schemaPath = join(__dirname, 'src/lib/server/db/schema-postgres.ts');
let schema = readFileSync(schemaPath, 'utf8');

// Add missing tables to the schema
const missingTables = `
// === REPORTS & CITATIONS ===

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  reportType: varchar('report_type', { length: 50 }).default('case_summary'),
  status: varchar('status', { length: 20 }).default('draft'),
  isPublic: boolean('is_public').default(false),
  tags: jsonb('tags').default([]).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const citationPoints = pgTable('citation_points', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }),
  caseId: uuid('case_id').references(() => cases.id),
  content: text('content').notNull(),
  source: varchar('source', { length: 255 }),
  pageNumber: integer('page_number'),
  position: jsonb('position').default({}).notNull(),
  tags: jsonb('tags').default([]).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const canvasStates = pgTable('canvas_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  canvasData: jsonb('canvas_data').notNull(),
  version: integer('version').default(1),
  isDefault: boolean('is_default').default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const personsOfInterest = pgTable('persons_of_interest', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  aliases: jsonb('aliases').default([]).notNull(),
  relationship: varchar('relationship', { length: 100 }),
  threatLevel: varchar('threat_level', { length: 20 }).default('low'),
  status: varchar('status', { length: 20 }).default('active'),
  profileData: jsonb('profile_data').default({}).notNull(),
  tags: jsonb('tags').default([]).notNull(),
  position: jsonb('position').default({}).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const hashVerifications = pgTable('hash_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'cascade' }),
  verifiedHash: varchar('verified_hash', { length: 64 }).notNull(),
  storedHash: varchar('stored_hash', { length: 64 }),
  result: boolean('result').notNull(),
  verificationMethod: varchar('verification_method', { length: 50 }).default('manual'),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { mode: 'date' }).defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const statutes = pgTable('statutes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  isActive: boolean('is_active').default(true),
  penalties: jsonb('penalties').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// === VECTOR SEARCH TABLES ===

export const userEmbeddings = pgTable('user_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: text('embedding').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const chatEmbeddings = pgTable('chat_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull(),
  messageId: uuid('message_id').notNull(),
  content: text('content').notNull(),
  embedding: text('embedding').notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const evidenceVectors = pgTable('evidence_vectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: text('embedding').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const caseEmbeddings = pgTable('case_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: text('embedding').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// === ADDITIONAL RELATIONS ===

export const reportsRelations = relations(reports, ({ one }) => ({
  case: one(cases, {
    fields: [reports.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
  }),
}));

export const citationPointsRelations = relations(citationPoints, ({ one }) => ({
  report: one(reports, {
    fields: [citationPoints.reportId],
    references: [reports.id],
  }),
  case: one(cases, {
    fields: [citationPoints.caseId],
    references: [cases.id],
  }),
}));

export const canvasStatesRelations = relations(canvasStates, ({ one }) => ({
  case: one(cases, {
    fields: [canvasStates.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [canvasStates.createdBy],
    references: [users.id],
  }),
}));

export const personsOfInterestRelations = relations(personsOfInterest, ({ one }) => ({
  case: one(cases, {
    fields: [personsOfInterest.caseId],
    references: [cases.id],
  }),
  createdBy: one(users, {
    fields: [personsOfInterest.createdBy],
    references: [users.id],
  }),
}));

export const hashVerificationsRelations = relations(hashVerifications, ({ one }) => ({
  evidence: one(evidence, {
    fields: [hashVerifications.evidenceId],
    references: [evidence.id],
  }),
  verifiedBy: one(users, {
    fields: [hashVerifications.verifiedBy],
    references: [users.id],
  }),
}));

export const userEmbeddingsRelations = relations(userEmbeddings, ({ one }) => ({
  user: one(users, {
    fields: [userEmbeddings.userId],
    references: [users.id],
  }),
}));

export const chatEmbeddingsRelations = relations(chatEmbeddings, ({ one }) => ({
  // No direct relations as conversationId may not have a table
}));

export const evidenceVectorsRelations = relations(evidenceVectors, ({ one }) => ({
  evidence: one(evidence, {
    fields: [evidenceVectors.evidenceId],
    references: [evidence.id],
  }),
}));

export const caseEmbeddingsRelations = relations(caseEmbeddings, ({ one }) => ({
  case: one(cases, {
    fields: [caseEmbeddings.caseId],
    references: [cases.id],
  }),
}));
`;

// Insert the missing tables before the existing relations
const insertPoint = schema.indexOf('// === RELATIONSHIPS ===');
if (insertPoint !== -1) {
  schema = schema.slice(0, insertPoint) + missingTables + '\n' + schema.slice(insertPoint);
  writeFileSync(schemaPath, schema);
  console.log('✅ Added missing tables to database schema');
}

// 2. Create a comprehensive UI components export file
const uiIndexPath = join(__dirname, 'src/lib/components/ui/index.ts');
const uiExports = `// Comprehensive UI components exports
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as CardHeader } from './card/CardHeader.svelte';
export { default as CardContent } from './card/CardContent.svelte';
export { default as CardFooter } from './card/CardFooter.svelte';
export { default as Input } from './Input.svelte';
export { default as Badge } from './Badge.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Dialog } from './dialog/Dialog.svelte';
export { default as Drawer } from './drawer/Drawer.svelte';

// Re-export common UI patterns
export * as Card from './card/index.js';
export * as Dialog from './dialog/index.js';
export * as ContextMenu from './context-menu/index.js';
export * as DropdownMenu from './dropdown-menu/index.js';
export * as Select from './select/index.js';
export * as Tooltip from './tooltip/index.js';
export * as Textarea from './textarea/index.js';
`;

try {
  writeFileSync(uiIndexPath, uiExports);
  console.log('✅ Created comprehensive UI components index');
} catch (error) {
  console.log('⚠️  Could not write UI index:', error.message);
}

// 3. Fix Card components to have proper structure
const cardComponents = ['CardHeader.svelte', 'CardContent.svelte', 'CardFooter.svelte'];

cardComponents.forEach((componentName) => {
  const cardPath = join(__dirname, `src/lib/components/ui/${componentName}`);
  const componentContent = `<script lang="ts">
  export let className: string = '';
  $: classes = className;
</script>

<div class="{classes}">
  <slot />
</div>
`;

  try {
    writeFileSync(cardPath, componentContent);
    console.log(`✅ Fixed ${componentName}`);
  } catch (error) {
    console.log(`⚠️  Could not fix ${componentName}:`, error.message);
  }
});

// 4. Create missing context menu components
const contextMenuPath = join(__dirname, 'src/lib/components/ui/context-menu');
const contextMenuIndex = `// Context Menu components
export { default as Root } from './ContextMenuRoot.svelte';
export { default as Trigger } from './ContextMenuTrigger.svelte';
export { default as Content } from './ContextMenuContent.svelte';
export { default as Item } from './ContextMenuItem.svelte';
export { default as Separator } from './ContextMenuSeparator.svelte';
`;

try {
  writeFileSync(join(contextMenuPath, 'index.js'), contextMenuIndex);
  console.log('✅ Created context menu index');
} catch (error) {
  console.log('⚠️  Context menu directory may not exist');
}

// 5. Fix import path issues in TypeScript/JavaScript files
function fixImportPaths(dir) {
  try {
    const files = readdirSync(dir);
    files.forEach((file) => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);

      if (stat.isDirectory()) {
        fixImportPaths(filePath);
      } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.svelte')) {
        try {
          let content = readFileSync(filePath, 'utf8');
          let modified = false;

          // Fix database import paths
          const dbImportRegex = /from ['"](.*db\.js)['"]|from ['"](.*db)['"](?!\/)/g;
          content = content.replace(dbImportRegex, "from '$lib/server/db/index.js'");

          // Fix schema import paths
          const schemaImportRegex =
            /from ['"](.*schema\.js)['"]|from ['"](.*unified-schema\.js)['"](?!\/)/g;
          content = content.replace(schemaImportRegex, "from '$lib/server/db/schema.js'");

          // Fix vector schema imports
          const vectorSchemaRegex = /from ['"](.*vector-schema\.js)['"](?!\/)/g;
          content = content.replace(
            vectorSchemaRegex,
            "from '$lib/server/database/vector-schema.js'"
          );

          // Fix UI component imports
          const uiImportRegex = /from ['"](.*components\/ui\.js)['"](?!\/)/g;
          content = content.replace(uiImportRegex, "from '$lib/components/ui/index.js'");

          if (content !== readFileSync(filePath, 'utf8')) {
            writeFileSync(filePath, content);
            modified = true;
          }

          if (modified) {
            console.log(`✅ Fixed imports in ${filePath}`);
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    });
  } catch (error) {
    // Skip directories that can't be read
  }
}

console.log('\n🔍 Fixing import paths...');
fixImportPaths(join(__dirname, 'src'));

// 6. Fix specific critical files
const criticalFixes = [
  {
    file: 'src/lib/server/lucia.ts',
    fix: (content) => {
      // Fix Lucia adapter import and usage
      return content
        .replace(/from '\.\/db\.js'/, "from './db/index.js'")
        .replace(/from '\.\/db\/unified-schema\.js'/, "from './db/schema.js'")
        .replace(/DrizzleSQLiteAdapter/g, 'DrizzlePostgreSQLAdapter')
        .replace(
          /import.*DrizzleSQLiteAdapter.*from.*/,
          "import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';"
        );
    },
  },
  {
    file: 'src/lib/components/ui/dialog/DialogRoot.svelte',
    fix: (content) => {
      // Fix Dialog component
      return content.replace(/open,/, 'open: open,');
    },
  },
];

criticalFixes.forEach(({ file, fix }) => {
  const filePath = join(__dirname, file);
  try {
    const content = readFileSync(filePath, 'utf8');
    const fixed = fix(content);
    if (fixed !== content) {
      writeFileSync(filePath, fixed);
      console.log(`✅ Fixed critical file: ${file}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not fix ${file}:`, error.message);
  }
});

// 7. Create missing type definitions
const typesPath = join(__dirname, 'src/lib/types/index.ts');
const typeDefinitions = `// Comprehensive type definitions
export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Evidence {
  id: string;
  caseId?: string;
  title: string;
  description?: string;
  evidenceType: string;
  fileUrl?: string;
  fileSize?: number;
  tags: any[];
  uploadedAt: Date;
  updatedAt: Date;
}

export interface Report {
  id: string;
  caseId?: string;
  title: string;
  content?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface POI {
  id: string;
  caseId: string;
  name: string;
  aliases: string[];
  relationship?: string;
  threatLevel: string;
  status: string;
  profileData: any;
  tags: string[];
  position: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIResponse {
  content: string;
  confidence?: number;
  sources?: any[];
  metadata?: any;
}

export interface ConversationHistory {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Gemma3Config {
  temperature: number;
  maxTokens: number;
  topP: number;
}

// Enhanced feature types
export interface EmbeddingOptions {
  model?: string;
  caseId?: string;
  userId?: string;
  evidenceId?: string;
  conversationId?: string;
}

export interface EmbeddingProvider {
  name: string;
  available: boolean;
}
`;

try {
  writeFileSync(typesPath, typeDefinitions);
  console.log('✅ Created comprehensive type definitions');
} catch (error) {
  console.log('⚠️  Could not create types:', error.message);
}

console.log('\n🎉 TypeScript and Svelte fixes completed!');
console.log('\n📋 Next steps:');
console.log('1. Run: npm run check -- to verify fixes');
console.log('2. Run: npm run db:push -- to update database schema');
console.log('3. Run: npm run dev -- to start development server');
console.log('4. Check remaining errors and fix manually if needed');
