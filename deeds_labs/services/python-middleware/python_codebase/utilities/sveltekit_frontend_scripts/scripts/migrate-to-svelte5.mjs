#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const filesToMigrate = [
  'src/lib/components/ai/ComprehensiveSummaryEngine.svelte',
  'src/lib/components/forms/SmartDocumentForm.svelte',
  'src/lib/components/TagList.svelte',
  'src/lib/components/ProgressIndicator.svelte',
  'src/routes/laws/+page.svelte',
  'src/lib/components/upload/FileUploadForm.svelte',
  'src/lib/components/upload/AdvancedFileUpload.svelte',
  'src/lib/components/ui/CommandPalette.svelte',
  'src/lib/components/ui/CommandMenu.svelte',
  'src/lib/components/ReviewSubmitForm.svelte',
  'src/lib/components/ReportEditor.svelte',
  'src/lib/components/RealtimeRAG.svelte',
  'src/lib/components/RealTimeEvidenceGrid.svelte',
  'src/lib/components/modals/CaseSummaryModal.svelte',
  'src/lib/components/InfiniteScrollList.svelte',
  'src/lib/components/forms/EnhancedFormInput.svelte',
  'src/lib/components/forms/EnhancedDocumentUploadForm.svelte',
  'src/lib/components/forms/EnhancedCaseForm.svelte',
  'src/lib/components/EvidenceAnalysisForm.svelte',
  'src/lib/components/evidence-editor/InspectorPanel.svelte',
  'src/lib/components/evidence-editor/CanvasEditor.svelte',
  'src/lib/components/evidence/EvidenceProcessor.svelte',
  'src/lib/components/ErrorBoundary.svelte',
  'src/lib/components/editor/ProfessionalEditor.svelte',
  'src/lib/components/Dialog.svelte',
  'src/lib/components/CaseInfoForm.svelte',
];

async function migrateFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    let content = await fs.readFile(fullPath, 'utf-8');
    let modified = false;

    // Convert export let to $props()
    if (content.includes('export let')) {
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const script = scriptMatch[1];
        const exportLetPattern = /export\s+let\s+(\w+)(?:\s*:\s*([^=]+))?\s*(?:=\s*([^;]+))?;/g;

        const props = [];
        let match;

        while ((match = exportLetPattern.exec(script)) !== null) {
          const [, name, type, defaultValue] = match;
          props.push({ name, type: type?.trim(), defaultValue: defaultValue?.trim() });
        }

        if (props.length > 0) {
          // Build interface
          let interfaceStr = '  interface Props {\n';
          props.forEach((prop) => {
            const typeStr = prop.type || 'any';
            interfaceStr += `    ${prop.name}?: ${typeStr};\n`;
          });
          interfaceStr += '  }\n\n';

          // Build destructuring
          const defaults = props
            .map((p) => (p.defaultValue ? `${p.name} = ${p.defaultValue}` : p.name))
            .join(', ');
          const destructuringStr = `  let { ${defaults} }: Props = $props();`;

          // Replace in script
          let newScript = script.replace(/export\s+let\s+[^;]+;/g, '');
          newScript = newScript.trim();
          if (newScript.length > 0) {
            newScript = `\n${interfaceStr}${destructuringStr}\n${newScript}\n`;
          } else {
            newScript = `\n${interfaceStr}${destructuringStr}\n`;
          }

          content = content.replace(
            scriptMatch[0],
            `<script${scriptMatch[0].match(/<script([^>]*)>/)[1] || ''}>${newScript}</script>`
          );
          modified = true;
        }
      }
    }

    // Convert on: to on
    const eventPatterns = [
      { from: /on:click=/g, to: 'onclick=' },
      { from: /on:submit=/g, to: 'onsubmit=' },
      { from: /on:change=/g, to: 'onchange=' },
      { from: /on:input=/g, to: 'oninput=' },
      { from: /on:keydown=/g, to: 'onkeydown=' },
      { from: /on:keyup=/g, to: 'onkeyup=' },
      { from: /on:focus=/g, to: 'onfocus=' },
      { from: /on:blur=/g, to: 'onblur=' },
      { from: /on:mouseenter=/g, to: 'onmouseenter=' },
      { from: /on:mouseleave=/g, to: 'onmouseleave=' },
      { from: /on:mouseover=/g, to: 'onmouseover=' },
      { from: /on:mouseout=/g, to: 'onmouseout=' },
      { from: /on:drop=/g, to: 'ondrop=' },
      { from: /on:dragover=/g, to: 'ondragover=' },
    ];

    for (const pattern of eventPatterns) {
      if (content.match(pattern.from)) {
        content = content.replace(pattern.from, pattern.to);
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(fullPath, content, 'utf-8');
      console.log(`✅ Migrated: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  Skipped: ${filePath} (no changes needed)`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error migrating ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('Starting Svelte 5 migration...\n');

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of filesToMigrate) {
    const result = await migrateFile(file);
    if (result === true) migrated++;
    else if (result === false) skipped++;
    else errors++;
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Migrated: ${migrated} files`);
  console.log(`   ⏭️  Skipped: ${skipped} files`);
  console.log(`   ❌ Errors: ${errors} files`);
  console.log(`   📁 Total: ${filesToMigrate.length} files`);
}

main().catch(console.error);
