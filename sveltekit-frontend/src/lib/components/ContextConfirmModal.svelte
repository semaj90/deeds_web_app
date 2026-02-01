<script lang="ts">
  /**
   * Context Confirmation Modal
   *
   * Shows a proposed context from chat history and asks the user:
   * "Is this the one you meant?"
   *
   * Emits 'accept' or 'reject' events based on user choice.
   */

  interface ContextData {
    context_id: string;
	source: string;
    score: number;
	snippet: string;
    range?: {
	from_msg_id: number; to_msg_id: number };
    timestamp?: string;
  }

  interface Props {
    context: ContextData;
    hint?: string | null;
    onaccept?: (detail: {
	comment: string }) => void;
    onreject?: (detail: {
	comment: string }) => void;
  }

  let {
    context,
    hint = null,
    onaccept = undefined,
    onreject = undefined
  }: Props = $props();

  let userComment = $state('');
  let isSubmitting = $state(false);

  async function accept() {
    isSubmitting = true;
    if (onaccept) {
      onaccept({ comment: userComment });
    }
    isSubmitting = false;
  }

  async function reject() {
    isSubmitting = true;
    if (onreject) {
      onreject({ comment: userComment });
    }
    isSubmitting = false;
  }

  function formatScore(score: number): string {
    return (score * 100).toFixed(1);
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
  <div
    class="bg-base-100 rounded-xl shadow-2xl max-w-2xl w-[90%] p-6 border border-base-300 space-y-4"
  >
    <!-- Header -->
    <div class="flex justify-between items-start">
      <div>
        <h2 class="font-semibold text-lg tracking-wide text-neutral-100">
          Possible Previous Context
        </h2>
        <p class="text-xs text-neutral-500 mt-1">
          I found a likely match in your chat history. Is this what you meant?
        </p>
      </div>
      <div class="text-right">
        <div class="text-xs uppercase opacity-60 font-mono">
          {context.source}
        </div>
        <div class="text-sm font-semibold text-primary">
          {formatScore(context.score)}% match
        </div>
      </div>
    </div>

    <!-- Hint -->
    {#if hint}
      <div class="text-sm opacity-80 bg-base-200 rounded px-3 py-2 border-l-2 border-primary">
        {hint}
      </div>
    {/if}

    <!-- Snippet -->
    <div class="border rounded-lg bg-base-200 p-4 max-h-64 overflow-auto">
      <pre class="whitespace-pre-wrap text-sm font-mono leading-relaxed text-neutral-300">{context.snippet}</pre>
    </div>

    <!-- Metadata -->
    {#if context.range}
      <div class="text-xs opacity-60 space-y-1">
        <div>
          <span class="opacity-50">Message range:</span>
          <span class="font-mono">
            {context.range.from_msg_id}–{context.range.to_msg_id}
          </span>
        </div>
        {#if context.timestamp}
          <div>
            <span class="opacity-50">Timestamp:</span>
            <span class="font-mono">{context.timestamp}</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Optional comment -->
    <div class="space-y-2">
      <label for="user-comment" class="text-xs font-semibold text-neutral-400">
        Optional comment (why or why not)
      </label>
      <textarea
        id="user-comment"
        bind:value={userComment}
        placeholder="e.g., 'Yes, but I meant the earlier part' or 'No, I was asking about something else'"
        class="textarea textarea-bordered textarea-sm w-full bg-base-200 text-sm"
        rows="2"
      ></textarea>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-2">
      <button
        class="btn btn-ghost btn-sm"
        onclick={reject}
        disabled={isSubmitting}
      >
        No, that's not it
      </button>
      <button
        class="btn btn-primary btn-sm"
        onclick={accept}
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        Yes, use this
      </button>
    </div>
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }
</style>
