#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Final TypeScript error fix - comprehensive approach...');

// Helper function to recursively find all files
function findFiles(dir, extension) {
  const files = [];
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          files.push(...findFiles(fullPath, extension));
        } else if (entry.endsWith(extension)) {
          files.push(fullPath);
        }
      } catch (error) {
        // Skip files we can't access
        continue;
      }
    }
  } catch (error) {
    // Skip directories we can't access
  }

  return files;
}

// 1. Fix all embedding and vector service imports
function fixVectorServiceImports() {
  console.log('🔍 Fixing vector service imports...');

  const files = [
    ...findFiles('./src/lib/server/ai', '.ts'),
    ...findFiles('./src/lib/server/services', '.ts'),
    ...findFiles('./src/routes/api', '.ts'),
    ...findFiles('./scripts', '.ts'),
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix Qdrant client import
    if (content.includes('QdrantClient') && !content.includes('import { QdrantClient }')) {
      content = `import { QdrantClient } from '@qdrant/js-client-rest';\n${content}`;
      changed = true;
    }

    // Fix vector search result type
    if (content.includes('vectorSearch') || content.includes('search(')) {
      if (!content.includes('SearchResult')) {
        content = `import type { SearchResult, VectorSearchOptions } from '../../types/vector.js';\n${content}`;
        changed = true;
      }
    }

    // Fix embedding function signatures
    content = content.replace(
      /generateEmbedding\s*\([^)]*\)\s*:/g,
      'generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[] | null>'
    );

    // Fix vector search function signatures
    content = content.replace(
      /vectorSearch\s*\([^)]*\)\s*:/g,
      'vectorSearch(query: string, options?: VectorSearchOptions): Promise<SearchResult[]>'
    );

    // Add missing error handling
    if (content.includes('await ') && !content.includes('try {')) {
      content = content.replace(/(export async function [^{]+{)/g, '$1\n  try {');
      content = content.replace(
        /}(\s*)$/,
        '  } catch (error) {\n    console.error("Error in vector service:", error);\n    throw error;\n  }\n}$1'
      );
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed vector service imports in ${file}`);
    }
  }
}

// 2. Fix all API endpoint type issues
function fixAPIEndpointTypes() {
  console.log('🔌 Fixing API endpoint types...');

  const serverFiles = findFiles('./src/routes/api', '+server.ts');

  for (const file of serverFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Add missing imports
    if (!content.includes('import type') && content.includes('RequestEvent')) {
      content = `import type { RequestEvent } from '@sveltejs/kit';\n${content}`;
      changed = true;
    }

    // Fix function signatures
    const functionPatterns = [
      {
        pattern: /export async function GET\s*\(\s*\w*\s*\)/g,
        replacement: 'export async function GET({ url, params, locals }: RequestEvent)',
      },
      {
        pattern: /export async function POST\s*\(\s*\w*\s*\)/g,
        replacement: 'export async function POST({ request, params, locals }: RequestEvent)',
      },
      {
        pattern: /export async function PUT\s*\(\s*\w*\s*\)/g,
        replacement: 'export async function PUT({ request, params, locals }: RequestEvent)',
      },
      {
        pattern: /export async function DELETE\s*\(\s*\w*\s*\)/g,
        replacement: 'export async function DELETE({ params, locals }: RequestEvent)',
      },
    ];

    for (const { pattern, replacement } of functionPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        changed = true;
      }
    }

    // Fix response types
    if (content.includes('return ') && !content.includes('Response')) {
      content = content.replace(
        /return\s+{\s*([^}]+)\s*}/g,
        'return new Response(JSON.stringify({ $1 }), { headers: { "Content-Type": "application/json" } })'
      );
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed API endpoint types in ${file}`);
    }
  }
}

// 3. Fix store type issues
function fixStoreTypes() {
  console.log('🏪 Fixing store type issues...');

  const storeFiles = findFiles('./src/lib/stores', '.ts');

  for (const file of storeFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix writable store imports
    if (content.includes('writable') && !content.includes('type Writable')) {
      content = content.replace(
        /import\s*{\s*([^}]*writable[^}]*)\s*}\s*from\s*['"]svelte\/store['"];?/gi,
        'import { writable, derived, type Writable, type Readable } from "svelte/store";'
      );
      changed = true;
    }

    // Fix browser-only imports
    if (content.includes('browser') && !content.includes('import { browser }')) {
      content = `import { browser } from '$app/environment';\n${content}`;
      changed = true;
    }

    // Fix undefined error access
    content = content.replace(
      /error\\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      'error?.[$1] || error?.message || "Unknown error"'
    );

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed store types in ${file}`);
    }
  }
}

// 4. Fix component import issues
function fixComponentImports() {
  console.log('🎨 Fixing component import issues...');

  const svelteFiles = findFiles('./src', '.svelte');

  for (const file of svelteFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix relative imports
    content = content.replace(/from ['"]\$lib\//g, 'from "../');

    // Fix UI component imports to use local components
    const uiImportPatterns = [
      {
        pattern: /import\s*{\s*([^}]*)\s*}\s*from\s*['"]bits-ui['"];?/g,
        replacement: 'import { $1 } from "../lib/components/ui/index.js";',
      },
      {
        pattern: /import\s*{\s*([^}]*)\s*}\s*from\s*['"]@melt-ui\/svelte['"];?/g,
        replacement: 'import { createDropdownMenu, createDialog } from "@melt-ui/svelte";',
      },
    ];

    for (const { pattern, replacement } of uiImportPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        changed = true;
      }
    }

    // Fix icon imports
    if (content.includes('lucide-svelte')) {
      const iconMatches = content.match(/import\s*{([^}]*)}\s*from\s*['"]lucide-svelte['"];?/g);
      if (iconMatches) {
        for (const match of iconMatches) {
          const iconsText = match.match(/{([^}]*)}/)[1];
          const icons = iconsText
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s);
          const individualImports = icons
            .map((icon) => `import ${icon} from 'lucide-svelte/icons/${icon.toLowerCase()}.js';`)
            .join('\n');
          content = content.replace(match, individualImports);
          changed = true;
        }
      }
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed component imports in ${file}`);
    }
  }
}

// 5. Fix schema issues and database types
function fixSchemaTypes() {
  console.log('📋 Fixing schema and database types...');

  const files = [
    ...findFiles('./src/lib/server', '.ts'),
    ...findFiles('./src/routes', '.ts'),
    ...findFiles('./src/lib/stores', '.ts'),
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Ensure schema imports are correct
    if (
      content.includes('import') &&
      (content.includes('users') || content.includes('cases') || content.includes('evidence'))
    ) {
      if (
        !content.includes('from "../server/db/schema.js"') &&
        !content.includes('from "./schema.js"')
      ) {
        // Determine correct relative path
        const depth = file.split('/').length - file.split('/').indexOf('src') - 1;
        const relativePath = '../'.repeat(depth - 2) + 'server/db/schema.js';

        content = `import { users, cases, evidence, sessions } from '${relativePath}';\n${content}`;
        changed = true;
      }
    }

    // Fix drizzle query methods
    content = content.replace(/db\.select\(\s*{\s*([^}]+)\s*}\s*\)/g, 'db.select($1)');

    // Fix drizzle update methods
    content = content.replace(
      /db\.update\(([^)]+)\)\.set\(([^)]+)\)\.where\(([^)]+)\)/g,
      'db.update($1).set($2).where($3)'
    );

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed schema types in ${file}`);
    }
  }
}

// 6. Create missing type definitions
function createMissingTypes() {
  console.log('📝 Creating missing type definitions...');

  // Create comprehensive types file
  const typesContent = `// Comprehensive type definitions for the application

export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: 'prosecutor' | 'admin' | 'analyst';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  name?: string;
  description?: string;
  incidentDate?: Date;
  location?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'closed' | 'archived';
  category?: string;
  dangerScore: number;
  estimatedValue?: number;
  jurisdiction?: string;
  leadProsecutor?: string;
  assignedTeam: string[];
  tags: string[];
  aiSummary?: string;
  aiTags: string[];
  metadata: Record<string, any>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface Evidence {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  type: 'document' | 'image' | 'video' | 'audio' | 'physical' | 'digital';
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  hash?: string;
  chainOfCustody: ChainOfCustodyEntry[];
  tags: string[];
  metadata: Record<string, any>;
  isVerified: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: Date;
  summary?: string;
  aiSummary?: string;
  embedding?: number[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChainOfCustodyEntry {
  id: string;
  evidenceId: string;
  action: 'collected' | 'transferred' | 'examined' | 'stored' | 'accessed';
  performedBy: string;
  timestamp: Date;
  location?: string;
  notes?: string;
  signature?: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Store types
export interface UserStore {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface CaseStore {
  cases: Case[];
  currentCase: Case | null;
  loading: boolean;
  error: string | null;
}

export interface EvidenceStore {
  evidence: Evidence[];
  currentEvidence: Evidence | null;
  loading: boolean;
  error: string | null;
}

// Form types
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}

export interface CaseForm {
  title: string;
  description?: string;
  incidentDate?: Date;
  location?: string;
  priority: Case['priority'];
  category?: string;
  jurisdiction?: string;
}

export interface EvidenceForm {
  title: string;
  description?: string;
  type: Evidence['type'];
  tags: string[];
  files?: File[];
}
`;

  writeFileSync('./src/lib/types/index.ts', typesContent);
  console.log('✅ Created comprehensive type definitions');
}

// 7. Fix auth and session issues
function fixAuthTypes() {
  console.log('🔐 Fixing auth and session types...');

  const authFiles = [
    './src/lib/server/lucia.ts',
    './src/lib/auth/session.ts',
    './src/hooks.server.ts',
  ];

  for (const file of authFiles) {
    if (!existsSync(file)) continue;

    let content = readFileSync(file, 'utf-8');
    let changed = false;

    // Fix Lucia imports
    if (content.includes('lucia')) {
      content = content.replace(
        /import\s*{\s*([^}]*)\s*}\s*from\s*['"]lucia['"];?/gi,
        'import { Lucia, type Session, type User } from "lucia";'
      );
      changed = true;
    }

    // Fix session validation
    content = content.replace(/validateSession\([^)]*\)/g, 'validateSession(sessionId: string)');

    if (changed) {
      writeFileSync(file, content);
      console.log(`✅ Fixed auth types in ${file}`);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting comprehensive TypeScript error fixes...\n');

    fixVectorServiceImports();
    fixAPIEndpointTypes();
    fixStoreTypes();
    fixComponentImports();
    fixSchemaTypes();
    createMissingTypes();
    fixAuthTypes();

    console.log('\n🎉 All TypeScript error fixes completed!');
    console.log('📋 Summary of fixes:');
    console.log('  ✅ Vector service imports and types');
    console.log('  ✅ API endpoint function signatures');
    console.log('  ✅ Store type definitions');
    console.log('  ✅ Component import paths');
    console.log('  ✅ Database schema types');
    console.log('  ✅ Missing type definitions');
    console.log('  ✅ Authentication types');
    console.log('\nRun "npm run check" to verify all fixes.');
  } catch (error) {
    console.error('❌ Error during comprehensive fix:', error);
    process.exit(1);
  }
}

main();
