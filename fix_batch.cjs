const fs = require('fs');
const path = require('path');
const base = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src';

// Fix RelatedCasesPanel.svelte - replace script section
const rcp = path.join(base, 'lib/components/legal-ai/RelatedCasesPanel.svelte');
let rcpContent = fs.readFileSync(rcp, 'utf8');
const rcpScriptNew = `<script lang="ts">
  interface RelatedCase {
    id: string;
    caseNumber: string;
    title: string;
    charges?: string[];
    outcome?: string;
    relevanceScore?: number;
  }

  interface Props {
    statuteCode?: string | null;
    isLoading?: boolean;
    onviewcase?: (caseItem: RelatedCase) => void;
  }

  let { statuteCode = null, isLoading = false, onviewcase }: Props = $props();

  let cases: RelatedCase[] = $state([]);
  let error: string | null = $state(null);

  $effect(() => {
    if (statuteCode) {
      loadRelatedCases();
    }
  });

  async function loadRelatedCases() {
    if (!statuteCode) return;

    isLoading = true;
    error = null;

    try {
      const response = await fetch(\`/api/laws/\${statuteCode}/related-cases?limit=10\`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          cases = data.cases ?? [];
        } else {
          error = data.error || 'Failed to load related cases';
        }
      } else {
        error = 'Failed to load related cases';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      isLoading = false;
    }
  }

  function viewCase(caseItem: RelatedCase) {
    onviewcase?.(caseItem);
  }

  function getRelevanceColor(score?: number) {
    if (!score) return '#999';
    if (score >= 0.8) return '#44ff44';
    if (score >= 0.6) return '#ffd700';
    return '#ff6b6b';
  }
</script>`;

const rcpStyleStart = rcpContent.indexOf('<div class="related-cases-panel">');
if (rcpStyleStart > 0) {
  rcpContent = rcpScriptNew + '\n\n' + rcpContent.substring(rcpStyleStart);
  fs.writeFileSync(rcp, rcpContent, 'utf8');
  console.log('Fixed: RelatedCasesPanel.svelte');
} else {
  console.log('ERROR: Could not find template start in RelatedCasesPanel');
}

// Fix StatuteDetail.svelte - replace script section
const sd = path.join(base, 'lib/components/legal-ai/StatuteDetail.svelte');
let sdContent = fs.readFileSync(sd, 'utf8');
const sdScriptNew = `<script lang="ts">
  interface Statute {
    id: string;
    code: string;
    title?: string;
    full_text?: string;
    jurisdiction?: string;
    severity?: string;
    category?: string;
    year?: number;
  }

  interface Props {
    statute?: Statute | null;
    isLoading?: boolean;
    onattachtocase?: (statute: Statute | null) => void;
    onsavecitation?: (statute: Statute | null) => void;
  }

  let { statute = null, isLoading = false, onattachtocase, onsavecitation }: Props = $props();

  let context: string[] = $state([]);
  let relatedCases: any[] = $state([]);
  let contextLoading = $state(false);

  $effect(() => {
    if (statute) {
      loadContext();
    }
  });

  async function loadContext() {
    if (!statute) return;

    contextLoading = true;

    try {
      const response = await fetch(\`/api/laws/\${statute.code}\`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          context = data.context || [];
          relatedCases = data.relatedCases || [];
        }
      }
    } catch (error) {
      console.error('Error loading statute context:', error);
    } finally {
      contextLoading = false;
    }
  }

  function attachToCase() {
    onattachtocase?.(statute);
  }

  function saveCitation() {
    onsavecitation?.(statute);
  }
</script>`;

const sdTemplateStart = sdContent.indexOf('{#if statute}');
if (sdTemplateStart > 0) {
  sdContent = sdScriptNew + '\n\n' + sdContent.substring(sdTemplateStart);
  fs.writeFileSync(sd, sdContent, 'utf8');
  console.log('Fixed: StatuteDetail.svelte');
} else {
  console.log('ERROR: Could not find template start in StatuteDetail');
}

console.log('Done!');
