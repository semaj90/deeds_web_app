<script lang="ts">
	import { Dialog } from "bits-ui";
interface PersonOfInterest {
		name: string;
		face: string;
		alias?: string;
		status: string;
		riskLevel: string;
		age: number;
		height: number;
		hair: string;
		modusOperandi: string;
		knownAssociates: string[];
	}

	interface Props {
		person: PersonOfInterest;
	}

	let { person } = $props<Props>();

 let aiOpen = $state(false);
 let aiSummary = $state("…");

 $effect(() => {
 if (aiOpen && aiSummary === "…") {
 fetch("/api/persons/summary", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
	text: `${person.name} - ${person.modusOperandi} -, Associates: ${person.knownAssociates.join(", ")}` })
 })
 .then(res => res.json())
 .then(data => aiSummary = data.summary)
 .catch(err => aiSummary = "Error loading AI analysis");
 }
 });
</script>

<div class="space-y-6">

 <!-- Header -->
 <div class="flex gap-6">
 <img src={person.face} class="w-40 h-40 rounded-xl shadow-xl" />

 <div>
 <h1 class="text-3xl font-bold">{person.name}</h1>
 <p class="text-sm opacity-60">{person.alias}</p>

 <div class="flex gap-3 mt-4">
 <div class="nes-badge"><span class="is-warning">{person.status}</span></div>
 <div class="nes-badge"><span class="is-primary">{person.riskLevel}</span></div>
 </div>
 </div>
 </div>

 <!-- Info Cards -->
 <div class="grid grid-cols-3 gap-4">
 <div class="nes-container is-dark"><p>Age</p><p class="text-2xl">{person.age}</p></div>
 <div class="nes-container is-dark"><p>Height</p><p class="text-2xl">{person.height} cm</p></div>
 <div class="nes-container is-dark"><p>Hair</p><p class="text-2xl">{person.hair}</p></div>
 </div>

 <!-- MO -->
 <h2 class="text-xl mt-6">Modus Operandi</h2>
 <div class="nes-container">{person.modusOperandi}</div>

 <!-- Known Associates -->
 <h2 class="text-xl mt-6">Known Associates</h2>
 <div class="grid grid-cols-2 gap-3">
 {#each person.knownAssociates as a}
 <div class="nes-container p-2">{a}</div>
 {/each}
 </div>

 <!-- AI Assistant -->
 <button class="nes-btn is-primary mt-6" onclick={() => aiOpen = true}>
 AI ANALYSIS
 </button>

 <Dialog.Root bind:open={aiOpen}>
 <Dialog.Portal>
 <Dialog.Overlay />
 <Dialog.Content class="nes-container bg-panel text-white w-[500px] rounded-xl">
 <Dialog.Title class="text-xl mb-4">AI Legal Risk Summary</Dialog.Title>
 <Dialog.Description>
   <p>{aiSummary}</p>
 </Dialog.Description>
 </Dialog.Content>
 </Dialog.Portal>
 </Dialog.Root>
</div>



