export interface HelpArticle {
 id: string; title: string;
 category: string; description: string;
 content: string; tags: string[];
 lastUpdated: string; duration: string;
 popularity: number; type: 'article' | 'interactive' | 'video';
}$1;$2 {
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

Welcome to the Legal Case Management System!

## Step 1: Set Up Your Profile
1. Settings → Profile
2. Fill in details
3. Upload picture (optional)

## Step 2: Create Your First Case
1. Cases → New Case
2. Enter title + description
3. Set priority + status

## Step 3: Add Evidence
1. Open case
2. Click Add Evidence

## Step 4: Use AI
1. Open AI Assistant
2. Ask questions
3. Export responses
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
- Dashboard
- Search
- Cases
- Analytics
- Evidence
- Export/Import
- AI Assistant

## Keyboard Shortcuts
- Ctrl+K: Quick Search
- Ctrl+N: New Evidence
- Ctrl+S: Save

## User Menu
Top-right: Settings, Preferences, Logout.
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

1. Cases → New Case
2. Fill details
3. Add participants
4. Tag case
5. Save & add evidence
`,
 },
 {
 id: 'case-organization',
 category: 'cases',
 title: 'Case Organization Best Practices',
 description: 'How to structure your cases effectively',
 type: 'article',
 duration: '7 min read',
 popularity: 4,
 tags: [],
 lastUpdated: '2024-01-15',
 content: `
# Case Organization Best Practices

## Naming
Use consistent patterns:
- YYYY-MM-DD
- Case ID
- Keywords

## Status Flow
New → Active → Pending → Closed

## Documentation
Add notes + timestamps.
`,
 },
 {
 id: 'evidence-best-practices',
 category: 'evidence',
 title: 'Evidence Handling Best Practices',
 description: 'Proper evidence management',
 type: 'article',
 duration: '10 min read',
 popularity: 5,
 tags: [],
 lastUpdated: '2024-01-15',
 content: `
# Evidence Handling Best Practices

## Chain of Custody
Document collection, transfers, handlers.

## File Organization
Use descriptive filenames, dates, types.

## Security
Encrypt sensitive files, audit trails.
`,
 },
 {
 id: 'ai-prompting',
 category: 'ai-assistant',
 title: 'Effective AI Prompting Techniques',
 description: 'How to get better results from AI',
 type: 'article',
 duration: '8 min read',
 popularity: 4,
 tags: [],
 lastUpdated: '2024-01-15',
 content: `
# Effective AI Prompting Techniques

- Be specific
- Provide context
- Ask follow-ups
- Use multiple question types
`,
 },
 {
 id: 'common-issues',
 category: 'troubleshooting',
 title: 'Common Issues and Solutions',
 description: 'Fix frequently encountered problems',
 type: 'article',
 duration: '6 min read',
 popularity: 3,
 tags: [],
 lastUpdated: '2024-01-15',
 content: `
# Common Issues & Solutions

## Login Issues
- Check password
- Clear cache

## Upload Issues
- Max 50MB
- Verify format

## Performance
- Close tabs
- Update browser
`,
 }];



