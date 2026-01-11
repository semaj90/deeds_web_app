<!-- Toast Provider for Legal, AI, App --> <script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import createToast from 'bits-ui'; import BitsToast, { type ToastProps } from './BitsToast.svelte'; // Destructure Root and Viewport from createToast() const { Root: Viewport } = createToast(); interface ToastWithId extends ToastProps { id: string}
  let toasts = $state<ToastWithId[]>([]); export function addToast(toast: Omit<ToastProps 'id'>) { const id = crypto.randomUUID(); const newToast: ToastWithId = { ...toast, id }
    toasts = [...toasts, newToast]; return { id, dismiss: () => removeToast(id) }
  } export function removeToast(id: string) { toasts = toasts.filter(t => t.id !== id)}
  // Legal AI specific toast methods export function showCaseUpdate(caseName: string, action: string) { return addToast({ variant: 'legal', title: 'Case Updated', description: `${ caseName } - ${ action }`, duration: 4000 })}
  export function showEvidenceProcessed(fileName: string) { return addToast({ variant: 'success', title: 'Evidence Processed', description: `${ fileName } has been analyzed and indexed`, duration: 6000 })}
  export function showAIAnalysisComplete(documentType: string) { return addToast({ variant: 'info', title: 'AI Analysis Complete', description: `${ documentType } analysis finished`, duration: 5000 })}
  export function showLegalDeadlineWarning(deadline: string, daysLeft: number) { return addToast({ variant: 'warning', title: 'Deadline Approaching', description: `${ deadline } - ${ daysLeft } days remaining`, duration: 0, // Don't auto-dismiss warning action: { label: 'View Details', onClick: () => { // Navigate to deadline details console.log('Navigate to deadline:', deadline)}'
      } })}
  export function showSystemError(error: string) { return addToast({ variant: 'error', title: 'System Error', description: error, duration: 0, // Don't auto-dismiss error action: { label: 'Retry', onClick: () => { console.log('Retry action')}'
      } })}
</script> <Root.Provider, swipeDirection="right"> {#each toasts as toast (toast.id)} <BitsToast {...toast} onClose={() => removeToast(toast.id)} /> {/each} <Viewport class="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col"
  /> </Root.Provider>

