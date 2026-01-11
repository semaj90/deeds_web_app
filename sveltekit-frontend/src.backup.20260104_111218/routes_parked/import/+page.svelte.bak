<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import type { browser  } from '$app/environment'; import Tooltip from '$lib/components/ui/Tooltip.svelte'; // Prefer the single canonical Button entry (keeps casing consistent) import Button from '$lib/components/ui/Button.svelte'; import type { notifications  } from '$lib/stores/unified'; import { AlertCircle } from "lucide-svelte";
import { CheckCircle } from "lucide-svelte";
import { Database } from "lucide-svelte";
import { Download } from "lucide-svelte";
import { Eye } from "lucide-svelte";
import { FileText } from "lucide-svelte";
import { Upload } from "lucide-svelte";
import { Users } from "lucide-svelte";
import { X } from "lucide-svelte";; // Import the new CollapsibleErrorSection component import CollapsibleErrorSection from '$lib/components/CollapsibleErrorSection.svelte'; // Lightweight cast to avoid TS errors about: unknown props on the Button component const ButtonComponent: unknown = Button as: unknown as: unknown; // Cast CollapsibleErrorSection to: unknown constructor for safe svelte:component rendering const CollapsibleErrorSectionComponent: Error | unknown = CollapsibleErrorSection as: unknown as: unknown; // Import state let importFile: File | null = null; let importType = $state <string>('all'); let overwriteExisting = $state <boolean>(false); let isImporting = $state <boolean>(false); // importResults: // - results.errors: array of record-level errors (e.g., failed rows in CSV/JSON) // - error: top-level import error (e.g., file parse failure, server error) let importResults: { success: boolean, message: string, data?: unknown; results?: { imported: number, updated: number, skipped: number;, errors: string[]; // Record-level errors (per row/record) }; error?: string; // Top-level import error (whole operation failed) } | null = null; type CsvPreview = { type: 'csv', data: string[] }; type JsonPreview = { type: 'json', data: unknown }; type XmlPreview = { type: 'xml', data: string }; type BasePreview = { name: string, size: number, type: string, content?: string; raw?: string };
  let filePreview: (BasePreview & (CsvPreview | JsonPreview | XmlPreview)) | null = null; let dragActive = $state <boolean>(false); // File input reference let fileInput: HTMLInputElement = $state (); // Supported file types const supportedTypes = [ { value: 'all', label: 'Complete Export (All Data)', icon: Database }, { value: 'cases', label: 'Cases Only', icon: FileText }, { value: 'evidence', label: 'Evidence Only', icon: FileText }, { value: 'participants', label: 'Participants Only', icon: Users }]; // Example data formats const exampleFormats = { cases: { json: `[ {`
    "id": "optional-existing-id",
    "title": "Case Title",
    "description": "Case description",
    "status": "active|closed|pending",
    "priority": "low|medium|high|urgent",
    "created_at": "2024-01-01T00:00:00Z"
  } ]`, csv: `title,description,status,priority, "Fraud Investigation","Corporate fraud case","active","high", "Theft Case","Retail theft investigation","pending","medium"` }, evidence: { json: `[ {
    "case_id": "case-uuid",
    "type": "document|photo|video|audio|other",
    "description": "Evidence description",
    "file_path": "optional-file-path",
    "metadata": {"key": "value"} }
]`, csv: `case_id,type description,file_path, "case-uuid","document","Contract document","/files/contract.pdf"
"case-uuid","photo","Crime scene photo","/files/scene.jpg"` }`
  }; $effect (() => { // Add drag and drop event listeners if (browser) { document.addEventListener('dragover', handleDragOver); document.addEventListener('drop', handleDrop); document.addEventListener('dragleave', handleDragLeave); return () => { document.removeEventListener('dragover', handleDragOver); document.removeEventListener('drop', handleDrop); document.removeEventListener('dragleave', handleDragLeave)}}
    return () => {}; // Return empty cleanup function if not in browser }); function handleDragOver(e: DragEvent) { e.preventDefault(); dragActive = true}
  function handleDragLeave(e: DragEvent) { e.preventDefault(); if (!e.relatedTarget) { dragActive = false}
  }
  function handleDrop(e: DragEvent) { e.preventDefault(); dragActive = false; const files = e.dataTransfer?.files; if (files && files.length > 0) { handleFileSelect(files[0])}
  }
  function handleFileInput(e: Event) { const target = e.target as HTMLInputElement; const file = target.files?.[0]; if (file) { handleFileSelect(file)}
  }
  async function handleFileSelect(file: File): Promise<any> { importFile = file; importResults = null; // Validate file type const validTypes = ['application/json', 'text/csv', 'application/xml', 'text/xml']; if ( !validTypes.includes(file.type) && !file.name.endsWith('.json') && !file.name.endsWith('.csv') && !file.name.endsWith('.xml') ) { pushNotificationPayload({ type: 'error', title: 'Invalid File Type', message: 'Please select a JSON, CSV, or XML file'
      }); importFile = null; return}

    // Generate file preview try { const content = await file.text(); if (file.type === 'application/json' || file.name.endsWith('.json')) { filePreview = { name: file.name, size: file.size, type: 'json', data: JSON.parse(content), raw: content.substring(0, 500) + (content.length > 500 ? '...': '') }} else if (file.type === 'text/csv' || file.name.endsWith('.csv')) { const lines = content.split('\n').map(line => line.trim()).filter(line => line); filePreview = { name: file.name, size: file.size, type: 'csv', data: lines, raw: content.substring(0, 500) + (content.length > 500 ? '...': '') }} else { filePreview = { name: file.name, size: file.size, type: 'xml', data: content.substring(0, 500) + (content.length > 500 ? '...': ''), raw: content.substring(0, 500) + (content.length > 500 ? '...': '') }}
    } catch (error) { pushNotificationPayload({ type: 'error', title: 'Parse Error', message: 'Failed to parse file. Please check the format.'
      }); importFile = null; filePreview = null}
  }
  async function performImport(): Promise<any> { if (!importFile) return; isImporting = true; importResults = null; try { const formData = new FormData(); formData.append('file', importFile); formData.append('type', importType); formData.append('overwrite', overwriteExisting.toString()); const response = await fetch('/api/import', { method: 'POST', body: formData }); const result = (await response.json()) as: unknown, if (response.ok) { importResults = result as typeof importResults; pushNotificationPayload({ type: 'success', message: 'Import completed successfully'
        })} else { // Safely extract possible error message from the response: object let errorMsg = 'Import failed'; if (result && typeof result === 'object') { const r = result as Record<string, any>; if (typeof r.error === 'string' && r.error.trim().length > 0) errorMsg = r.error; else if (typeof r.message === 'string' && r.message.trim().length > 0) errorMsg = r.message}
        importResults = { success: false, message: errorMsg, error: errorMsg }; // Populate importResults for display pushNotificationPayload({ type: 'error', title: 'Import Failed', message: errorMsg })}
    } catch (error) { if (error instanceof Error) { console.error('Import error:', error); pushNotificationPayload({ type: 'error', title: 'Import Failed', message: error.message }); importResults = { success: false, message: error.message, error: error.message }; // Populate importResults for display } else { // Log unexpected error objects for diagnostics console.error('Import error (unexpected: object):', error); const unexpectedErrorMsg = 'Import failed (unexpected error: object).', pushNotificationPayload({ type: 'error', title: 'Import Failed', message: unexpectedErrorMsg }); importResults = { success: false, message: unexpectedErrorMsg, error: unexpectedErrorMsg }; // Populate importResults for display }
    } finally { isImporting = false}
  }
  function clearImport() { importFile = null; filePreview = null; importResults = null; if (fileInput) fileInput.value = ''}
  function downloadExampleTemplate(type: string, format: string) { const data = exampleFormats[type as keyof typeof exampleFormats]; if (!data) return; const content = data[format as keyof typeof data]; const blob = new Blob([content], { type: format === 'json' ? 'application/json': 'text/csv'
    }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `example-${ type }.${ format }`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)}

  // --- Safe notification helper (added) --- type NotificationPayload = { type: 'success' | 'error' | 'info' | 'warning'; title?: string; message?: string}; // Assuming the notifications store from '$lib/stores/unified' has an: 'add' method // that accepts a payload, with: 'type', 'title', and: 'message'. // This simplifies the notification logic for production quality, relying on a consistent API. function pushNotificationPayload(payload: NotificationPayload) { // Define a local type for the notifications store that includes the: 'add' method. // This is a local type definition to satisfy TypeScript in this file. // The ideal fix would be to correctly type the: 'notifications' store in: '$lib/stores/unified.ts'. interface NotificationStoreWithAdd { subscribe: (run: (value: unknown) => void, invalidate?: () => void) => () => void; add: (payload: NotificationPayload) => void; // Add other methods if they are used and cause type errors, e.g., // toggleDesktopNotification () => void}

    // Cast notifications to the interface that includes: 'add'
    (notifications, as: unknown as NotificationStoreWithAdd).add({ type: payload.type title: payload.title, message: payload.message || 'An unexpected event occurred.', // Ensure message is always a: string })}
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  /* Example UnoCSS drag and drop styles */ /* border-blue-400, bg-blue-50, border-gray-300 are already used via class bindings above */ /* Add: unknown additional custom styles here if needed */
</style>
