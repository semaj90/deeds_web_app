<script lang="ts">
	import BookOpen from 'lucide-svelte/icons/book-open';
	import FileText from 'lucide-svelte/icons/file-text';
	import Link from 'lucide-svelte/icons/link';
	import Users from 'lucide-svelte/icons/users';
	import { boardTerms, boardRelationshipTerms, reportStatusTerms, personStatusTerms, type BoardDossierContext } from './board-dossier-context.js';

	interface Props {
		caseId: string;
		context: BoardDossierContext | null;
		selected: boolean;
		linkedPoiId?: string | null;
		related: { id: string; evidenceId: string; title: string; code: string; type: string; label: string | null }[];
		onSelect: (id: string) => void;
	}
	let { caseId, context, selected, linkedPoiId, related, onSelect }: Props = $props();
	const casePath = $derived(`/cases/${encodeURIComponent(caseId)}`);

	function displayLabel(value: string) {
		return value.replace(/[_-]+/g, ' ').replace(/^./, (first) => first.toUpperCase());
	}
</script>

<section class="dossier-details" aria-label="Evidence and case context">
	{#if selected}
		<details open>
			<summary><Link size={15} aria-hidden="true" /> Related evidence <span class="count">{related.length}</span></summary>
			<div class="section-body">
				{#if related.length}
					<ul>
						{#each related as item (item.id)}
							<li><button class="entry" type="button" onclick={() => onSelect(item.evidenceId)}>
								<small>{item.code} · {displayLabel(item.type)}</small>
								<strong>{item.title}</strong>
								{#if item.label && item.label.toLowerCase() !== displayLabel(item.type).toLowerCase()}<span>{item.label}</span>{/if}
							</button></li>
						{/each}
					</ul>
				{:else}
					<p>No saved exhibit links to display.</p>
				{/if}
			</div>
		</details>
	{/if}

	{#if context}
		<details>
			<summary><FileText size={15} aria-hidden="true" /> Case reports</summary>
			<div class="section-body">
				{#if context.unavailable.includes('reports')}
					<p role="status">Reports could not be loaded.</p>
				{:else if context.reports.length}
					<ul>
						{#each context.reports as report (report.id)}
							<li><a class="entry" href={`${casePath}/reports#report-${encodeURIComponent(report.id)}`}>
								<small>{displayLabel(report.status)}{report.type ? ` · ${displayLabel(report.type)}` : ''}</small>
								<strong>{report.title}</strong>
							</a></li>
						{/each}
					</ul>
				{:else}
					<p>No reports filed in this case.</p>
				{/if}
				<a class="section-link" href={`${casePath}/reports`}>Open case reports <span aria-hidden="true">→</span></a>
			</div>
		</details>
		<details>
			<summary><Users size={15} aria-hidden="true" /> People of interest</summary>
			<div class="section-body">
				{#if context.unavailable.includes('people')}
					<p role="status">People of interest could not be loaded.</p>
				{:else if context.people.length}
					<ul>
						{#each context.people as person (person.id)}
							<li class="entry">
								<strong>{person.name}</strong>
								<small>{person.role ? `${displayLabel(person.role)} · ` : ''}{displayLabel(person.status)}</small>
								{#if person.id === linkedPoiId}<small class="source-link">Photo filed as this exhibit</small>{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p>No people of interest recorded in this case.</p>
				{/if}
				<a class="section-link" href={`${casePath}/persons`}>Open case persons <span aria-hidden="true">→</span></a>
			</div>
		</details>
	{/if}

	<details>
		<summary><BookOpen size={15} aria-hidden="true" /> Board definitions</summary>
		<div class="section-body">
			<dl>
				{#each Object.entries(boardTerms) as [label, definition]}<dt>{label}</dt><dd>{definition}</dd>{/each}
			</dl>
			<h4>Relationship labels</h4>
			<dl>
				{#each Object.entries(boardRelationshipTerms) as [label, definition]}<dt>{displayLabel(label)}</dt><dd>{definition}</dd>{/each}
			</dl>
			<h4>Report statuses</h4>
			<dl>
				{#each Object.entries(reportStatusTerms) as [label, definition]}<dt>{label}</dt><dd>{definition}</dd>{/each}
			</dl>
			<h4>Person of interest statuses</h4>
			<dl>
				{#each Object.entries(personStatusTerms) as [label, definition]}<dt>{label}</dt><dd>{definition}</dd>{/each}
			</dl>
		</div>
	</details>
</section>

<style>
	.dossier-details { display: grid; gap: .55rem; color: var(--dossier-text-main, #141312); user-select: text; }
	details { background: var(--dossier-bg-card, #faf6f0); border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: var(--dossier-radius-card, 10px); }
	summary { display: flex; align-items: center; gap: .5rem; min-height: 42px; padding: .45rem .65rem; cursor: pointer; font: 600 .94rem/1.2 Georgia, serif; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary::after { content: '+'; margin-inline-start: auto; font: 500 .9rem/1 sans-serif; }
	details[open] > summary::after { content: '−'; }
	.count { border-radius: 1rem; background: var(--dossier-bg-workspace, #ece7dc); padding: .15em .5em; font: 600 .72rem/1.2 sans-serif; }
	.section-body { padding: 0 .65rem .7rem; font-size: .8rem; overflow-wrap: anywhere; }
	.section-body p { margin: .25rem 0 .55rem; color: var(--dossier-text-muted-aa, #6b6150); }
	ul, dl { margin: 0; padding: 0; }
	ul { list-style: none; display: grid; gap: .35rem; }
	.entry { display: grid; width: 100%; justify-content: start; gap: .15rem; padding: .5rem; text-align: left; text-decoration: none; color: inherit; background: #fffdf9; border: 1px solid var(--dossier-hairline, #e2d7c9); border-radius: var(--dossier-radius-inner, 6px); }
	button.entry { cursor: pointer; font: inherit; }
	button.entry:hover, a.entry:hover { border-color: var(--dossier-gold, #c9a86a); }
	.entry small { color: var(--dossier-text-muted-aa, #6b6150); }
	.source-link { font-weight: 600; }
	.section-link { display: inline-block; margin-top: .55rem; color: var(--dossier-mocha, #483d36); text-decoration: underline; text-underline-offset: 2px; }
	dt, h4 { font-weight: 700; }
	dd { margin: 0 0 .55rem; color: var(--dossier-text-muted-aa, #6b6150); }
	h4 { margin: .85rem 0 .35rem; }
	summary:focus-visible, .entry:focus-visible, .section-link:focus-visible { outline: 2px solid var(--dossier-mocha, #483d36); outline-offset: 2px; }
</style>
