const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Dialog compound component syntax issues...');

// List of files with Dialog. components that need fixing
const dialogFiles = [
  'src/lib/components/ai/AIAssistantChat.svelte',
  'src/lib/components/ai/AIChatWidget.svelte',
  'src/lib/components/ai/EnhancedAIChat.svelte',
  'src/lib/components/ai/EnhancedAIChatTest.svelte',
  'src/lib/components/ai/EnhancedDocumentUploader.svelte',
  'src/lib/components/ai/EnhancedVectorSearch.svelte',
  'src/lib/components/ai/FindModal.svelte',
  'src/lib/components/ai/LegalDocumentDrafting.svelte',
  'src/lib/components/ai/ollama-agent-shell.svelte',
  'src/lib/components/ai/PatternDetectionInterface.svelte',
  'src/lib/components/ai/RecommendationEngine.svelte',
  'src/lib/components/AIFabButton.svelte',
  'src/lib/components/auth/EnhancedAuthForm.svelte',
  'src/lib/components/auth/LoginModal.svelte',
  'src/lib/components/auth/RegisterModal.svelte',
  'src/lib/components/BitsDemo.svelte',
  'src/lib/components/EnhancedLegalAI.svelte',
  'src/lib/components/legal/LegalAnalysisDialog.svelte',
  'src/lib/components/LegalAnalysisDialog.svelte',
  'src/lib/components/modals/AISummaryModal.svelte',
  'src/lib/components/modals/CaseSummaryModal.svelte',
  'src/lib/components/modals/EvidenceAnalysisModal.svelte',
  'src/lib/components/modals/EvidenceModal.svelte',
  'src/lib/components/modals/EvidenceValidationModal.svelte',
  'src/lib/components/ui/BitsUIDemo.svelte',
  'src/lib/components/ui/dialog/BitsDialog.svelte',
  'src/lib/components/ui/dialog/DialogRoot.svelte',
  'src/lib/components/ui/dialog/DialogStandard.svelte',
  'src/lib/components/ui/enhanced-bits/Dialog.svelte',
  'src/lib/components/ui/MeltDialog.svelte',
  'src/lib/components/ui/modular-dialog/ModularDialog.svelte',
  'src/lib/components/ui/RetroModal.svelte',
  'src/lib/components/unified/UnifiedDialog.svelte',
  'src/lib/components/upload/EnhancedLegalUpload.svelte',
  'src/lib/components/yorha/YoRHaDialogManager.svelte',
];

// Common compound component fixes
const fixes = [
  // Dialog compound fixes
  { pattern: /<\/DialogDescription>/g, replacement: '</Dialog.Description>' },
  { pattern: /<DialogDescription>/g, replacement: '<Dialog.Description>' },
  { pattern: /<\/DialogHeader>/g, replacement: '</Dialog.Header>' },
  { pattern: /<DialogHeader>/g, replacement: '<Dialog.Header>' },
  { pattern: /<\/DialogTitle>/g, replacement: '</Dialog.Title>' },
  { pattern: /<DialogTitle>/g, replacement: '<Dialog.Title>' },
  { pattern: /<\/DialogContent>/g, replacement: '</Dialog.Content>' },
  { pattern: /<DialogContent>/g, replacement: '<Dialog.Content>' },
  { pattern: /<\/DialogFooter>/g, replacement: '</Dialog.Footer>' },
  { pattern: /<DialogFooter>/g, replacement: '<Dialog.Footer>' },
  { pattern: /<\/DialogTrigger>/g, replacement: '</Dialog.Trigger>' },
  { pattern: /<DialogTrigger>/g, replacement: '<Dialog.Trigger>' },
  { pattern: /<\/DialogRoot>/g, replacement: '</Dialog.Root>' },
  { pattern: /<DialogRoot>/g, replacement: '<Dialog.Root>' },
  { pattern: /<\/Dialog>/g, replacement: '</Dialog.Root>' },
  { pattern: /<Dialog([^.>])/g, replacement: '<Dialog.Root$1' },

  // Card compound fixes (from earlier DetectiveBoard fix)
  { pattern: /<\/div\.Root>/g, replacement: '</Card.Root>' },
  { pattern: /<div\.Root>/g, replacement: '<Card.Root>' },
  { pattern: /<\/div\.Header>/g, replacement: '</Card.Header>' },
  { pattern: /<div\.Header>/g, replacement: '<Card.Header>' },
  { pattern: /<\/div\.Content>/g, replacement: '</Card.Content>' },
  { pattern: /<div\.Content>/g, replacement: '<Card.Content>' },

  // Sheet compound fixes
  { pattern: /<\/SheetContent>/g, replacement: '</Sheet.Content>' },
  { pattern: /<SheetContent>/g, replacement: '<Sheet.Content>' },
  { pattern: /<\/SheetHeader>/g, replacement: '</Sheet.Header>' },
  { pattern: /<SheetHeader>/g, replacement: '<Sheet.Header>' },
  { pattern: /<\/SheetTitle>/g, replacement: '</Sheet.Title>' },
  { pattern: /<SheetTitle>/g, replacement: '<Sheet.Title>' },
];

let fixedCount = 0;
let errorsFixed = 0;

for (const file of dialogFiles) {
  const filePath = path.resolve(__dirname, file);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${file}`);
    continue;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let fileErrors = 0;

    // Apply all fixes to this file
    for (const fix of fixes) {
      const originalContent = content;
      content = content.replace(fix.pattern, fix.replacement);
      if (content !== originalContent) {
        modified = true;
        fileErrors++;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      fixedCount++;
      errorsFixed += fileErrors;
      console.log(`  ✓ Fixed ${fileErrors} compound syntax issues in: ${file}`);
    } else {
      console.log(`  ○ No fixes needed: ${file}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed to fix: ${file} - ${error.message}`);
  }
}

console.log(`\n🎉 Dialog syntax fix complete!`);
console.log(`✅ Fixed: ${fixedCount} files`);
console.log(`🔧 Total syntax errors fixed: ${errorsFixed}`);
console.log(`📊 This should eliminate compound component syntax errors`);
