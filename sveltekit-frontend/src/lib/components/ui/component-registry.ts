/** * Bits UI v2 Component Registry - Svelte, 5 Compatible * Complete mapping of available components with legal AI use cases */ export interface ComponentInfo {
 name: string; package: 'bits-ui' | 'enhanced-bits-ui' | 'both';
 svelte5Compatible: boolean; legalAIUseCase: string[];
 priority: 'essential' | 'important' | 'optional';
 implemented: boolean;
}
/** * Complete Bits UI v2 Component Array * Organized by category and prioritized for legal AI platform */ export const BITS_UI_COMPONENTS: ComponentInfo[] =
 [
 // === ESSENTIAL NAVIGATION & INTERACTION === { name: 'Button', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['case-actions', 'form-submission', 'evidence-upload', 'ai-queries'], priority: 'essential', implemented: true }, { name: 'Dialog', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-details', 'evidence-viewer', 'confirmation-dialogs'], priority: 'essential', implemented: false }, { name: 'Alert Dialog', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['case-deletion', 'evidence-removal', 'critical-actions'], priority: 'essential', implemented: false }, { name: 'Command', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['global-search', 'case-finder', 'ai-command-palette'], priority: 'essential', implemented: false }, { name: 'Navigation Menu', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['main-navigation', 'case-categories', 'user-menu'], priority: 'essential', implemented: false }, // === FORM & INPUT COMPONENTS === { name: 'Checkbox', package: 'both', svelte5Compatible: true, legalAIUseCase: ['evidence-selection', 'case-filters', 'permissions'], priority: 'essential', implemented: false }, { name: 'Select', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-status', 'priority-selection', 'user-roles'], priority: 'essential', implemented: false }, { name: 'Radio Group', package: 'both', svelte5Compatible: true, legalAIUseCase: ['evidence-type', 'case-category', 'search-filters'], priority: 'essential', implemented: false }, { name: 'Combobox', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-search', 'jurisdiction-selection', 'precedent-finder'], priority: 'essential', implemented: false }, { name: 'PIN Input', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['secure-access', 'evidence-unlock', 'admin-verification'], priority: 'important', implemented: false }, { name: 'Calendar', package: 'both', svelte5Compatible: true, legalAIUseCase: ['incident-dates', 'court-schedules', 'deadline-tracking'], priority: 'important', implemented: false }, { name: 'Time Field', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['incident-times', 'evidence-timestamps', 'hearing-schedules'], priority: 'important', implemented: false }, // === DATA DISPLAY & ORGANIZATION === { name: 'Accordion', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-sections', 'evidence-categories', 'legal-documents'], priority: 'important', implemented: false }, { name: 'Tabs', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-views', 'evidence-types', 'document-sections'], priority: 'important', implemented: false }, { name: 'Collapsible', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-details', 'evidence-metadata', 'ai-responses'], priority: 'important', implemented: false }, { name: 'Pagination', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-lists', 'evidence-galleries', 'search-results'], priority: 'important', implemented: false }, // === CONTEXTUAL & INTERACTIVE === { name: 'Context Menu', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['evidence-actions', 'case-operations', 'quick-access'], priority: 'important', implemented: false }, { name: 'Dropdown Menu', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-actions', 'user-menu', 'bulk-operations'], priority: 'important', implemented: false }, { name: 'Menubar', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['application-menu', 'case-toolbar', 'admin-controls'], priority: 'important', implemented: false }, { name: 'Popover', package: 'both', svelte5Compatible: true, legalAIUseCase: ['evidence-preview', 'case-summary', 'ai-insights'], priority: 'important', implemented: false }, { name: 'Tooltip', package: 'both', svelte5Compatible: true, legalAIUseCase: ['field-help', 'status-info', 'feature-guidance'], priority: 'important', implemented: false }, // === FEEDBACK & STATUS === { name: 'Progress', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-completion', 'document-processing', 'ai-analysis'], priority: 'important', implemented: false }, { name: 'Avatar', package: 'both', svelte5Compatible: true, legalAIUseCase: ['user-profile', 'case-assignee', 'team-members'], priority: 'optional', implemented: false }, { name: 'Label', package: 'both', svelte5Compatible: true, legalAIUseCase: ['form-labels', 'evidence-tags', 'case-metadata'], priority: 'important', implemented: false }, // === ADVANCED CONTROLS === { name: 'Slider', package: 'both', svelte5Compatible: true, legalAIUseCase: ['confidence-levels', 'date-ranges', 'ai-parameters'], priority: 'optional', implemented: false }, { name: 'Switch', package: 'both', svelte5Compatible: true, legalAIUseCase: ['feature-toggles', 'notifications', 'privacy-settings'], priority: 'optional', implemented: false }, { name: 'Toolbar', package: 'both', svelte5Compatible: true, legalAIUseCase: ['case-actions', 'document-tools', 'formatting-controls'], priority: 'optional', implemented: false }, { name: 'Aspect Ratio', package: 'bits-ui', svelte5Compatible: true, legalAIUseCase: ['evidence-images', 'document-preview', 'media-display'], priority: 'optional', implemented: false }
 ];
/** * Get components by priority level */ export const getComponentsByPriority = (
 priority: ComponentInfo['priority']
) => BITS_UI_COMPONENTS.filter((comp) => comp.priority === priority);
/** * Get unimplemented essential components */ export const getEssentialUnimplemented = () =>
 BITS_UI_COMPONENTS.filter((comp) => comp.priority === 'essential' && !comp.implemented);
/** * Get components by legal AI use case */ export const getComponentsByUseCase = (
 useCase: string
) =>
 BITS_UI_COMPONENTS.filter((item) =>
 item.legalAIUseCase.some((u) => u.toLowerCase() === useCase.toLowerCase())
 );
/** * Bits UI v2 Exclusive Components (not available in Melt UI) * These are the key differentiators that make Bits UI the better choice */ export const BITS_UI_EXCLUSIVE =
 BITS_UI_COMPONENTS.filter(
 (comp) => comp.package === 'bits-ui' || comp.package === 'enhanced-bits-ui'
 );
/** * Implementation Priority Queue * Essential components we should implement next */ export const IMPLEMENTATION_QUEUE =
 [
 'Dialog',
 'Alert Dialog',
 'Command',
 'Navigation Menu',
 'Checkbox',
 'Select',
 'Combobox',
 'Context Menu',
 'Accordion',
 'Tabs'];
/** * Legal AI Platform Component Recommendations */ export const LEGAL_AI_RECOMMENDATIONS = {
 caseManagement: ['Dialog', 'Tabs', 'Accordion', 'Progress', 'Context Menu'],
 evidenceHandling: ['Command', 'Combobox', 'Popover', 'Aspect Ratio', 'Pagination'],
 userInterface: ['Navigation Menu', 'Avatar', 'Tooltip', 'Alert Dialog'],
 dataEntry: ['Checkbox', 'Radio Group', 'Select', 'PIN Input', 'Calendar', 'Time Field'],
 workflow: ['Progress', 'Toolbar', 'Switch', 'Slider'],
};
export default BITS_UI_COMPONENTS;



