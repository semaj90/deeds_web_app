<script lang="ts">
  // Svelte 5 runes are auto-imported
  import Button from '$lib/components/ui/enhanced-bits.svelte'; // Changed from default to named import
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Book from 'lucide-svelte/icons/book';
  import Clock from 'lucide-svelte/icons/clock';
  import Download from 'lucide-svelte/icons/download';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import HelpCircle from 'lucide-svelte/icons/help-circle';
  import Info from 'lucide-svelte/icons/info';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Play from 'lucide-svelte/icons/play';
  import Search from 'lucide-svelte/icons/search';
  import Star from 'lucide-svelte/icons/star';
  import UserIcon from 'lucide-svelte/icons/user'; // Renamed from User as UserIcon
  import Video from 'lucide-svelte/icons/video';

  interface HelpArticle {
    id: string;
    title: string;
    category: string;
    content: string;
    tags: string[];
    lastUpdated: string;
    helpful?: number;
    description: string;
    duration: string;
    popularity: number;
    type: string;
  }
  // Help state
  let activeCategory = $state('getting-started');
  let searchQuery = $state('');
  // Help categories
  const categories = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: Star,
      description: 'New to the system? Start here',
    },
    {
      id: 'cases',
      title: 'Case Management',
      icon: Book,
      description: 'Managing and organizing cases',
    },
    {
      id: 'evidence',
      title: 'Evidence Handling',
      icon: Search,
      description: 'Evidence collection and analysis',
    },
    {
      id: 'ai-assistant',
      title: 'AI Assistant',
      icon: MessageSquare,
      description: 'Using AI features effectively',
    },
    {
      id: 'advanced',
      title: 'Advanced Features',
      icon: UserIcon,
      description: 'Power user features and tips',
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      icon: AlertTriangle,
      description: 'Common issues and solutions',
    },
  ] as const;
  // Help articles
  const articles = [
    // Getting Started
    {
      id: 'quick-start',
      category: 'getting-started',
      title: 'Quick Start Guide',
      description: 'Get up and running in 5 minutes',
      type: 'article',
      duration: '5 min read',
      popularity: 5,
      tags: ['getting-started', 'tutorial', 'basics'],
      lastUpdated: '2024-01-15',
      content: `
  # Quick Start Guide
  Welcome to the Legal Case Management System! This guide will help you get started quickly.
  ## Step 1: Set Up Your Profile
  1. Navigate to Settings > Profile
  2. Fill in your basic information
  3. Upload a profile picture (optional)
  4. Set your role and department
  ## Step 2: Create Your First Case
  1. Go to Cases > New Case
  2. Enter case title and description
  3. Set priority and status
  4. Save the case
  ## Step 3: Add Evidence
  1. Open your case
  2. Click: "Add Evidence"
  3. Upload files or enter evidence descriptions
  4. Tag and categorize evidence
  ## Step 4: Use AI Assistant
  1. Navigate to AI Assistant
  2. Ask questions about your cases
  3. Get analysis and recommendations
  4. Export AI responses for documentation
  ## Next Steps
  - Explore the analytics dashboard
  - Set up notifications
  - Learn about advanced search features
  			`,
    },
    {
      id: 'navigation-tour',
      category: 'getting-started',
      title: 'System Navigation Tour',
      description: 'Learn how to navigate the interface',
      type: 'interactive',
      duration: '10 min',
      popularity: 4,
      tags: [],
      lastUpdated: '2024-01-15',
      content: `
  # System Navigation Tour
  ## Main Navigation
  The top navigation bar contains links to all major sections:
  - **Dashboard**: Overview of your work
  - **Search**: Find cases and evidence
  - **Cases**: Manage case files
  - **Analytics**: View performance metrics
  - **Evidence**: Handle evidence items
  - **Export/Import**: Data management
  - **AI Assistant**: Get AI help
  ## Keyboard Shortcuts
  Press \`Ctrl + H\` to see all keyboard shortcuts, including:
  - \`Ctrl + K\`: Quick search
  - \`Ctrl + N\`: New evidence
  - \`Ctrl + S\`: Save current work
  - \`F11\`: Toggle fullscreen
  ## User Menu
  Click your profile picture (top right) to access:
  - User settings
  - Preferences
  - Logout
  			`,
    },
    {
      id: 'first-case',
      category: 'getting-started',
      title: 'Creating Your First Case',
      description: 'Step-by-step case creation walkthrough',
      type: 'video',
      duration: '8 min',
      popularity: 5,
      tags: [],
      lastUpdated: '2024-01-15',
      content: `
  # Creating Your First Case
  ## Video Tutorial
  import type { Case } from '$lib/types';
  [Play Video: CaseCreation Walkthrough] (8 minutes)
  ## Written Steps
  1. **Navigate to Cases**
   - Click: "Cases" in the main navigation
   - Click: "New Case" button
  2. **Fill Case Details**
   - Enter a descriptive title
   - Add detailed description
   - Set appropriate priority level
   - Choose initial status
  3. **Add Participants**
   - Click: "Add Participant"
   - Enter names and roles
   - Add contact information
  4. **Organize with Tags**
   - Add relevant tags for categorization
   - Use consistent tagging for easy search
  5. **Save and Continue**
   - Save your case
   - Begin adding evidence immediately
  			`,
    },
    // Case Management
    {
      id: 'case-organization',
      category: 'cases',
      title: 'Case Organization Best Practices',
      description: 'How to structure and organize cases effectively',
      type: 'article',
      duration: '7 min read',
      popularity: 4,
      tags: [],
      content: `
  # Case Organization Best Practices
  ## Naming Conventions
  Use consistent naming patterns:
  - Include case number/ID
  - Add date in YYYY-MM-DD format
  - Use descriptive keywords
  - Example: "2024-01-15_FraudInvestigation_SmithCorp"
  ## Status Management
  Maintain clear status progression
  - **New**: Recently created cases
  - **Active**: Currently being investigated
  - **Pending**: Waiting for information/action
  - **Closed**: Investigation complete
  - **Suspended**: Temporarily halted
  ## Priority Levels
  Set appropriate priorities:
  - **Urgent**: Immediate attention required
  - **High**: Important, handle soon
  - **Medium**: Standard priority
  - **Low**: Handle when time permits
  ## Documentation Standards
  - Keep detailed case notes
  - Document all actions taken
  - Include timestamps on updates
  - Use consistent terminology
  			`,
    },
    // Evidence
    {
      id: 'evidence-best-practices',
      category: 'evidence',
      title: 'Evidence Handling Best Practices',
      description: 'Proper evidence collection and management',
      type: 'article',
      duration: '10 min read',
      popularity: 5,
      tags: [],
      content: `
  # Evidence Handling Best Practices
  ## Chain of Custody
  Maintain proper documentation
  1. Record who collected evidence
  2. Document when and where collected
  3. Note any transfers of custody
  4. Keep detailed handling logs
  ## File Organization
  Structure your evidence files:
  - Use descriptive filenames
  - Include dates and evidence numbers
  - Organize by evidence type
  - Maintain backup copies
  ## Metadata Management
  Record important details:
  - Source information
  - Collection method
  - File integrity hashes
  - Analysis results
  ## Security Considerations
  - Encrypt sensitive files
  - Control access permissions
  - Regular backup procedures
  - Audit trail maintenance
  			`,
    },
    // AI Assistant
    {
      id: 'ai-prompting',
      category: 'ai-assistant',
      title: 'Effective AI Prompting Techniques',
      description: 'How to get better results from the AI assistant',
      type: 'article',
      duration: '8 min read',
      popularity: 4,
      tags: [],
      content: `
  # Effective AI Prompting Techniques
  ## Clear and Specific Queries
  Be specific about what you need:
  - ❌ "Help with case"
  - ✅ "Analyze evidence patterns in fraud case #2024-001"
  ## Provide Context
  Include relevant background:
  - Case type and details
  - Specific evidence items
  - Timeline information
  - Relevant legal precedents
  ## Ask Follow-up Questions
  Build on previous responses:
  - "Can you elaborate on point 3?"
  - "What additional evidence would strengthen this?"
  - "How does this compare to similar cases?"
  ## Use the Right Question Types
  - **Analysis**: "What patterns do you see in this evidence?"
  - **Recommendations**: "What should I investigate next?"
  - **Explanations**: "Explain the legal implications of..."
  - **Summaries**: "Summarize the key findings in this case"
  			`,
    },
    // Troubleshooting
    {
      id: 'common-issues',
      category: 'troubleshooting',
      title: 'Common Issues and Solutions',
      description: 'Solutions to frequently encountered problems',
      type: 'article',
      duration: '6 min read',
      popularity: 3,
      tags: [],
      content: `
  # Common Issues and Solutions
  ## Login Problems
  **Issue**: Cannot log in to the system
  **Solutions**:
  1. Check username/password spelling
  2. Clear browser cache and cookies
  3. Try incognito/private browsing mode
  4. Contact system administrator
  ## File Upload Issues
  **Issue**: Cannot upload evidence files
  **Solutions**:
  1. Check file size (max 50MB)
  2. Verify file format is supported
  3. Ensure stable internet connection
  4. Try different browser
  ## Performance Issues
  **Issue**: System running slowly
  **Solutions**:
  1. Close unnecessary browser tabs
  2. Clear browser cache
  3. Check internet connection speed
  4. Update to latest browser version
  ## Search Not Working
  **Issue**: Search returns no results
  **Solutions**:
  1. Check spelling and try synonyms
  2. Remove filters and try again
  3. Use broader search terms
  4. Try advanced search options
  			`,
    },
  ];
  // FAQ items
  const faqs = [
    {
      question: 'How do I reset my password?',
      answer:
        'Go to Settings > Security > Change Password. Enter your current password and new password twice.',
    },
    {
      question: 'Can I export my case data?',
      answer: 'Yes! Go to Export > Select data types > Choose format (JSON, CSV, XML) > Download.',
    },
    {
      question: 'How do I use keyboard shortcuts?',
      answer:
        'Press Ctrl+H to see all available shortcuts. Common ones include Ctrl+K for search and Ctrl+N for new evidence.',
    },
    {
      question: 'What file types are supported for evidence?',
      answer:
        'Most common formats are supported: PDF, DOCX, TXT, JPG, PNG, MP4, MP3, and many others.',
    },
    {
      question: 'How do I collaborate with team members?',
      answer:
        'Add participants to cases, use shared notes, and enable notifications to keep everyone informed.',
    },
  ];

  const filteredArticles = $derived(() => {
    let results = articles;
    // Filter by category
    if (activeCategory !== 'all') {
      results = results.filter((article) => article.category === activeCategory);
    }
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.description.toLowerCase().includes(query) ||
          article.content.toLowerCase().includes(query)
      );
    }
    // Sort by popularity
    results = results.sort((a, b) => b.popularity - a.popularity);
    return results;
  });

  function getTypeIcon(type: string) {
    switch (type) {
      case 'video':
        return Video;
      case 'interactive':
        return Play;
      default:
        return Book;
    }
  }
  function getTypeColor(type: string) {
    switch (type) {
      case 'video':
        return 'text-red-600';
      case 'interactive':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  }
</script>

<svelte:head>
  <title>Help & Support - Legal Case Management</title>
  <meta name="description" content="Help documentation, tutorials, and support resources" />
</svelte:head>
<div class="container mx-auto p-6 max-w-7xl">
  <!-- Header -->
  <div class="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 rounded-lg mb-6">
    <h1 class="text-3xl font-bold mb-2 flex items-center gap-3">
      <HelpCircle class="h-8 w-8" />
      Help & Support
    </h1>
    <p class="text-green-100">
      Documentation, tutorials, and support resources to help you succeed
    </p>
  </div>
  <!-- Search -->
  <div class="bg-white rounded-lg shadow-md p-6 mb-6">
    <div class="relative max-w-2xl mx-auto">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search help articles, tutorials, and FAQs..."
        class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
      />
    </div>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <!-- Categories Sidebar -->
    <div class="lg:col-span-1">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-lg font-semibold mb-4">Categories</h2>
        <nav class="space-y-2">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors"
            class:bg-green-100={activeCategory === 'all'}
            class:text-green-700={activeCategory === 'all'}
            class:hover:bg-gray-100={activeCategory !== 'all'}
            onclick={() => (activeCategory = 'all')}
          >
            <Book class="h-5 w-5" />
            <div>
              <div class="font-medium">All Articles</div>
              <div class="text-xs text-gray-500">
                {articles.length} articles
              </div>
            </div>
          </button>
          {#each Array.isArray(categories) ? categories : [] as category}
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors"
              class:bg-green-100={activeCategory === category.id}
              class:text-green-700={activeCategory === category.id}
              class:hover:bg-gray-100={activeCategory !== category.id}
              onclick={() => (activeCategory = category.id)}
            >
              <!-- <svelte:component> is deprecated in runes mode -->
              {category.icon({ class: 'h-5 w-5' })}
              <div>
                <div class="font-medium">{category.title}</div>
                <div class="text-xs text-gray-500">{category.description}</div>
              </div>
            </button>
          {/each}
        </nav>
      </div>
      <!-- Quick Actions -->
      <div class="bg-white rounded-lg shadow-md p-6 mt-6">
        <h3 class="text-lg font-semibold mb-4">Need More Help?</h3>
        <div class="space-y-3">
          <Button variant="ghost" class="w-full justify-start bits-btn">
            <!-- Removed duplicate: 'bits-btn' -->
            <MessageSquare class="h-4 w-4 mr-2" />
            Contact Support
          </Button>
          <Button variant="ghost" class="w-full justify-start bits-btn">
            <!-- Removed duplicate: 'bits-btn' -->
            <Video class="h-4 w-4 mr-2" />
            Video Tutorials
          </Button>
          <Button variant="ghost" class="w-full justify-start bits-btn">
            <!-- Removed duplicate: 'bits-btn' -->
            <Download class="h-4 w-4 mr-2" />
            User Manual (PDF)
          </Button>
        </div>
      </div>
    </div>
    <!-- Main Content -->
    <div class="lg:col-span-3 space-y-6">
      <!-- Articles -->
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="bg-gray-50 border-b border-gray-200 p-4">
          <h2 class="text-lg font-semibold">
            {activeCategory === 'all'
              ? 'All Articles'
              : categories.find((c) => c.id === activeCategory)?.title}
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''} found
          </p>
        </div>
        {#if filteredArticles.length > 0}
          <div class="divide-y divide-gray-200">
            {#each Array.isArray(filteredArticles) ? filteredArticles : [] as article}
              <div class="p-6 hover:bg-gray-50 transition-colors">
                <div class="flex items-start gap-4">
                  <div class="flex-shrink-0 mt-1">
                    <!-- <svelte:component> is deprecated in runes mode -->
                    {getTypeIcon(article.type)({ class: `h-6 w-6 ${getTypeColor(article.type)}` })}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-lg font-medium text-gray-900 mb-2">
                      {article.title}
                    </h3>
                    <p class="text-gray-600 text-sm mb-3">
                      {article.description}
                    </p>
                    <div class="flex items-center gap-4 text-sm text-gray-500 mb-4">
                      <div class="flex items-center gap-1">
                        <Clock class="h-4 w-4" />
                        {article.duration}
                      </div>
                      <div class="flex items-center gap-1">
                        <Star class="h-4 w-4" />
                        {article.popularity}/5
                      </div>
                      <div class="capitalize">
                        {article.type}
                      </div>
                    </div>
                    <!-- Article preview -->
                    <div class="prose prose-sm max-w-none text-gray-700 mb-4">
                      {@html article.content
                        .split('\n')
                        .slice(0, 3)
                        .join('\n')
                        .substring(0, 200)}...
                    </div>
                    <Button class="bits-btn" variant="ghost" size="sm">
                      <!-- Removed duplicate: 'bits-btn' -->
                      <Book class="h-4 w-4 mr-2" />
                      Read Full Article
                      <ArrowRight class="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="p-12 text-center">
            <Search class="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
            <p class="text-gray-600">
              Try adjusting your search terms or browse different categories
            </p>
          </div>
        {/if}
      </div>
      <!-- FAQ Section -->
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-lg font-semibold mb-6 flex items-center gap-2">
          <MessageSquare class="h-6 w-6" />
          Frequently Asked Questions
        </h2>
        <div class="space-y-4">
          {#each Array.isArray(faqs) ? faqs : [] as faq}
            <details class="group">
              <summary
                class="flex justify-between items-center w-full p-4 text-left bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
              >
                <span class="font-medium text-gray-900">{faq.question}</span>
                <ArrowRight
                  class="h-5 w-5 text-gray-400 group-open:rotate-90 transition-transform"
                />
              </summary>
              <div class="mt-3 p-4 text-gray-700 bg-gray-50 rounded-lg">
                {faq.answer}
              </div>
            </details>
          {/each}
        </div>
      </div>
      <!-- Contact Support -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div class="flex items-start gap-4">
          <Info class="h-6 w-6 text-blue-600 mt-1" />
          <div>
            <h3 class="font-medium text-blue-900 mb-2">Still need help?</h3>
            <p class="text-blue-700 text-sm mb-4">
              Can't find what you're looking for? Our support team is here to help you succeed.
            </p>
            <div class="flex gap-3">
              <Button class="bits-btn" variant="ghost" size="sm">
                <!-- Removed duplicate: 'bits-btn' -->
                <MessageSquare class="h-4 w-4 mr-2" />
                Start Live Chat
              </Button>
              <Button class="bits-btn" variant="ghost" size="sm">
                <!-- Removed duplicate: 'bits-btn' -->
                <ExternalLink class="h-4 w-4 mr-2" />
                Submit Ticket
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* @unocss-include */
  .prose {
    max-width: none;
  }
  .prose :global(h1) {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  .prose :global(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    margin-top: 1.5rem;
  }
  .prose :global(p) {
    margin-bottom: 1rem;
    line-height: 1.6;
  }
  .prose :global(ul) {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }
  .prose :global(li) {
    margin-bottom: 0.5rem;
  }
</style>
