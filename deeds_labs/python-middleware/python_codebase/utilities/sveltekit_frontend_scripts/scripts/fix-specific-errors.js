#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Specific error fixes based on svelte-check output
const errorFixes = [
  {
    file: 'src/routes/all-routes/+page.svelte',
    fixes: [
      {
        from: /const clusters: \{ \[key: string\]: any\[\] \} = ;/,
        to: 'const clusters: { [key: string]: any[] } = {};',
      },
    ],
  },
  {
    file: 'src/routes/complete-demo/+page.svelte',
    fixes: [{ from: /console\.error\.error\);/, to: 'console.error(error);' }],
  },
  {
    file: 'src/routes/brain/+page.svelte',
    fixes: [
      {
        from: /let nodeMeshes = \$state<Record<string, THREE\.Mesh>>\(''\)>\( \);/,
        to: 'let nodeMeshes = $state<Record<string, THREE.Mesh>>({});',
      },
    ],
  },
  {
    file: 'src/routes/assistant/+page.svelte',
    fixes: [
      {
        from: /contextItems = \(data[^}]+\)\.items\.map\.id\.toString\(\),\s*title:/,
        to: 'contextItems = (data as { items: any[] }).items.map(item => ({ id: item.id.toString(), title:',
      },
    ],
  },
  {
    file: 'src/routes/cases/+page.svelte',
    fixes: [
      {
        from: /const createCaseSchema = z\.object\.min-max\(500, 'Case title too long'\),\s*description: z\.string\.optional\(\),/,
        to: "const createCaseSchema = z.object({ title: z.string().min(1).max(500, 'Case title too long'), description: z.string().optional(),",
      },
    ],
  },
  {
    file: 'src/routes/editor/+page.svelte',
    fixes: [
      {
        from: /onMount\(\(\) => \{[^}]*\},\s*settings: \{/,
        to: 'onMount(() => { /* initialization */ }); const settings = {',
      },
    ],
  },
  {
    file: 'src/routes/demos/+page.svelte',
    fixes: [
      {
        from: /let scrollElement = \$state<HTMLElement[^>]*>\([^)]*\)\([^)]*\)/,
        to: 'let scrollElement = $state<HTMLElement | null>(null); const demoCategories = [',
      },
    ],
  },
  {
    file: 'src/routes/admin/+layout.svelte',
    fixes: [
      {
        from: /navItems\.filter\.permission\)\)/,
        to: 'navItems.filter(item => hasPermission(currentUserValue.role, item.permission))',
      },
    ],
  },
  {
    file: 'src/routes/authenticated-crud-test/+page.svelte',
    fixes: [{ from: /JSON\.stringify\.details\)/, to: 'JSON.stringify((data as any).details)' }],
  },
  {
    file: 'src/routes/dev-demo/+page.svelte',
    fixes: [
      {
        from: /let apiStatus = \$state<Record<string, any>>\(''\)>\( \);/,
        to: 'let apiStatus = $state<Record<string, any>>({});',
      },
    ],
  },
  {
    file: 'src/routes/detective/+page.svelte',
    fixes: [
      {
        from: /if \(typeof window !== 'undefined'\) \{[^}]*\} joined the case<\/span>/,
        to: "if (typeof window !== 'undefined') { /* notification code */ } \n        span.textContent = `${user.name} joined the case`;",
      },
    ],
  },
  {
    file: 'src/routes/interactive-canvas/+page.svelte',
    fixes: [
      {
        from: /const hash = await crypto\.subtle\.digest\('SHA-256', await file\.arrayBuffer\(\);/,
        to: "const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());",
      },
    ],
  },
  {
    file: 'src/routes/gallery/+page.svelte',
    fixes: [
      {
        from: /evidence: mediaItems\.filter\.category === 'evidence'\)\.length,/,
        to: "evidence: mediaItems.filter(item => item.category === 'evidence').length,",
      },
      {
        from: /images: mediaItems\.filter\.category === 'images'\)\.length,/,
        to: "images: mediaItems.filter(item => item.category === 'images').length,",
      },
      {
        from: /documents: mediaItems\.filter\.category === 'documents'\)\.length,/,
        to: "documents: mediaItems.filter(item => item.category === 'documents').length,",
      },
    ],
  },
  {
    file: 'src/routes/evidence/+page.svelte',
    fixes: [
      {
        from: /evidenceActions\.setItems\.evidence \|\| \[\]\);/,
        to: 'evidenceActions.setItems(data.evidence || []);',
      },
    ],
  },
  {
    file: 'src/routes/laws/+page.svelte',
    fixes: [{ from: /console\.error\.error\);/, to: 'console.error(error);' }],
  },
];

function fixFile(fileInfo) {
  const filePath = path.join(__dirname, '..', fileInfo.file);

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    fileInfo.fixes.forEach(({ from, to }) => {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed specific errors in: ${fileInfo.file}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${fileInfo.file}:`, error.message);
  }
}

console.log('🔄 Fixing specific syntax errors from svelte-check...');

errorFixes.forEach(fixFile);

console.log('✨ Specific error fixes complete!');
