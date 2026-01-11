<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    caseId?: string;
    readonly?: boolean;
    autosave?: boolean;
  }

  let { value = $bindable(''), placeholder = '', caseId = '', readonly = false, autosave = false }: Props = $props();
</script>

<div class="nier-rich-text-editor">
  <textarea
    bind:value
    {placeholder}
    {readonly}
    class="editor-textarea"
    aria-label="Rich text editor for {caseId}"
  ></textarea>
</div>

<style>
  .nier-rich-text-editor {
    width: 100%;
    height: 100%;
    background: var(--yorha-bg-secondary, #1a1a1a);
    border: 1px solid var(--yorha-border, #606060);
    border-radius: 4px;
    padding: 16px;
    box-sizing: border-box;
    color: var(--yorha-text-primary, #e0e0e0);
    font-family: var(--gaming-font-16bit, 'Orbitron', sans-serif);
  }

  .editor-textarea {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    color: inherit;
    font-family: inherit;
    font-size: 1rem;
    resize: none;
    outline: none;
  }

  .editor-textarea:focus {
    box-shadow: 0 0 8px rgba(60, 188, 252, 0.3);
  }
</style>
