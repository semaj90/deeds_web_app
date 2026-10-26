# SvelteKit 2 & Svelte 5 Compiler Warnings Diagnostic & QLoRA Alignment Catalog

> **Scope**: Diagnostic analysis, root causes, code transformation recipes, and QLoRA instruction dataset for the 186 compiler warnings surfaced during the `svelte-check` audit across 72 files.
> **Governing Manifest**: [`docs/.okf/dev/pinned-docs.manifest.json`](file:///c:/Users/james/Videos/deeds-web-app/docs/.okf/dev/pinned-docs.manifest.json)
> **NES LUT Domain Byte**: `0x2A` (`ui` domain, NES 2C02 PPU palette)
> **Concept ID**: `concept:sveltekit2:runes_a11y_hardening:v1`
> **Authority**: Parent Atlas Verified Analysis Fabric (`canonicalAuthority: false`, `writesPerformed: false`)

---

## 1. Executive Diagnostic Summary

A full workspace compile (`npm run check` via `svelte-check --tsconfig ./tsconfig.json`) verified **`0 errors`** and **`186 warnings`** across 72 files. The warnings fall into 6 distinct categories:

| Svelte Compiler Warning Code | Count | Severity | Primary Root Cause |
|---|---|---|---|
| `a11y_label_has_associated_control` | 68 | Moderate | `<label>` used as purely visual text wrapper without `for="..."` or nested `<input>` |
| `css_unused_selector` | 46 | Low | CSS selectors in `<style>` that do not match static markup (often injected dynamically) |
| `a11y_click_events_have_key_events` | 36 | Moderate | Interactive click handlers on non-interactive `<div>`/`<span>` without keyboard handlers |
| `a11y_no_static_element_interactions` | 22 | Moderate | Clickable backdrop or modal wrapper missing ARIA role attribute (`role="presentation"`) |
| `a11y_interactive_supports_focus` | 9 | Moderate | Elements with `role="dialog"` or interactive roles lacking focus management `tabindex="-1"` |
| `state_referenced_locally` | 5 | Low | Top-level object initializer capturing initial value of props without `$derived` or closures |

---

## 2. Category Diagnostics & Transformation Recipes

### Category A: `a11y_label_has_associated_control` (68 occurrences)
- **Top Files**: `src/lib/components/analysis/AnalysisPanel.svelte` (14), `src/lib/components/ui/StyleSettings.svelte` (7), `src/lib/components/poi/AddPoiModal.svelte` (7).
- **Diagnostic**: The HTML `<label>` element must be programmatically associated with a form control so screen readers and assistive technology can link the description to the input.
- **Transformation Recipe**:
```svelte
<!-- BEFORE (Warning) -->
<label class="form-label">Evidence Type</label>
<select bind:value={selectedType}>...</select>

<!-- AFTER (Resolved) -->
<label class="form-label" for="evidence-type-select">Evidence Type</label>
<select id="evidence-type-select" bind:value={selectedType}>...</select>
<!-- OR nested control -->
<label class="form-label">
  Evidence Type
  <select bind:value={selectedType}>...</select>
</label>
```

### Category B: `css_unused_selector` (46 occurrences)
- **Top Files**: `src/routes/(app)/knowledge/+page.svelte`, `src/routes/(app)/legal-corpus/[id]/+page.svelte`.
- **Diagnostic**: Svelte 5 automatically scopes CSS styles to component markup. When markup is removed or CSS classes are passed down dynamically from parents, the scoped selector becomes "unused".
- **Transformation Recipe**:
```svelte
<!-- BEFORE (Warning) -->
<style>
  .knowledge-search-container { ... }
  .provider-select { ... } /* Unused: element removed */
</style>

<!-- AFTER (Resolved) -->
<!-- Remove dead CSS rules, OR if dynamically passed to child: -->
<style>
  :global(.provider-select) { ... }
</style>
```

### Category C: `a11y_click_events_have_key_events` & `a11y_no_static_element_interactions` (58 occurrences)
- **Top Files**: `src/routes/(app)/citations/+page.svelte` (8), `src/routes/(app)/global-search/+page.svelte` (7), `src/routes/(app)/library/corpus/+page.svelte`.
- **Diagnostic**: Modal backdrops and clickable cards using `<div>` with `onclick` prevent keyboard navigation (users navigating via Tab / Space / Enter).
- **Transformation Recipe**:
```svelte
<!-- BEFORE (Warning) -->
<div class="analysis-modal-backdrop" onclick={() => activeAnalysisContext = null}>
  <div class="analysis-modal" onclick={(e) => e.stopPropagation()}>
    ...
  </div>
</div>

<!-- AFTER (Resolved) -->
<div
  class="analysis-modal-backdrop"
  onclick={() => activeAnalysisContext = null}
  onkeydown={(e) => { if (e.key === 'Escape') activeAnalysisContext = null; }}
  role="presentation"
>
  <div
    class="analysis-modal"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    ...
  </div>
</div>
```

### Category D: `state_referenced_locally` (5 occurrences)
- **Top Files**: `src/lib/components/forms/CaseForm.svelte`.
- **Diagnostic**: Referencing a `$props()` value directly inside a top-level variable initialization only captures its initial value at component mount and will not react to subsequent prop updates.
- **Transformation Recipe**:
```svelte
<!-- BEFORE (Warning) -->
let { initialData }: Props = $props();
const { form } = superForm(getInitialData(), {
  SPA: !initialData ? true : undefined
});

<!-- AFTER (Resolved) -->
let { initialData }: Props = $props();
let isSpaMode = $derived(!initialData);
const { form } = superForm(getInitialData(), {
  SPA: isSpaMode ? true : undefined
});
```

---

## 3. QLoRA Alignment Dataset Format (Instruction / Input / Output)

For domain fine-tuning and QLoRA adapters (e.g., `ornith-1.5-9b` / `Gemma 3 Legal-AI` adapters), the warning diagnoses and resolution patterns form structured supervised fine-tuning (SFT) examples:

```json
{
  "dataset": "sveltekit2_runes_a11y_qlora_v1",
  "domain": "ui",
  "lut_palette_byte": "0x2A",
  "samples": [
    {
      "instruction": "Fix Svelte compiler warning a11y_label_has_associated_control in a Svelte 5 component.",
      "input": "<label class=\"text-sm font-semibold\">Case Title</label>\n<input type=\"text\" bind:value={title} />",
      "output": "<label class=\"text-sm font-semibold\" for=\"case-title-input\">Case Title</label>\n<input id=\"case-title-input\" type=\"text\" bind:value={title} />",
      "rationale": "Associates the label element with the input via matching for and id attributes according to WCAG 2.1 SC 1.3.1."
    },
    {
      "instruction": "Fix Svelte compiler warning a11y_click_events_have_key_events and a11y_no_static_element_interactions on a modal backdrop.",
      "input": "<div class=\"backdrop\" onclick={closeModal}>\n  <div class=\"dialog\" onclick={(e) => e.stopPropagation()}>\n    <h2>{title}</h2>\n  </div>\n</div>",
      "output": "<div class=\"backdrop\" onclick={closeModal} onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }} role=\"presentation\">\n  <div class=\"dialog\" onclick={(e) => e.stopPropagation()} role=\"dialog\" aria-modal=\"true\" tabindex=\"-1\">\n    <h2>{title}</h2>\n  </div>\n</div>",
      "rationale": "Adds role='presentation' to the non-interactive backdrop and converts the inner container into an accessible dialog with role='dialog', aria-modal='true', and tabindex='-1'."
    }
  ]
}
```

---

## 4. NES LUT & ACE Context Injection Contract

- **Redis Key**: `ace:packet:qlora-sveltekit-warnings-v1`
- **BitFrost Centroid**: `bitfrost:centroid:lru:cuml-kmeans-k16-c02`
- **TTL**: `604,800s` (7 days)
- **OaK Python Tuple**:
  ```python
  (
      "docs/.okf/pinned/sveltekit/DIAGNOSTIC_WARNINGS_FIXES.md",
      "concept:sveltekit2:runes_a11y_hardening:v1",
      "0x2A",
      "OPTION[RESOLVE_SVELTE_A11Y_WARNINGS]",
      0.98,
      64,
      "implements"
  )
  ```
- **Prompt Injection Defense**:
  - `hiddenThoughtsPersisted`: `false`
  - `forbiddenPayloads`: `['hiddenThoughts', 'chainOfThought', 'kv_cache', 'raw_tensor']`
  - `writesPerformed`: `false`
