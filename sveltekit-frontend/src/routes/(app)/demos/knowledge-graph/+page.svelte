<script lang="ts">
	import ProvenanceGraph from '$lib/components/source-validation/ProvenanceGraph.svelte';

	const demoEntities = [
		'Johnson v. Tech Corp',
		'Patent #US10234567',
		'Trade Secrets Act §1832',
		'Dr. Sarah Chen (Expert)',
		'Digital Forensics Report',
		'Source Code Repository',
		'NDA Agreement 2023',
		'Prior Art Database',
		'Licensing Agreement',
		'Internal Memo (Exhibit A)',
	];

	const demoRelationships = [
		{ from: 'Johnson v. Tech Corp', to: 'Patent #US10234567', type: 'disputes' },
		{ from: 'Johnson v. Tech Corp', to: 'Trade Secrets Act §1832', type: 'governed_by' },
		{ from: 'Dr. Sarah Chen (Expert)', to: 'Digital Forensics Report', type: 'authored' },
		{ from: 'Digital Forensics Report', to: 'Source Code Repository', type: 'analyzes' },
		{ from: 'Source Code Repository', to: 'Patent #US10234567', type: 'implements' },
		{ from: 'NDA Agreement 2023', to: 'Trade Secrets Act §1832', type: 'references' },
		{ from: 'Prior Art Database', to: 'Patent #US10234567', type: 'challenges' },
		{ from: 'Licensing Agreement', to: 'Source Code Repository', type: 'covers' },
		{ from: 'Internal Memo (Exhibit A)', to: 'Johnson v. Tech Corp', type: 'evidence_for' },
		{ from: 'Internal Memo (Exhibit A)', to: 'NDA Agreement 2023', type: 'contradicts' },
		{ from: 'Dr. Sarah Chen (Expert)', to: 'Prior Art Database', type: 'consulted' },
		{ from: 'Licensing Agreement', to: 'Johnson v. Tech Corp', type: 'relevant_to' },
	];
</script>

<div class="max-w-5xl mx-auto py-8 px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold m-0 mb-2">Knowledge Graph</h1>
		<p class="text-sm opacity-50 m-0">D3.js force-directed provenance graph showing entity relationships for RAG source validation.</p>
	</div>
	<div class="border border-sand-dark rounded-lg bg-panel-soft p-4">
		<ProvenanceGraph
			validationId="demo-validation-001"
			entities={demoEntities}
			relationships={demoRelationships}
			width={900}
			height={600}
		/>
	</div>
</div>
