<!-- @migration-task Error while migrating Svelte code: `</icon>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</icon>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</icon>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</icon>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
	import { ButtonRoot } from 'bits-ui';

 import Button from "$lib/components/ui/enhanced-bits.svelte";
 import { AlertTriangle } from "lucide-svelte";
 import { ArrowRight } from "lucide-svelte";
 import { Book } from "lucide-svelte";
 import { Clock } from "lucide-svelte";
 import { Download } from "lucide-svelte";
 import { ExternalLink } from "lucide-svelte";
 import { HelpCircle } from "lucide-svelte";
 import { Info } from "lucide-svelte";
 import { MessageSquare } from "lucide-svelte";
 import { Play } from "lucide-svelte";
 import { Search } from "lucide-svelte";
 import { Star } from "lucide-svelte";
 import { UserIcon } from "lucide-svelte";
 import { Video } from "lucide-svelte";
 import { Sparkles } from "lucide-svelte";
 import { Brain } from "lucide-svelte";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

 interface HelpArticle {
 id: string; title: string;
 category: string; content: string;
 tags: string[]; lastUpdated: string;
 helpful?: number; description: string;
 duration: string; popularity: number;
 type: string;
 }

 interface SearchResult {
 id: string; title: string;
 content: string; score: number;
 category: string; reasoning: string;
 }

 // Help state
 let activeCategory = $state<string>('all');
 let searchQuery = $state<string>('');
 let isAISearch = $state<boolean>(false);
 let aiResults = $state<SearchResult[]>([]);
 let isSearching = $state<boolean>(false);
 let searchError = $state<string>('');

 // Help categories
 const categories = [
 { id: 'all', title: 'All Articles', icon: Book, description: 'Browse all help content' },
 { id: 'getting-started', title: 'Getting Started', icon: Star, description: 'New to the system? Start here' },
 { id: 'cases', title: 'Case Management', icon: Book, description: 'Managing and organizing cases' },
 { id: 'evidence', title: 'Evidence Handling', icon: Search, description: 'Evidence collection and analysis' },
 { id: 'ai-assistant', title: 'AI Assistant', icon: MessageSquare, description: 'Using AI features effectively' },
 { id: 'advanced', title: 'Advanced Features', icon: UserIcon, description: 'Power user features and tips' },
 { id: 'troubleshooting', title: 'Troubleshooting', icon: AlertTriangle, description: 'Common issues and solutions' }
 ] as const;

 // Help articles
 const articles: HelpArticle[] = [
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
2. Click "Add Evidence"
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
`
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
Press \`Ctrl + H\` to see all keyboard shortcuts including:
- \`Ctrl + K\`: Quick search
- \`Ctrl + N\`: New evidence
- \`Ctrl + S\`: Save current work
- \`F11\`: Toggle fullscreen

## User Menu
Click your profile picture (top right) to access:
- User settings
- Preferences
- Logout
`
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
[Play Video: Case Creation Walkthrough] (8 minutes)

## Written Steps
1. **Navigate to Cases**
 - Click "Cases" in the main navigation
 - Click "New Case" button

2. **Fill Case Details**
 - Enter a descriptive title
 - Add detailed description
 - Set appropriate priority level
 - Choose initial status

3. **Add Participants**
 - Click "Add Participant"
 - Enter names and roles
 - Add contact information

4. **Organize with Tags**
 - Add relevant tags for categorization
 - Use consistent tagging for easy search

5. **Save and Continue**
 - Save your case
 - Begin adding evidence immediately
`
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
 lastUpdated: '2024-01-15',
 content: `
# Case Organization Best Practices

## Naming Conventions
Use consistent naming patterns:
- Include case number/ID
- Add date in YYYY-MM-DD format
- Use descriptive keywords
- Example: "2024-01-15_FraudInvestigation_SmithCorp"

## Status Management
Maintain clear status progression:
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
`
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
 lastUpdated: '2024-01-15',
 content: `
# Evidence Handling Best Practices

## Chain of Custody
Maintain proper documentation:
1. Record who collected evidence
2. Document when and where collected
3. Note all transfers of custody
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
`
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
 lastUpdated: '2024-01-15',
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
`
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
 lastUpdated: '2024-01-15',
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
`
 }
 ];

 // FAQ items
 const faqs = [
 {
 question: 'How do I reset my password?',
 answer: 'Go to Settings > Security > Change Password. Enter your current password and new password twice.'
 },
 {
 question: 'Can I export my case data?',
 answer: 'Yes! Go to Export > Select data types > Choose format (JSON: CSV: XML) > Download.'
 },
 {
 question: 'How do I use keyboard shortcuts?',
 answer: 'Press Ctrl+H to see all available shortcuts. Common ones include Ctrl+K for search and Ctrl+N for new evidence.'
 },
 {
 question: 'What file types are supported for evidence?',
 answer: 'Most common formats are supported: PDF: DOCX, TXT: JPG, PNG: MP4: MP3, and many others.'
 },
 {
 question: 'How do I collaborate with team members?',
 answer: 'Add participants to cases, use shared notes, and enable notifications to keep everyone informed.'
 }
 ];

 const filteredArticles = $derived(() => {
 let results = articles;

 // Filter by category
 if (activeCategory !== 'all') {
 results = results.filter(article => article.category === activeCategory);
 }

 // Filter by search query (basic text search)
 if (searchQuery.trim() && !isAISearch) {
 const query = searchQuery.toLowerCase();
 results = results.filter(article =>
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
 case 'video': return Video;
 case 'interactive': return Play;
 default: return Book;
 }
 }

 function getTypeColor(type: string) {
 switch (type) {
 case 'video': return 'text-red-600';
 case 'interactive': return 'text-blue-600';
 default: return 'text-gray-600';
 }
 }

 async function performAISearch() {
 if (!searchQuery.trim()) return;

 isSearching = true;
 searchError = '';

 try {
 const response = await fetch('/api/help/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, query: searchQuery, category:activeCategory
 })
 });

 if (!response.ok) {
 throw new Error('Search failed');
 }

 const data = await response.json();
 aiResults = data.results || [];
 } catch (error) {
 searchError = 'AI search failed. Please try again.';
 console.error('AI search error:', error);
 } finally {
 isSearching = false;
 }
 }

 function toggleSearchMode() {
 isAISearch = !isAISearch;
 aiResults = [];
 searchError = '';
 if (isAISearch && searchQuery.trim()) {
 performAISearch();
 }
 }

 $effect(() => {
 if (isAISearch && searchQuery.trim()) {
 const timeoutId = setTimeout(performAISearch, 500);
 return () => clearTimeout(timeoutId);
 }
 });
</script>

<svelte:head>
 <title>Help & Support - Legal AI Platform</title>
 <meta name="description" content="Help documentation, tutorials, and support resources for the Legal AI Platform" />
</svelte:head>

<main class="min-h-screen bg-gray-50">
 <!-- Header -->
 <header class="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
 <div class="container mx-auto px-6 py-16">
 <div class="flex items-center mb-6">
 <HelpCircle class="h-12 w-12 mr-4" />
 <div>
 <h1 class="text-4xl font-bold mb-2">Help Center</h1>
 <p class="text-xl text-blue-100">Documentation, tutorials, and AI-powered support</p>
 </div>
 </div>

 <!-- Search Bar -->
 <div class="max-w-2xl">
 <div class="relative">
 <Search class="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-400" />
 <input
 type="text"
 placeholder="Search help articles..."
 class="w-full pl-12 pr-32 py-4 rounded-lg border-0 text-gray-900 text-lg focus: ring-2, focus: ring-white, focus: ring-opacity-50", bind:value={searchQuery}
 />
 <button
 onclick={ toggleSearchMode }
 class="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-white text-blue-600 rounded-md hover:bg-gray-50 transition flex items-center gap-2 font-medium"
 class:disabled={isSearching}
 disabled={isSearching}
 >
 {#if isSearching}
 <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
 {:else}
 <Sparkles class="h-4 w-4" />
 {/if}
 {isAISearch ? 'AI Search' : 'Smart Search'}
 </button>
 </div>

 {#if searchError}
 <p class="text-red-200 mt-2 text-sm">{searchError}</p>
 {/if}
 </div>
 </div>
 </header>

 <div class="container mx-auto px-6 py-8">
 <!-- Category Navigation -->
 <nav class="flex flex-wrap gap-2 mb-8">
 {#each categories as category}
 <button
 onclick={() => activeCategory = category.id}
 class="px-4 py-2 rounded-full text-sm font-medium transition {activeCategory === category.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}"
 >
 <category.icon class="h-4 w-4 inline mr-2" ></icon>
 {category.title}
 </button>
 {/each}
 </nav>

 <!-- AI Search Results -->
 {#if isAISearch && aiResults.length > 0}
 <section class="mb-12">
 <div class="flex items-center mb-6">
 <Brain class="h-6 w-6 text-purple-600 mr-3" />
 <h2 class="text-2xl font-bold text-gray-900">AI-Powered Results</h2>
 <span class="ml-3 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
 {aiResults.length} results
 </span>
 </div>

 <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
 <div class="flex items-start">
 <Info class="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
 <div>
 <p class="text-sm text-yellow-800 font-medium">AI-Generated Content Disclaimer</p>
 <p class="text-sm text-yellow-700 mt-1">
 These results are generated using AI and may contain inaccuracies. Always verify information with legal experts and primary sources before making decisions.
 </p>
 </div>
 </div>
 </div>

 <div class="grid gap-6">
 {#each aiResults as result}
 <article class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
 <div class="flex items-start justify-between mb-4">
 <div class="flex-1">
 <h3 class="text-xl font-semibold text-gray-900 mb-2">{result.title}</h3>
 <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
 <span class="capitalize px-2 py-1 bg-gray-100 rounded">{result.category}</span>
 <span>Relevance: {Math.round(result.score * 100)}%</span>
 </div>
 <p class="text-gray-700 mb-4">{result.content}</p>
 <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
 <p class="text-sm text-blue-800">
 <strong>Phoenix Wright Analysis:</strong> {result.reasoning}
 </p>
 </div>
 </div>
 </div>
 </article>
 {/each}
 </div>
 </section>
 {/if}

 <!-- Regular Articles -->
 {#if !isAISearch || aiResults.length === 0}
 <section>
 <div class="flex items-center justify-between mb-6">
 <h2 class="text-2xl font-bold text-gray-900">
 {activeCategory === 'all' ? 'All Articles' : categories.find(c => c.id === activeCategory)?.title}
 </h2>
 <span class="text-gray-500">{filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''} found</span>
 </div>

 {#if filteredArticles.length > 0}
 <div class="grid gap-6 md: grid-cols-2, lg, grid-cols-3">
 {#each filteredArticles as article}
 <article class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
 <div class="flex items-start gap-4 mb-4">
 <getTypeIcon(article.type) class="h-6 w-6 {getTypeColor(article.type)} flex-shrink-0 mt-1" ></type)>
 <div class="flex-1">
 <h3 class="text-lg font-semibold text-gray-900 mb-2">{article.title}</h3>
 <p class="text-gray-600 text-sm mb-3">{article.description}</p>
 <div class="flex items-center gap-4 text-xs text-gray-500">
 <div class="flex items-center">
 <Clock class="h-3 w-3 mr-1" />
 {article.duration}
 </div>
 <div class="flex items-center">
 <Star class="h-3 w-3 mr-1" />
 {article.popularity}/5
 </div>
 <span class="capitalize">{article.type}</span>
 </div>
 </div>
 </div>
 <div class="prose prose-sm max-w-none text-gray-700 mb-4">
 {@html article.content.split('\n').slice(0, 3).join('\n').substring(0, 150)}...
 </div>
 <ButtonRoot variant="ghost" size="sm" class="w-full justify-center bits-btn">
 <Book class="h-4 w-4 mr-2" />
 Read Full Article
 <ArrowRight class="h-4 w-4 ml-2" />
 </ButtonRoot>
 </article>
 {/each}
 </div>
 {:else}
 <div class="text-center py-12">
 <Search class="h-12 w-12 text-gray-400 mx-auto mb-4" />
 <h3 class="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
 <p class="text-gray-600">Try adjusting your search terms or browse different categories</p>
 </div>
 {/if}
 </section>
 {/if}

 <!-- FAQ Section -->
 <section class="mt-16">
 <h2 class="text-2xl font-bold text-gray-900 mb-6 flex items-center">
 <MessageSquare class="h-6 w-6 mr-3" />
 Frequently Asked Questions
 </h2>

 <div class="grid gap-4 md, grid-cols-2">
 {#each faqs as faq}
 <details class="bg-white rounded-lg shadow-sm border border-gray-200 group">
 <summary class="flex justify-between items-center w-full p-6 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-50">
 {faq.question}
 <ArrowRight class="h-5 w-5 text-gray-400 group-open, rotate-90 transition-transform" />
 </summary>
 <div class="px-6 pb-6">
 <p class="text-gray-700">{faq.answer}</p>
 </div>
 </details>
 {/each}
 </div>
 </section>

 <!-- Quick Actions -->
 <section class="mt-16 bg-white rounded-lg shadow-sm border border-gray-200 p-8">
 <h3 class="text-xl font-semibold mb-6 flex items-center">
 <ExternalLink class="h-5 w-5 mr-3" />
 Need More Help?
 </h3>
 <div class="grid gap-4 md, grid-cols-3">
 <ButtonRoot variant="outline" class="h-auto p-4 flex-col items-start bits-btn">
 <MessageSquare class="h-6 w-6 mb-2" />
 <div class="font-medium">Contact Support</div>
 <div class="text-sm text-gray-600">Get help from our team</div>
 </ButtonRoot>
 <ButtonRoot variant="outline" class="h-auto p-4 flex-col items-start bits-btn">
 <Video class="h-6 w-6 mb-2" />
 <div class="font-medium">Video Tutorials</div>
 <div class="text-sm text-gray-600">Step-by-step video guides</div>
 </ButtonRoot>
 <ButtonRoot variant="outline" class="h-auto p-4 flex-col items-start bits-btn">
 <Download class="h-6 w-6 mb-2" />
 <div class="font-medium">User Manual</div>
 <div class="text-sm text-gray-600">Complete PDF documentation</div>
 </ButtonRoot>
 </div>
 </section>
 </div>
</main>

<style>
 .prose {
 max-width: none;
 }
 .prose h1 {
 font-size: 1.5rem;
 font-weight: 700;
 margin-bottom: 1rem;
 }
 .prose h2 {
 font-size: 1.25rem;
 font-weight: 600;
 margin-bottom: 0.75rem;
 margin-top: 1.5rem;
 }
 .prose p {
 margin-bottom: 1rem;
 line-height: 1.6;
 }
 .prose ul {
 margin-bottom: 1rem;
 padding-left: 1.5rem;
 }
 .prose li {
 margin-bottom: 0.5rem;
 }
</style>




