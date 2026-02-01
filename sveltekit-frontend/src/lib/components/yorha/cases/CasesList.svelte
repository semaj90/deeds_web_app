<script lang="ts">

  interface Case {
    id: string;
	title: string;
    status: 'active' | 'review' | 'closed';
    priority: 'high' | 'medium' | 'low';
    assignee: string;
	created: Date;
    updated: Date;
	evidenceCount: number;
    progress: number;
	description: string;
  }

  let cases = $state<Case[]>([
    {
      id: 'CASE-2024-01',
      title: 'Corporate Fraud Investigation',
      status: 'active',
      priority: 'high',
      assignee: 'Detective A2',
      created: new Date('2024-01-15'),
      updated: new Date(),
      evidenceCount: 1247,
      progress: 75,
      description: 'Investigation into financial irregularities at TechCorp Inc.'
    },
	{
      id: 'CASE-2024-02',
      title: 'Intellectual Property Dispute',
      status: 'active',
      priority: 'medium',
      assignee: 'Detective B7',
      created: new Date('2024-01-20'),
      updated: new Date(Date.now() - 86400000),
      evidenceCount: 892,
      progress: 45,
      description: 'Patent infringement case involving software algorithms.'
    },
	{
      id: 'CASE-2024-03',
      title: 'Contract Breach Analysis',
      status: 'review',
      priority: 'low',
      assignee: 'Detective C3',
      created: new Date('2024-01-10'),
      updated: new Date(Date.now() - 7200000),
      evidenceCount: 567,
      progress: 90,
      description: 'Analysis of contractual obligations and breach claims.'
    }
  ]);

  let searchQuery = $state('');
  let selectedCases = $state(new Set<string>());
  let sortBy = $state('updated');
  let sortOrder = $state('desc');

  let filteredCases = $derived(
    cases.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
      let aVal = a[sortBy as keyof Case];
      let bVal = b[sortBy as keyof Case];

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    })
  );

  function toggleSelect(id: string) {
    if (selectedCases.has(id)) {
      selectedCases.delete(id);
    } else {
      selectedCases.add(id);
    }
    selectedCases = new Set(selectedCases);
  }

  function getPriorityClass(priority: string) {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'low': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  }
</script>

<div class="space-y-4">
  <div class="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-900/50 backdrop-blur">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="border-b border-slate-700/50 bg-slate-800/30">
          <th class="p-4 w-10">
            <input type="checkbox" class="rounded border-slate-600 bg-slate-700 text-cyan-500" />
          </th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">ID</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Title</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Priority</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Progress</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-slate-400">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredCases as item (item.id)}
          <tr class="border-b border-slate-700/30 hover:bg-slate-800/20 transition-colors group">
            <td class="p-4">
              <input
                type="checkbox"
                checked={selectedCases.has(item.id)}
                onclick={() => toggleSelect(item.id)}
                class="rounded border-slate-600 bg-slate-700 text-cyan-500"
              />
            </td>
            <td class="p-4 font-mono text-xs text-cyan-400">{item.id}</td>
            <td class="p-4">
              <div class="font-medium text-slate-200">{item.title}</div>
              <div class="text-xs text-slate-500 mt-1">{item.description}</div>
            </td>
            <td class="p-4">
              <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter bg-slate-700 text-slate-300 border border-slate-600">
                {item.status}
              </span>
            </td>
            <td class="p-4">
              <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border {getPriorityClass(item.priority)}">
                {item.priority}
              </span>
            </td>
            <td class="p-4">
              <div class="w-24 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div class="bg-cyan-500 h-full transition-all duration-500" style="width: {item.progress}%"></div>
              </div>
              <span class="text-[10px] text-slate-500 mt-1">{item.progress}%</span>
            </td>
            <td class="p-4 text-xs text-slate-400">
              {item.updated.toLocaleDateString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  th { border: none; }
</style>


