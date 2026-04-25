#!/usr/bin/env node

/**
 * Comprehensive Error Fixer for SvelteKit Legal AI App
 * Fixes TypeScript errors, database schema issues, and import problems
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔧 Comprehensive Error Fixer for SvelteKit Legal AI');
console.log('===================================================\n');

// Configuration
const config = {
  srcDir: 'src',
  dryRun: false,
  backup: true,
  verbose: true,
};

// Error categories and fixes
const fixes = {
  // 1. Database Schema Fixes (Drizzle ORM)
  drizzleSchema: [
    {
      pattern: /id:\s*uuid\("id"\)\s*\.primaryKey\(\)/g,
      replacement: 'id: uuid("id").primaryKey().defaultRandom()',
      description: 'Fix Drizzle UUID primary key syntax',
    },
    {
      pattern: /\.default\(sql`uuid_generate_v4\(\)`\)/g,
      replacement: '.defaultRandom()',
      description: 'Fix UUID default value syntax',
    },
    {
      pattern: /pgTable\(\s*\{/g,
      replacement: 'pgTable("table_name", {',
      description: 'Fix pgTable syntax - missing table name',
    },
  ],

  // 2. TypeScript Import/Export Fixes
  typeScriptImports: [
    {
      pattern: /export \* from ['"]\.\//g,
      replacement: 'export * from "./',
      description: 'Fix export syntax',
    },
    {
      pattern: /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]\.\//g,
      replacement: (match, imports) => `import { ${imports.trim()} } from "./`,
      description: 'Fix import syntax',
    },
    {
      pattern: /UserSettings(?!Ext)/g,
      replacement: 'UserSettingsExt',
      description: 'Fix UserSettings import to UserSettingsExt',
    },
  ],

  // 3. Array Type Fixes
  arrayTypes: [
    {
      pattern: /Array\.isArray\(([^)]+)\[0\]\)\s*\?\s*([^:]+)\[0\]\s*:\s*([^,};\n]+)/g,
      replacement: 'Array.isArray($1) && Array.isArray($1[0]) ? $1[0] as number[] : $1 as number[]',
      description: 'Fix nested array type handling',
    },
    {
      pattern:
        /embedding:\s*Array\.isArray\(embedding\[0\]\)\s*\?\s*embedding\[0\]\s*:\s*embedding/g,
      replacement:
        'embedding: Array.isArray(embedding) && typeof embedding[0] === "object" ? embedding[0] as number[] : embedding as number[]',
      description: 'Fix embedding array type assertion',
    },
  ],

  // 4. Syntax Error Fixes
  syntaxErrors: [
    {
      pattern: /return\s+await\s+([^}]+)\s*\}\s*\)\s*$/gm,
      replacement: 'return await $1;\n}',
      description: 'Fix return await syntax',
    },
    {
      pattern: /\}\s*\)\s*\.onConflictDoNothing\(\);\s*$/gm,
      replacement: '}).onConflictDoNothing();',
      description: 'Fix method chaining syntax',
    },
    {
      pattern: /^\s*\}\s*$/gm,
      replacement: '}',
      description: 'Fix orphaned closing braces',
    },
  ],

  // 5. Svelte Component Fixes
  svelteComponents: [
    {
      pattern: /className=/g,
      replacement: 'class=',
      description: 'Fix React className to Svelte class',
    },
    {
      pattern: /htmlFor=/g,
      replacement: 'for=',
      description: 'Fix React htmlFor to Svelte for',
    },
    {
      pattern: /onClick=/g,
      replacement: 'on:click=',
      description: 'Fix React onClick to Svelte on:click',
    },
    {
      pattern: /onChange=/g,
      replacement: 'on:change=',
      description: 'Fix React onChange to Svelte on:change',
    },
    {
      pattern: /onSubmit=/g,
      replacement: 'on:submit=',
      description: 'Fix React onSubmit to Svelte on:submit',
    },
  ],
};

// Statistics tracking
let stats = {
  filesProcessed: 0,
  filesChanged: 0,
  totalFixes: 0,
  fixesByCategory: {},
  errors: [],
};

/**
 * Find all files to process
 */
function findFiles(dir, extensions = ['.ts', '.js', '.svelte']) {
  const files = [];

  function traverse(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!['node_modules', '.git', '.svelte-kit', 'build', 'dist'].includes(item)) {
            traverse(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentDir}`);
    }
  }

  traverse(dir);
  return files;
}

/**
 * Create backup of a file
 */
function createBackup(filePath) {
  if (!config.backup) return;

  try {
    const backupPath = filePath + '.backup';
    fs.copyFileSync(filePath, backupPath);
    if (config.verbose) {
      console.log(`  📋 Backup: ${path.basename(backupPath)}`);
    }
  } catch (error) {
    console.warn(`Warning: Could not create backup for ${filePath}`);
  }
}

/**
 * Apply fixes to a file
 */
function processFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    let content = originalContent;
    let fileChanges = 0;
    const appliedFixes = [];

    // Apply fixes by category
    for (const [categoryName, categoryFixes] of Object.entries(fixes)) {
      for (const fix of categoryFixes) {
        const beforeContent = content;

        if (typeof fix.replacement === 'function') {
          content = content.replace(fix.pattern, fix.replacement);
        } else {
          content = content.replace(fix.pattern, fix.replacement);
        }

        if (content !== beforeContent) {
          const matches = (beforeContent.match(fix.pattern) || []).length;
          fileChanges += matches;
          appliedFixes.push(`${fix.description} (${matches}x)`);

          if (!stats.fixesByCategory[categoryName]) {
            stats.fixesByCategory[categoryName] = 0;
          }
          stats.fixesByCategory[categoryName] += matches;
        }
      }
    }

    // Update statistics
    stats.filesProcessed++;
    stats.totalFixes += fileChanges;

    if (fileChanges > 0) {
      stats.filesChanged++;

      if (config.verbose) {
        console.log(`📝 ${path.relative(process.cwd(), filePath)}`);
        appliedFixes.forEach((fix) => console.log(`  ✅ ${fix}`));
      }

      if (!config.dryRun) {
        createBackup(filePath);
        fs.writeFileSync(filePath, content, 'utf8');
        if (config.verbose) {
          console.log(`  💾 File updated\n`);
        }
      } else {
        console.log(`  👀 Would update (dry run)\n`);
      }
    }
  } catch (error) {
    stats.errors.push(`${filePath}: ${error.message}`);
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

/**
 * Fix specific problematic files
 */
function fixSpecificFiles() {
  console.log('🎯 Fixing specific problematic files...\n');

  // Fix vector-schema.ts
  const vectorSchemaPath = path.join('src', 'lib', 'server', 'database', 'vector-schema.ts');
  if (fs.existsSync(vectorSchemaPath)) {
    const fixedVectorSchema = `// Enhanced Drizzle schema with pgvector support
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Custom pgvector column type for Drizzle
const vectorColumn = (name: string, dimensions: number = 1536) =>
  sql\`\${sql.raw(name)} vector(\${sql.raw(dimensions.toString())})\`.mapWith({
    mapFromDriverValue: (value: string) => JSON.parse(value),
    mapToDriverValue: (value: number[]) => JSON.stringify(value),
  });

// User embeddings table
export const userEmbeddings = pgTable(
  "user_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    embedding: vectorColumn("embedding", 1536),
    metadata: jsonb("metadata").default(sql\`'{}'\`),
    caseId: uuid("case_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_embeddings_user_id_idx").on(table.userId),
    caseIdIdx: index("user_embeddings_case_id_idx").on(table.caseId),
    contentTypeIdx: index("user_embeddings_content_type_idx").on(table.contentType),
  })
);

// Case embeddings table  
export const caseEmbeddings = pgTable(
  "case_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    embedding: vectorColumn("embedding", 1536),
    metadata: jsonb("metadata").default(sql\`'{}'\`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    caseIdIdx: index("case_embeddings_case_id_idx").on(table.caseId),
    contentTypeIdx: index("case_embeddings_content_type_idx").on(table.contentType),
  })
);

// Evidence embeddings table
export const evidenceEmbeddings = pgTable(
  "evidence_embeddings", 
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceId: uuid("evidence_id").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    embedding: vectorColumn("embedding", 1536),
    metadata: jsonb("metadata").default(sql\`'{}'\`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    evidenceIdIdx: index("evidence_embeddings_evidence_id_idx").on(table.evidenceId),
    contentTypeIdx: index("evidence_embeddings_content_type_idx").on(table.contentType),
  })
);

// Document embeddings table
export const documentEmbeddings = pgTable(
  "document_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull(),
    contentType: varchar("content_type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    embedding: vectorColumn("embedding", 1536),
    metadata: jsonb("metadata").default(sql\`'{}'\`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    documentIdIdx: index("document_embeddings_document_id_idx").on(table.documentId),
    contentTypeIdx: index("document_embeddings_content_type_idx").on(table.contentType),
  })
);

// Search embeddings table
export const searchEmbeddings = pgTable(
  "search_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    query: text("query").notNull(),
    embedding: vectorColumn("embedding", 1536),
    metadata: jsonb("metadata").default(sql\`'{}'\`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index("search_embeddings_user_id_idx").on(table.userId),
  })
);
`;

    if (!config.dryRun) {
      createBackup(vectorSchemaPath);
      fs.writeFileSync(vectorSchemaPath, fixedVectorSchema, 'utf8');
    }
    console.log('✅ Fixed vector-schema.ts with proper Drizzle syntax\n');
  }

  // Fix seed.ts file
  const seedPath = path.join('src', 'lib', 'server', 'db', 'seed.ts');
  if (fs.existsSync(seedPath)) {
    try {
      let seedContent = fs.readFileSync(seedPath, 'utf8');

      // Fix syntax errors in seed file
      seedContent = seedContent.replace(
        /return\s+await\s+seedDatabase\(\)\s*\}\s*\)\s*$/gm,
        'return await seedDatabase();\n}'
      );
      seedContent = seedContent.replace(
        /\}\s*\)\s*\.onConflictDoNothing\(\);\s*$/gm,
        '}).onConflictDoNothing();'
      );
      seedContent = seedContent.replace(/UserSettings/g, 'UserSettingsExt');

      if (!config.dryRun) {
        createBackup(seedPath);
        fs.writeFileSync(seedPath, seedContent, 'utf8');
      }
      console.log('✅ Fixed seed.ts syntax errors\n');
    } catch (error) {
      console.log('⚠️ Could not fix seed.ts automatically\n');
    }
  }
}

/**
 * Fix AI service type issues
 */
function fixAIServiceTypes() {
  const aiServicePath = path.join('src', 'lib', 'services', 'ai-service.ts');
  if (fs.existsSync(aiServicePath)) {
    try {
      let content = fs.readFileSync(aiServicePath, 'utf8');

      // Fix embedding array type issues
      const fixedEmbeddingHandling = `
// Fix embedding type handling
const normalizeEmbedding = (embedding: number[] | number[][]): number[] => {
  if (Array.isArray(embedding) && Array.isArray(embedding[0])) {
    return embedding[0] as number[];
  }
  return embedding as number[];
};

// Use in the problematic section:
embedding: normalizeEmbedding(embedding),
`;

      // Apply the fix
      content = content.replace(
        /embedding:\s*Array\.isArray\(embedding\[0\]\)\s*\?\s*embedding\[0\]\s*:\s*embedding,/g,
        'embedding: normalizeEmbedding(embedding),'
      );

      // Add the helper function if not present
      if (!content.includes('normalizeEmbedding')) {
        content = fixedEmbeddingHandling + content;
      }

      if (!config.dryRun) {
        createBackup(aiServicePath);
        fs.writeFileSync(aiServicePath, content, 'utf8');
      }
      console.log('✅ Fixed AI service type issues\n');
    } catch (error) {
      console.log('⚠️ Could not fix AI service automatically\n');
    }
  }
}

/**
 * Main execution
 */
function main() {
  const srcPath = path.resolve(config.srcDir);

  if (!fs.existsSync(srcPath)) {
    console.error(`❌ Source directory not found: ${srcPath}`);
    process.exit(1);
  }

  console.log(`📂 Scanning: ${srcPath}`);
  console.log(`🚀 Mode: ${config.dryRun ? 'DRY RUN' : 'APPLY FIXES'}`);
  console.log(`💾 Backup: ${config.backup ? 'ENABLED' : 'DISABLED'}\n`);

  // Fix specific problematic files first
  fixSpecificFiles();
  fixAIServiceTypes();

  // Process all files
  const files = findFiles(srcPath);
  console.log(`📋 Found ${files.length} files to process\n`);

  files.forEach(processFile);

  // Print summary
  console.log('\n📊 SUMMARY');
  console.log('===========');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files changed: ${stats.filesChanged}`);
  console.log(`Total fixes applied: ${stats.totalFixes}`);
  console.log();

  if (Object.keys(stats.fixesByCategory).length > 0) {
    console.log('Fixes by category:');
    for (const [category, count] of Object.entries(stats.fixesByCategory)) {
      console.log(`  • ${category}: ${count} fixes`);
    }
    console.log();
  }

  if (stats.errors.length > 0) {
    console.log('❌ Errors encountered:');
    stats.errors.forEach((error) => console.log(`  • ${error}`));
    console.log();
  }

  if (stats.filesChanged > 0) {
    console.log(
      `✅ Successfully fixed ${stats.totalFixes} issues across ${stats.filesChanged} files!`
    );
    console.log('\n🚀 Next steps:');
    console.log('1. Run "npm run check" to verify fixes');
    console.log('2. Test your application with "npm run dev"');
    console.log('3. Remove backup files once satisfied');
  } else {
    console.log('ℹ️ No issues found to fix.');
  }

  console.log('\n🎉 Error fixing complete!');
}

// Run the fixer
main();
