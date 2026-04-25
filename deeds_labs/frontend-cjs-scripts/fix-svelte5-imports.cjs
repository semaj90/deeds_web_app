#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const files = [
  'src/lib/components/AccessibilityPanel.svelte',
  'src/lib/components/ai/AgentOrchestrator.svelte',
  'src/lib/components/ai/AIAssistantButton.svelte',
  'src/lib/components/ai/AIAssistantChat.svelte',
  'src/lib/components/ai/AIButton.svelte',
  'src/lib/components/ai/AIButtonPortal.svelte',
  'src/lib/components/ai/AIChatInput.svelte',
  'src/lib/components/ai/AIChatMessage.svelte',
  'src/lib/components/ai/AIChatWidget.svelte',
  'src/lib/components/ai/AISummaryButton.svelte',
  'src/lib/components/ai/AIToolbar.svelte',
  'src/lib/components/ai/AskAI.svelte',
  'src/lib/components/ai/ChatInterface.svelte',
  'src/lib/components/ai/ChatMessage.svelte',
  'src/lib/components/ai/ComprehensiveSummaryEngine.svelte',
  'src/lib/components/ai/EnhancedAIAssistant.new.svelte',
  'src/lib/components/ai/EnhancedAIAssistant.simple.svelte',
  'src/lib/components/ai/EnhancedAIChat.svelte',
  'src/lib/components/ai/EnhancedAIChatTest.svelte',
  'src/lib/components/ai/EnhancedDocumentUploader.svelte',
  'src/lib/components/ai/EnhancedFileUpload.svelte',
  'src/lib/components/ai/EnhancedInlineEditor.svelte',
  'src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte',
  'src/lib/components/ai/EnhancedVectorSearch.svelte',
  'src/lib/components/ai/GamingAIButton.svelte',
  'src/lib/components/ai/GamingAIInterface.svelte',
  'src/lib/components/ai/LLMProviderSelector.svelte',
  'src/lib/components/ai/LLMSelector.svelte',
  'src/lib/components/ai/NierAIAssistant.svelte',
  'src/lib/components/ai/ollama-agent-shell.svelte',
  'src/lib/components/ai/Phase8Demo.svelte',
  'src/lib/components/ai/SOMVisualization.svelte',
  'src/lib/components/ai/ThinkingStyleToggle.svelte',
  'src/lib/components/ai/TypewriterResponse.svelte',
  'src/lib/components/ai/webgpu-viewer.svelte',
  'src/lib/components/ai/XStatePhase8Integration.svelte',
  'src/lib/components/ai/YorhaAIAssistant.svelte',
  'src/lib/components/AIAnalysisForm.svelte',
  'src/lib/components/AttractivenessMetr.svelte',
  'src/lib/components/auth/AuthForm.svelte',
  'src/lib/components/auth/EnhancedAuthForm.svelte',
  'src/lib/components/auth/RegisterForm.simple.svelte',
  'src/lib/components/Avatar.svelte',
  'src/lib/components/BitsDemo.svelte',
  'src/lib/components/canvas/AdvancedEditor.svelte',
  'src/lib/components/canvas/CitationSidebar.svelte',
  'src/lib/components/canvas/EvidenceNode.svelte',
  'src/lib/components/canvas/FabricCanvas.svelte',
  'src/lib/components/canvas/POINode.svelte',
  'src/lib/components/canvas/ReportNode.svelte',
  'src/lib/components/CanvasEditor.svelte',
  'src/lib/components/CaseInfoForm.svelte',
  'src/lib/components/chat/ChatMessage.svelte',
  'src/lib/components/copilot/AutonomousEngineeringDemo.svelte',
  'src/lib/components/detective/ContextMenu.svelte',
  'src/lib/components/Dialog.svelte',
  'src/lib/components/DocumentUploadForm.svelte',
  'src/lib/components/EditableCanvasSystem.svelte',
  'src/lib/components/editor/LegalDocumentEditor.svelte',
  'src/lib/components/editor/ProfessionalEditor.svelte',
  'src/lib/components/editor/TiptapWithAIAssistant.svelte',
  'src/lib/components/editor/WysiwygEditor.svelte',
  'src/lib/components/EnhancedAISearch.svelte',
  'src/lib/components/ErrorBoundary.svelte',
  'src/lib/components/evidence-editor/CanvasEditor.svelte',
  'src/lib/components/evidence-editor/InspectorPanel.svelte',
  'src/lib/components/EvidenceAnalysisForm.svelte',
  'src/lib/components/EvidenceGrid.svelte',
  'src/lib/components/EvidencePanel.svelte',
  'src/lib/components/FileUploadSection.svelte',
  'src/lib/components/forms/CaseForm.svelte',
  'src/lib/components/forms/EnhancedCaseForm.svelte',
  'src/lib/components/forms/EnhancedDocumentUploadForm.svelte',
  'src/lib/components/forms/EnhancedFormInput.svelte',
  'src/lib/components/forms/EvidenceForm.svelte',
  'src/lib/components/forms/SmartDocumentForm.svelte',
  'src/lib/components/Header.svelte',
  'src/lib/components/HeadlessDemo.svelte',
  'src/lib/components/InfiniteScrollList.svelte',
  'src/lib/components/keyboard/KeyboardShortcuts.svelte',
  'src/lib/components/layout/MasonryGrid.svelte',
  'src/lib/components/layout/Sidebar.svelte',
  'src/lib/components/legal/CaseTimeline.svelte',
  'src/lib/components/legal/ChainOfCustodyTracker.svelte',
  'src/lib/components/legal/CriminalProfile.svelte',
  'src/lib/components/legal/LegalPrecedentCard.svelte',
  'src/lib/components/LegalAnalysisDialog.svelte',
  'src/lib/components/LegalCaseManager.svelte',
  'src/lib/components/MemoryMonitor.svelte',
  'src/lib/components/modals/CaseSummaryModal.svelte',
  'src/lib/components/modals/EvidenceAnalysisModal.svelte',
  'src/lib/components/modals/EvidenceModal.svelte',
  'src/lib/components/modals/EvidenceValidationModal.svelte',
  'src/lib/components/NierHeader.svelte',
  'src/lib/components/NierNavigation.svelte',
  'src/lib/components/NierRichTextEditor.svelte',
  'src/lib/components/notifications/DocumentUpdateNotifications.svelte',
  'src/lib/components/OllamaChatInterface.svelte',
  'src/lib/components/ProgressIndicator.svelte',
  'src/lib/components/prosecutor/EnhancedAIChatAssistant.svelte',
  'src/lib/components/prosecutor/EvidenceUploadComponent.svelte',
  'src/lib/components/RealtimeRAG.svelte',
  'src/lib/components/recommendations/DidYouMeanSuggestions.svelte',
  'src/lib/components/recommendations/FOAFModal.svelte',
  'src/lib/components/ReportEditor.svelte',
  'src/lib/components/ReviewSubmitForm.svelte',
  'src/lib/components/scoring/CaseAIScoringCard.svelte',
  'src/lib/components/search/EnhancedFuseSearch.svelte',
  'src/lib/components/search/FuseLegalSearch.svelte',
  'src/lib/components/subcomponents/ProgressIndicator.svelte',
  'src/lib/components/TokenUsageManager.svelte',
  'src/lib/components/Typewriter.svelte',
  'src/lib/components/ui/AIDropdown.svelte',
  'src/lib/components/ui/alert/AlertDescription.svelte',
  'src/lib/components/ui/alert/AlertTitle.svelte',
  'src/lib/components/ui/CardContent.svelte',
  'src/lib/components/ui/CardFooter.svelte',
  'src/lib/components/ui/CardTitle.svelte',
  'src/lib/components/ui/checkbox/Checkbox.svelte',
  'src/lib/components/ui/combobox/BitsCombobox.svelte',
  'src/lib/components/ui/CommandPalette.svelte',
  'src/lib/components/ui/context-menu/context-menu-item.svelte',
  'src/lib/components/ui/context-menu/context-menu-root.svelte',
  'src/lib/components/ui/context-menu/context-menu-trigger.svelte',
  'src/lib/components/ui/context-menu/ContextMenuContent.svelte',
  'src/lib/components/ui/context-menu/ContextMenuItem.svelte',
  'src/lib/components/ui/context-menu/ContextMenuRoot.svelte',
  'src/lib/components/ui/context-menu/ContextMenuStandard.svelte',
  'src/lib/components/ui/context-menu/ContextMenuTrigger.svelte',
  'src/lib/components/ui/ContextMenuContent.svelte',
  'src/lib/components/ui/ContextMenuItem.svelte',
  'src/lib/components/ui/ContextMenuSeparator.svelte',
  'src/lib/components/ui/ContextMenuTrigger.svelte',
  'src/lib/components/ui/data-table/BitsDataTable.svelte',
  'src/lib/components/ui/DataGrid.svelte',
  'src/lib/components/ui/date-picker/BitsDatePicker.svelte',
  'src/lib/components/ui/dialog/DialogStandard.svelte',
  'src/lib/components/ui/dropdown-menu/DropdownMenuRoot.svelte',
  'src/lib/components/ui/enhanced/Card.svelte',
  'src/lib/components/ui/enhanced/Input.svelte',
  'src/lib/components/ui/enhanced-bits/AIChatMessage.svelte',
  'src/lib/components/ui/enhanced-bits/AIRecommendations.svelte',
  'src/lib/components/ui/enhanced-bits/AISearchBar.svelte',
  'src/lib/components/ui/enhanced-bits/Button.svelte',
  'src/lib/components/ui/enhanced-bits/Card.svelte',
  'src/lib/components/ui/enhanced-bits/CardContent.svelte',
  'src/lib/components/ui/enhanced-bits/CardDescription.svelte',
  'src/lib/components/ui/enhanced-bits/CardFooter.svelte',
  'src/lib/components/ui/enhanced-bits/CardHeader.svelte',
  'src/lib/components/ui/enhanced-bits/CardTitle.svelte',
  'src/lib/components/ui/enhanced-bits/ChatMessage.svelte',
  'src/lib/components/ui/enhanced-bits/Dialog.svelte',
  'src/lib/components/ui/enhanced-bits/DialogWrapper.svelte',
  'src/lib/components/ui/enhanced-bits/GoldenRatioLoader.svelte',
  'src/lib/components/ui/enhanced-bits/Input.svelte',
  'src/lib/components/ui/enhanced-bits/Select.svelte',
  'src/lib/components/ui/ExpandGrid.svelte',
  'src/lib/components/ui/Form.svelte',
  'src/lib/components/ui/forms/FormStandard.svelte',
  'src/lib/components/ui/gaming/modals/RetroRecommendationModal.svelte',
  'src/lib/components/ui/gaming/n64/N64EvolutionLoader.svelte',
  'src/lib/components/ui/gaming/n64/N64LoadingRing.svelte',
  'src/lib/components/ui/gaming/n64/N64ProgressBar.svelte',
  'src/lib/components/ui/gaming/RecommendationContainer.svelte',
  'src/lib/components/ui/GoldenLayout.svelte',
  'src/lib/components/ui/grid/Grid.svelte',
  'src/lib/components/ui/grid/GridItem.svelte',
  'src/lib/components/ui/input/BitsInput.svelte',
  'src/lib/components/ui/label/LabelCompat.svelte',
  'src/lib/components/ui/layout/GoldenRatioGrid.svelte',
  'src/lib/components/ui/MarkdownRenderer.svelte',
  'src/lib/components/ui/Modal.svelte',
  'src/lib/components/ui/modern/ModernButton.svelte',
  'src/lib/components/ui/modern/ModernCard.svelte',
  'src/lib/components/ui/modern/ModernDialog.svelte',
  'src/lib/components/ui/progress/Progress.svelte',
  'src/lib/components/ui/RichTextEditor.svelte',
  'src/lib/components/ui/scroll-area/ScrollArea.svelte',
  'src/lib/components/ui/scrollarea/ScrollArea.svelte',
  'src/lib/components/ui/select/BitsSelect.svelte',
  'src/lib/components/ui/select/Select.svelte',
  'src/lib/components/ui/select/SelectContent.svelte',
  'src/lib/components/ui/select/SelectGroup.svelte',
  'src/lib/components/ui/select/SelectItem.svelte',
  'src/lib/components/ui/select/SelectLabel.svelte',
  'src/lib/components/ui/select/SelectStandard.svelte',
  'src/lib/components/ui/select/SelectTrigger.svelte',
  'src/lib/components/ui/select/SelectValue.svelte',
  'src/lib/components/ui/slider/Slider.svelte',
  'src/lib/components/ui/SmartTextarea.svelte',
  'src/lib/components/ui/switch/Switch.svelte',
  'src/lib/components/ui/tabs/Tabs.svelte',
  'src/lib/components/ui/tabs/TabsContent.svelte',
  'src/lib/components/ui/tabs/TabsList.svelte',
  'src/lib/components/ui/tabs/TabsTrigger.svelte',
  'src/lib/components/ui/toast/BitsToast.svelte',
  'src/lib/components/ui/tooltip/BitsTooltip.svelte',
  'src/lib/components/ui/tooltip/TooltipProvider.svelte',
  'src/lib/components/ui/Tooltip.svelte',
  'src/lib/components/upload/FileUploadForm.svelte',
  'src/lib/components/UploadArea.svelte',
  'src/lib/components/UploadProgress.svelte',
  'src/lib/components/UserDropdown.svelte',
  'src/lib/components/vector/VectorRecommendationsWidget.svelte',
  'src/lib/components/vector/VectorSearchWidget.svelte',
  'src/lib/components/webgpu/WebGPUProcessor.svelte',
  'src/lib/components/WebGPUProcessor.svelte',
  'src/lib/components/yorha/EnhancedYoRHaAIAssistant.svelte',
  'src/lib/vendor/bits-ui-fallback/ComponentFallback.svelte',
  'src/routes/dev/copilot-optimizer/+page.svelte',
  'src/routes/interactive-canvas/+page.svelte',
  'src/routes/recommendations-demo/+page.svelte',
  'src/routes/RoutesList.svelte',
  'src/routes/semantic-search-demo/+page.svelte',
  'src/routes/upload/+page.svelte',
  'src/routes/yorha/dashboard/+page.svelte',
];

function fixSvelteImports(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ File not found: ${filePath}`);
      return false;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    // Pattern to match invalid Svelte 5 rune imports
    const patterns = [
      /import\s*\{\s*\$props\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$state\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$state,?\s*\$props\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$derived\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$derived,?\s*\$props\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$effect,?\s*\$props\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$state,?\s*\$derived\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$state,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$derived,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$props,?\s*\$state,?\s*\$derived,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      // More permutations
      /import\s*\{\s*\$state,?\s*\$props,?\s*\$derived\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$state,?\s*\$props,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$derived,?\s*\$props,?\s*\$state\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$derived,?\s*\$props,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$effect,?\s*\$props,?\s*\$state\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$effect,?\s*\$props,?\s*\$derived\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      // Even more complex patterns
      /import\s*\{\s*\$state,?\s*\$derived,?\s*\$props,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$derived,?\s*\$state,?\s*\$props,?\s*\$effect\s*\}\s*from\s*['"']svelte['"];?\s*/g,
      /import\s*\{\s*\$effect,?\s*\$state,?\s*\$derived,?\s*\$props\s*\}\s*from\s*['"']svelte['"];?\s*/g,
    ];

    let newContent = content;
    let hasChanges = false;

    // Remove all patterns
    patterns.forEach((pattern) => {
      const matches = newContent.match(pattern);
      if (matches) {
        hasChanges = true;
        newContent = newContent.replace(pattern, '');
        console.log(`✅ Removed invalid import from ${filePath}`);
      }
    });

    // Also handle mixed imports that include other valid imports
    // For example: import { $props, onMount } from 'svelte'; -> import { onMount } from 'svelte';
    const mixedImportPattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"']svelte['"];?/g;
    newContent = newContent.replace(mixedImportPattern, (match, imports) => {
      const validImports = imports
        .split(',')
        .map((imp) => imp.trim())
        .filter(
          (imp) =>
            !imp.startsWith('$props') &&
            !imp.startsWith('$state') &&
            !imp.startsWith('$derived') &&
            !imp.startsWith('$effect')
        )
        .filter((imp) => imp.length > 0);

      if (validImports.length === 0) {
        hasChanges = true;
        console.log(`✅ Removed entire import line from ${filePath}`);
        return '';
      } else if (validImports.length !== imports.split(',').length) {
        hasChanges = true;
        console.log(`✅ Cleaned mixed import from ${filePath}`);
        return `import { ${validImports.join(', ')} } from 'svelte';`;
      }
      return match;
    });

    // Clean up any double empty lines that might result
    newContent = newContent.replace(/\n\s*\n\s*\n/g, '\n\n');

    if (hasChanges) {
      fs.writeFileSync(fullPath, newContent);
      console.log(`✅ Fixed ${filePath}`);
      return true;
    } else {
      console.log(`⚪ No changes needed for ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

let fixedCount = 0;
let totalFiles = files.length;

console.log(`🚀 Starting Svelte 5 import fixes for ${totalFiles} files...\n`);

files.forEach((filePath) => {
  if (fixSvelteImports(filePath)) {
    fixedCount++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Total files: ${totalFiles}`);
console.log(`   Files fixed: ${fixedCount}`);
console.log(`   Files skipped: ${totalFiles - fixedCount}`);
console.log(`\n✅ Svelte 5 import fixes complete!`);
