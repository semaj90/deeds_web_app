<script lang="ts">

  interface Case { id: string, title: string;
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
      case 'high': return 'text-danger/80 bg-danger/10 border-danger/20';
      case 'medium': return 'text-warning bg-warning/10 border-warning/20';
      case 'low': return 'text-accent bg-accent/10 border-accent/20';
      default:return 'text-sand/40 bg-sand/10 border-sand/20';
    }
  }
</script>

<div class="space-y-4">
  <div class="overflow-x-auto rounded-lg border border-sand/50 bg-panel/50 backdrop-blur">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="border-b border-sand/50 bg-panelSoft/30">
          <th class="p-4 w-10">
            <input type="checkbox" class="rounded border-sand/30 bg-panelSoft text-info" />
          </th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">ID</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">Title</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">Status</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">Priority</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">Progress</th>
          <th class="p-4 text-xs font-bold uppercase tracking-wider text-sand/40">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredCases as item (item.id)}
          <tr class="border-b border-sand/30 hover:bg-panelSoft/20 transition-colors group">
            <td class="p-4">
              <input
                type="checkbox"
                checked={selectedCases.has(item.id)}
                onclick={() => toggleSelect(item.id)}
                class="rounded border-sand/30 bg-panelSoft text-info"
              />
            </td>
            <td class="p-4 font-mono text-xs text-info">{item.id}</td>
            <td class="p-4">
              <div class="font-medium text-sand/40">{item.title}</div>
              <div class="text-xs text-sand/60 mt-1">{item.description}</div>
            </td>
            <td class="p-4">
              <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter bg-panelSoft text-sand/40 border border-sand/30">
                {item.status}
              </span>
            </td>
            <td class="p-4">
              <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter border {getPriorityClass(item.priority)}">
                {item.priority}
              </span>
            </td>
            <td class="p-4">
              <div class="w-24 bg-panelSoft rounded-full h-1.5 overflow-hidden">
                <div class="bg-info h-full transition-all duration-500" style="width: {item.progress}%"></div>
              </div>
              <span class="text-[10px] text-sand/60 mt-1">{item.progress}%</span>
            </td>
            <td class="p-4 text-xs text-sand/40">
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


