<script lang="ts">
  import type { EvidenceItem } from '$lib/components/ui/EvidenceCanvas.svelte';
  import EvidenceCanvas from '$lib/components/ui/EvidenceCanvas.svelte';

  let evidenceItems: EvidenceItem[] = $state ([
    {
      id: '1',
      title: 'Contract Agreement',
      description: 'Legal contract between parties A and B for service provision',
      tags: ['contract', 'agreement', 'services'],
      confidence: 0.85,
      metadata: {
        fileSize: '2.3 MB',
        uploadDate: '2024-01-15',
        documentType: 'PDF'
      }
    },
    {
      id: '2',
      title: 'Witness Statement',
      description: 'Statement from witness regarding the incident',
      tags: ['witness', 'statement', 'testimony'],
      confidence: 0.72,
      metadata: {
        pages: 5,
        recordedBy: 'John Smith',
        dateOfStatement: '2024-01-10'
      }
    },
    {
      id: '3',
      title: 'Email Correspondence',
      description: 'Chain of emails between involved parties',
      tags: ['email', 'communication', 'evidence'],
      metadata: {
        emailCount: 12,
        dateRange: '2024-01-01 to 2024-01-20',
        participants: ['alice@company.com', 'bob@company.com']
      }
    }
  ]);

  const handleAnalyze = async (item: EvidenceItem) => {
    console.log('Analyzing evidence:', item.title);
    // The analysis is handled by the component's handleAnalyze function
  };

  const handleEdit = async (item: EvidenceItem) => {
    console.log('Editing evidence:', item.title);
    // Implement edit functionality
  };

  const handleDelete = async (item: EvidenceItem) => {
    console.log('Deleting evidence:', item.title);
    evidenceItems = evidenceItems.filter(e => e.id !== item.id);
  };
</script>

<svelte:head>
  <title>Evidence Canvas Demo - Legal AI Platform</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white p-8">
  <div class="max-w-6xl mx-auto">
    <header class="mb-8">
      <h1 class="text-3xl font-bold mb-2">Evidence Canvas Demo</h1>
      <p class="text-gray-400">
        Interactive evidence management with AI-powered analysis.
        Click on any evidence item to view details and trigger AI analysis.
      </p>
    </header>

    <div class="bg-gray-800 rounded-lg p-6">
      <EvidenceCanvas
        {evidenceItems}
        onAnalyze={handleAnalyze}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>

    <div class="mt-8 text-sm text-gray-500">
      <h3 class="font-semibold mb-2">Features Demonstrated:</h3>
      <ul class="space-y-1">
        <li>• Responsive grid layout with auto-fill columns</li>
        <li>• Interactive evidence cards with hover effects</li>
        <li>• Detailed modal dialogs with metadata display</li>
        <li>• AI confidence visualization with gradient progress bars</li>
        <li>• Real-time AI analysis with loading states</li>
        <li>• Structured analysis results (summary, key points, recommendations)</li>
        <li>• Keyboard and accessibility support</li>
        <li>• WebGPU-ready architecture for future GPU acceleration</li>
      </ul>
    </div>
  </div>
</div>
