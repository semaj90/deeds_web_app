<script lang="ts">

  let cases = [
    {
      id: 'CASE-2024-001',
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
      id: 'CASE-2024-002',
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
      id: 'CASE-2024-003',
      title: 'Contract Breach Analysis',
      status: 'review',
      priority: 'low',
      assignee: 'Detective C3',
      created: new Date('2024-01-10'),
      updated: new Date(Date.now() - 7200000),
      evidenceCount: 567,
      progress: 90,
      description: 'Analysis of contractual obligations and breach claims.'
    },
    {
      id: 'CASE-2024-004',
      title: 'Data Privacy Violation',
      status: 'active',
      priority: 'high',
      assignee: 'Detective D9',
      created: new Date('2024-01-25'),
      updated: new Date(Date.now() - 3600000),
      evidenceCount: 2156,
      progress: 30,
      description: 'GDPR compliance investigation and data breach analysis.'
    }
  ];

  let selectedCases = $state(new Set<string>());
  let sortBy = $state('updated');
  let sortOrder = $state('desc');

  let sortedCases = $derived([...cases].sort((a, b) => {
    let aVal: any, bVal: any;

    switch (sortBy) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'status':
        aVal = a.status;
        bVal = b.status;
        break;
      case 'priority':
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        aVal = priorityOrder[a.priority as keyof typeof priorityOrder];
        bVal = priorityOrder[b.priority as keyof typeof priorityOrder];
        break;
      case 'updated':
        aVal = a.updated.getTime();
        bVal = b.updated.getTime();
        break;
      case 'progress':
        aVal = a.progress;
        bVal = b.progress;
        break;
      default:
        aVal = a.updated.getTime();
        bVal = b.updated.getTime();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  }));

  function toggleCaseSelection(caseId: string) {
    if (selectedCases.has(caseId)) {
      selectedCases.delete(caseId);
    } else {
      selectedCases.add(caseId);
    }
    selectedCases = new Set(selectedCases);
  }

  function selectAllCases() {
    if (selectedCases.size === cases.length) {
      selectedCases = new Set();
    } else {
      selectedCases = new Set(cases.map(c => c.id));
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-green-400/20 text-green-400 border-green-400/50';
      case 'review': return 'bg-yellow-400/20 text-yellow-400 border-yellow-400/50';
      case 'closed': return 'bg-slate-400/20 text-slate-400 border-slate-400/50';
      default: return 'bg-slate-400/20 text-slate-400 border-slate-400/50';
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high': return 'border-red-400';
      case 'medium': return 'border-yellow-400';
      case 'low': return 'border-green-400';
      default: return 'border-slate-400';
    }
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg border border-slate-700/50">
  <!-- Table Header -->
  <div class="p-4 border-b border-slate-700/50">
    <div class="flex items-center justify-between">
      {#if selectedCases.size > 0}
        <div class="flex space-x-2">
          <button class="px-3 py-1 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 text-sm rounded transition-colors">
            Bulk Actions
          </button>
          <button class="px-3 py-1 bg-red-400/20 hover:bg-red-400/30 text-red-400 text-sm rounded transition-colors">
            Delete
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Table -->
  <div class="overflow-x-auto">
    <table class="w-full">
      <thead class="bg-slate-700/30">
        <tr class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
          <th class="px-4 py-3 w-12"></th>
          <th class="px-4 py-3 cursor-pointer hover:text-cyan-400" onclick={() => { sortBy = 'title'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; }}>
            Case {sortBy === 'title' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 cursor-pointer hover:text-cyan-400" onclick={() => { sortBy = 'status'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; }}>
            Status {sortBy === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 cursor-pointer hover:text-cyan-400" onclick={() => { sortBy = 'priority'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; }}>
            Priority {sortBy === 'priority' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3">Assignee</th>
          <th class="px-4 py-3 cursor-pointer hover:text-cyan-400" onclick={() => { sortBy = 'progress'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; }}>
            Progress {sortBy === 'progress' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3 cursor-pointer hover:text-cyan-400" onclick={() => { sortBy = 'updated'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; }}>
            Updated {sortBy === 'updated' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
          </th>
          <th class="px-4 py-3">Actions</th>
        </tr>
      </thead>

      <tbody class="divide-y divide-slate-700/30">
        {#each sortedCases as caseItem}
          <tr class="hover:bg-slate-700/20 transition-colors">
            <td class="px-4 py-4">
              <input
                type="checkbox"
                class="rounded border-slate-600 bg-slate-700 text-cyan-400 focus:ring-cyan-400"
                checked={selectedCases.has(caseItem.id)}
                onchange={() => toggleCaseSelection(caseItem.id)}
              />
            </td>

            <td class="px-4 py-4">
              <div>
                <div class="font-medium text-white text-sm">{caseItem.title}</div>
                <div class="text-xs text-slate-400">{caseItem.id}</div>
                <div class="text-xs text-slate-500 mt-1 line-clamp-2">{caseItem.description}</div>
              </div>
            </td>

            <td class="px-4 py-4">
              <span class="px-2 py-1 text-xs rounded-full border {getStatusColor(caseItem.status)}">
                {caseItem.status.toUpperCase()}
              </span>
            </td>

            <td class="px-4 py-4">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full mr-2 {caseItem.priority === 'high' ? 'bg-red-400' : caseItem.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}"></div>
                <span class="text-sm text-slate-300 capitalize">{caseItem.priority}</span>
              </div>
            </td>

            <td class="px-4 py-4 text-sm text-slate-300">
              {caseItem.assignee}
            </td>

            <td class="px-4 py-4">
              <div class="flex items-center space-x-2">
                <div class="w-16 bg-slate-600 rounded-full h-2">
                  <div
                    class="h-2 rounded-full bg-cyan-400 transition-all duration-300"
                    style="width: {caseItem.progress}%"
                  ></div>
                </div>
                <span class="text-xs text-slate-400">{caseItem.progress}%</span>
              </div>
            </td>

            <td class="px-4 py-4 text-sm text-slate-400">
              {formatTimeAgo(caseItem.updated)}
            </td>

            <td class="px-4 py-4">
              <div class="flex space-x-1">
                <button class="p-1 text-slate-400 hover:text-cyan-400 transition-colors" title="View Details">
                  👁️
                </button>
                <button class="p-1 text-slate-400 hover:text-yellow-400 transition-colors" title="Edit">
                  ✏️
                </button>
                <button class="p-1 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div class="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between">
    <div class="text-sm text-slate-400">
      Showing 1 to {cases.length} of {cases.length} results
    </div>

    <div class="flex space-x-2">
      <button class="px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm rounded transition-colors" disabled>
        Previous
      </button>
      <button class="px-3 py-1 bg-cyan-400/20 text-cyan-400 text-sm rounded">
        1
      </button>
      <button class="px-3 py-1 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm rounded transition-colors" disabled>
        Next
      </button>
    </div>
  </div>
</div>
