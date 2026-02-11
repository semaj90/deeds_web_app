const fs = require('fs');
const path = require('path');

// Fix broken IIFE pattern in $effect blocks
// Pattern: });(); should be })();
const files = [
  'src/lib/components/ai/AIServiceStatus.svelte',
  'src/lib/components/ai/EvidenceCanvas.svelte',
  'src/lib/components/ai/IngestAIAssistant.svelte',
  'src/lib/components/ai/SoraGraphVisualization.svelte',
  'src/lib/components/ai/XStatePhase8Integration.svelte',
  'src/lib/components/canvas/EnhancedEvidenceCanvas.svelte',
  'src/lib/components/canvas/EnhancedLegalCanvas.svelte',
  'src/lib/components/canvas/EvidenceCanvasEditor.svelte',
  'src/lib/components/canvas/WebGPUCanvas.svelte',
  'src/lib/components/case/CaseDetailPage.svelte',
  'src/lib/components/evidence/Enhanced3DEvidenceBoard.svelte',
  'src/lib/components/evidence/EvidenceUploadPreview.svelte',
  'src/lib/components/laws/StatuteColumn.svelte',
  'src/lib/components/legal-ai/CaseStatuteLinks.svelte',
  'src/lib/components/legal-ai/CollectionDetail.svelte',
  'src/lib/evidence-canvas/evidence-canvas-core.svelte',
  'src/lib/evidence-canvas/evidence-canvas.svelte',
  'src/routes/(app)/command-center/+page.svelte',
];

const base = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend';
let totalFixed = 0;

for (const file of files) {
  const fullPath = path.join(base, file);
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    const original = content;
    
    // Fix: });(); -> })();
    content = content.replace(/\}\);?\(\);/g, '})();');
    
    // Also fix: });(); return () => { ... pattern (WebGPUCanvas)
    // This is already handled by the above regex
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content, 'utf8');
      totalFixed++;
      console.log('Fixed: ' + file);
    } else {
      console.log('No change: ' + file);
    }
  } catch (err) {
    console.log('ERROR reading ' + file + ': ' + err.message);
  }
}

console.log('\nTotal files fixed: ' + totalFixed);
