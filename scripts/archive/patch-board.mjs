import fs from 'node:fs';

const file = 'sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte';
let s = fs.readFileSync(file, 'utf8');

if (!s.includes('CorporateEspionageEvidenceBoard')) {
	s = s.replace(
		`import InvestigativeCanvasStar from '$lib/components/evidence/InvestigativeCanvasStar.svelte';`,
		`import InvestigativeCanvasStar from '$lib/components/evidence/InvestigativeCanvasStar.svelte';\n\timport CorporateEspionageEvidenceBoard from '$lib/components/evidence/CorporateEspionageEvidenceBoard.svelte';`
	);
}

s = s.replace(
	`let activeView = $state<'investigative' | 'detective' | 'wall' | 'line' | 'file' | 'list'>('investigative');`,
	`let activeView = $state<'investigative' | 'detective' | 'corporate' | 'wall' | 'line' | 'file' | 'list'>('investigative');`
);

if (!s.includes('evidenceViewerInitialTimestampMs')) {
	s = s.replace(
		`let evidenceViewerInitialView = $state<'original' | 'relief'>('original');`,
		`let evidenceViewerInitialView = $state<'original' | 'relief'>('original');\n\tlet evidenceViewerInitialTimestampMs = $state<number | undefined>(undefined);`
	);

	s = s.replace(
		`function openEvidenceViewer(view: 'original' | 'relief' = 'original') {`,
		`function openEvidenceViewer(view: 'original' | 'relief' = 'original', timestampMs?: number) {\n\t\tevidenceViewerInitialTimestampMs = timestampMs;`
	);

	s = s.replace(
		`initialView={evidenceViewerInitialView}`,
		`initialView={evidenceViewerInitialView}\n\t\tinitialTimestampMs={evidenceViewerInitialTimestampMs}`
	);

	s = s.replace(
		`onClose={() => { showEvidenceViewer = false; openSceneAssistantOnViewer = false; }}`,
		`onClose={() => { showEvidenceViewer = false; openSceneAssistantOnViewer = false; evidenceViewerInitialTimestampMs = undefined; }}`
	);
}

// Add the view tab for CORPORATE / FORENSIC CANVAS
const tabMarker = `<button\r\n\t\t\tclass="tab"\r\n\t\t\tclass:active={activeView === 'detective'}`;
const tabMarkerLf = `<button\n\t\t\tclass="tab"\n\t\t\tclass:active={activeView === 'detective'}`;
const newTab = `<button\n\t\t\tclass="tab"\n\t\t\tclass:active={activeView === 'corporate'}\n\t\t\tonclick={() => (activeView = 'corporate')}\n\t\t>\n\t\t\t<Icon name="layout-grid" />\n\t\t\tFORENSIC CANVAS\n\t\t</button>\n\t\t`;

if (!s.includes(`activeView === 'corporate'`)) {
	if (s.includes(tabMarker)) {
		s = s.replace(tabMarker, newTab + tabMarker);
	} else if (s.includes(tabMarkerLf)) {
		s = s.replace(tabMarkerLf, newTab + tabMarkerLf);
	}
}

// Add corporate view block
const viewBlockMarker = `{:else if activeView === 'detective'}`;
const newViewBlock = `{:else if activeView === 'corporate'}\n\t\t<CorporateEspionageEvidenceBoard\n\t\t\tcaseId={caseId}\n\t\t\tcaseTitle={data.case?.title || 'CORPORATE ESPIONAGE INV-2024'}\n\t\t\tonOpenVideoModal={(evId, ts) => {\n\t\t\t\tconst match = evidenceItems.find((e: any) => e.id === evId);\n\t\t\t\tselectedEvidence = match || { id: evId, title: 'Security Camera Feed', fileType: 'video/mp4' };\n\t\t\t\topenEvidenceViewer('original', ts);\n\t\t\t}}\n\t\t\tonNewEvidence={() => (showAddEvidence = true)}\n\t\t/>\n\t`;

if (!s.includes(`<CorporateEspionageEvidenceBoard`)) {
	s = s.replace(viewBlockMarker, newViewBlock + viewBlockMarker);
}

fs.writeFileSync(file, s, 'utf8');
console.log('Successfully patched board/+page.svelte');
