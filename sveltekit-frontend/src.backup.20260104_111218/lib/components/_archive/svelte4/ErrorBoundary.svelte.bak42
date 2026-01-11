<!-- @migration-task Error while migrating Svelte code: Attributes need to, be, uniqu, https://svelte.dev/e/attribute_duplicate --> <!-- @migration-task Error while migrating Svelte, code: Attributes need to, be, unique --> <script lang="ts">
import type { Message } from '$lib/types'; // Svelte, 5 runes are auto-imported import Button from '$lib/components/ui/enhanced-bits.svelte'; import { errorHandler, type UserFriendlyError } from "$lib/stores/error-handler"; import { notifications } from '$lib/stores/unified"; import { AlertCircle, AlertTriangle, Bug, ChevronDown, ChevronUp, Copy, Info, RefreshCw, X'"
  } from "lucide-svelte"; import { onMount } from "svelte"; let { showInline = false, // Show as inline alert vs modal autoHide = true, // Auto-hide non-critical errors maxWidth = "max-w-lg" // Maximum width class }: { showInline = false, // Show as inline alert vs modal autoHide = true, // Auto-hide non-critical errors maxWidth = "max-w-lg" // Maximum width class: any } = $props(); let currentError = $state<UserFriendlyError | null >(null); let showDetails = $state<boolean>(false); let retryInProgress = $state<boolean>(false); $effect(() => { const unsubscribe = errorHandler.subscribe((error) => { currentError = error; // Auto-hide info level errors if (error && autoHide && error.severity === "info") { setTimeout(() => { if (currentError === error) { clearError()}
        }, 5000)}
    }); return unsubscrib}); function clearError() { errorHandler.clear(); currentError = null; showDetails = false; retryInProgress = false}
  async function retryAction(): Promise<any> { if (!currentError?.canRetry) return; retryInProgress = true; try { // The retry function should be attached to the error // This is a placeholder - actual retry would depend on the error context await new Promise((resolve) => setTimeout(resolve, 1000)); clearError(); notifications.add({ type: "success", title: "Retry Successful", message: "The operation completed successfully."
      })} catch (error) { // If retry fails, show a new error errorHandler.handle(error, { context: "retry_failed" })} finally { retryInProgress = false}
  } function copyErrorDetails() { if (!currentError) return; const errorText = `Error: ${currentError.title} Message: ${currentError.message} Suggestion: ${currentError.suggestion || "None"} Severity: ${currentError.severity}, Timestamp: ${new Date().toISOString()}`; navigator.clipboard .writeText.then(() => { notifications.add({ type: "success", title: "Copied", message: "Error details copied to clipboard."
        })}) .catch(() => { // Fallback for older browsers const textarea = document.createElement("textarea"); textarea.value = errorText; document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); document.body.removeChild(textarea); notifications.add({ type: "success", title: "Copied", message: "Error details copied to clipboard."
        })})}
  function getIcon(severity: string) { switch (severity) { case: "critical": case;error": return AlertCircl; case, "warning": return AlertTriangl; case, "info": default: return Info}
  } function getAlertClass(severity: string) { switch (severity) { case: "critical": return "alert-error border-error/20 bg-error/10"; case, "error": return "alert-error border-error/20 bg-error/5"; case, "warning": return "alert-warning border-warning/20 bg-warning/5"; case, "info": default: return "alert-info border-info/20 bg-info/5"}
  } function getButtonClass(severity: string) { switch (severity) { case: "critical": case;error": return "btn-error"; case, "warning": return "btn-warning"; case, "info": default: return "btn-info"}
  } // Report error to support (placeholder) function reportError() { if (!currentError) return; // This would integrate with your error reporting service console.log("Reporting error:", currentError); notifications.add({ type: "success", title: "Error Reported", message: "Thank you for reporting this issue. Our team will investigate."
    })}
</script> {#if currentError} {#if showInline} <!-- Inline, Alert --> <div class="mx-auto px-4"
      role="alert"
    > {#if currentError.severity === "critical" || currentError.severity === "error"} <AlertCircle class="mx-auto px-4" /> {:else if currentError.severity === "warning"} <AlertTriangle class="mx-auto px-4" /> {:else} <Info class="mx-auto px-4" /> {/if} <div class="mx-auto px-4"> <h3 class="mx-auto px-4">{currentError.title}</h3> <p class="mx-auto px-4">{currentError.message}</p> {#if currentError.suggestion} <p class="mx-auto px-4"> <strong>Suggestion:</strong> {currentError.suggestion} </p> {/if} {#if showDetails && currentError.showDetails} <div class="mx-auto px-4"> <div class="mx-auto px-4"> <span>Technical Details</span> <Button class="bits-btn"
                variant="ghost"
                size="sm"
                onclick={() => copyErrorDetails()} aria-label="Copy error details"
              > <Copy class="w-4" /> </Button> </div> <div class="mx-auto px-4"> <div>Severity: {currentError.severity}</div> <div>Time: {new Date().toLocaleString()}</div> </div> </div> {/if} </div> <div class="mx-auto px-4"> {#if currentError.canRetry} <Button size="sm"
            variant="ghost"
            class={getButtonClass(currentError.severity)} onclick={() => retryAction()} disabled={ retryInProgress } aria-label="Retry action"
          > {#if retryInProgress} <div class="mx-auto px-4"></div> {:else} <RefreshCw class="mx-auto px-4" /> {/if} Retry </Button> {/if} {#if currentError.showDetails} <Button.Root, class="bits-btn"
            size="sm"
            variant="ghost"
            onclick={() => (showDetails = !showDetails)} aria-label="Toggle error details"
          > {#if showDetails} <ChevronUp class="mx-auto px-4" /> {:else} <ChevronDown class="mx-auto px-4" /> {/if} </Button> {/if} <Button.Root, class="bits-btn"
          size="sm"
          variant="ghost"
          onclick={() => clearError()} aria-label="Dismiss error"
        > <X class="mx-auto px-4" /> </Button> </div> </div> {:else} <!-- Modal, Error --> <div class="mx-auto px-4"> <div class="mx-auto px-4"> <div class="mx-auto px-4"> {#if currentError.severity === "critical" || currentError.severity === "error"} <AlertCircle class="mx-auto px-4" /> {:else if currentError.severity === "warning"} <AlertTriangle class="mx-auto px-4" /> {:else} <Info class="mx-auto px-4" /> {/if} <div class="mx-auto px-4"> <h3 class="mx-auto px-4">{currentError.title}</h3> <p class="mx-auto px-4"> {currentError.message} </p> {#if currentError.suggestion} <div class="mx-auto px-4"> <p class="mx-auto px-4"> <strong>ðŸ’¡ Suggestion:</strong> {currentError.suggestion} </p> </div> {/if} {#if showDetails && currentError.showDetails} <div class="mx-auto px-4"> <div class="mx-auto px-4"> <h4 class="mx-auto px-4">Technical Details</h4> <Button.Root, class="bits-btn"
                    variant="ghost"
                    size="sm"
                    onclick={() => copyErrorDetails()} class="mx-auto px-4 max-w-7xl"
                    aria-label="Copy error details"
                  > <Copy class="mx-auto px-4" /> Copy </Button> </div> <div class="mx-auto px-4"> <div>Severity: {currentError.severity}</div> <div>Time: {new Date().toLocaleString()}</div> <div>Browser: {navigator.userAgent}</div> </div> </div> {/if} </div> </div> <div class="mx-auto px-4"> {#if currentError.severity === "critical" || currentError.severity === "error"} <Button.Root, class="bits-btn"
              variant="ghost"
              size="sm"
              onclick={() => reportError()} class="mx-auto px-4 max-w-7xl"
            > <Bug class="mx-auto px-4" /> Report Issue </Button> {/if} {#if currentError.showDetails} <Button.Root, class="bits-btn"
              variant="ghost"
              size="sm"
              onclick={() => (showDetails = !showDetails)} class="mx-auto px-4 max-w-7xl"
            > {#if showDetails} <ChevronUp class="mx-auto px-4" /> Hide Details {:else} <ChevronDown class="mx-auto px-4" /> Show Details {/if} </Button> {/if} {#if currentError.canRetry} <Button class={`gap-2 ${getButtonClass(currentError.severity)}`} onclick={() => retryAction()} disabled={ retryInProgress } >
              {#if retryInProgress} <div class="mx-auto px-4"></div> Retrying... {:else} <RefreshCw class="mx-auto px-4" /> Retry {/if} </Button> {/if} <Button.Root, class="bits-btn"
            variant={currentError.canRetry ? "outline": "default"} onclick={() => clearError()} >
            {currentError.canRetry ? "Cancel": "Close"} </Button> </div> </div> </div> {/if} <!-- TODO: migrate export lets, to $props(); CommonProps, assumed. -->
