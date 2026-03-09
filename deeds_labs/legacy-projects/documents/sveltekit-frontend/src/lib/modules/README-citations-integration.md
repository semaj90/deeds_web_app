# Citations Manager Integration Guide

This guide explains how to integrate the authentication-aware citations system once your real authentication is built out.

## Files Created

### Core Module
- `src/lib/modules/citations-manager.ts` - Main citations management class
- `src/lib/modules/auth-demo.ts` - Demo auth (replace with real auth)

### UI Components
- `src/lib/components/citations/CitationsSaveButton.svelte` - Save button component
- `src/routes/citations/+page.svelte` - Updated citations page with auth integration

## Quick Integration

### 1. Replace Demo Auth

Replace the demo auth import in your citations page:

```typescript
// Remove this
import { authDemo } from '$lib/modules/auth-demo';

// Replace with your real auth
import { authService } from '$lib/services/your-real-auth';
```

### 2. Update Authentication Integration

In `citations-manager.ts`, the module expects this interface:

```typescript
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'attorney' | 'paralegal' | 'clerk' | 'admin';
  isAuthenticated: boolean;
}
```

Connect your real auth by calling:

```typescript
citationsManager.setUser(yourAuthUser);
```

### 3. API Integration (Optional)

The current system uses localStorage. To integrate with your backend:

```typescript
// In citations-manager.ts, replace localStorage calls with API calls
async saveCitation(citation: Citation): Promise<boolean> {
  const response = await fetch('/api/citations/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citation, userId: this.currentUser.id })
  });
  return response.ok;
}
```

### 4. Report Integration

To import citations into reports, implement:

```typescript
async importCitationsToReport(citationIds: string[], reportId: string): Promise<boolean> {
  const formatted = this.exportCitations(citationIds, options);

  // Call your report API
  const response = await fetch(`/api/reports/${reportId}/citations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citations: formatted })
  });

  return response.ok;
}
```

## Features Available

### 1. Citation Saving
- Users can save citations to their personal library
- Saved citations persist across sessions
- Visual feedback with save/unsave toggle

### 2. Collections
- Users can create named collections of citations
- Group citations by case, topic, or custom categories
- Collection management UI built-in

### 3. Export Formats
- Bluebook format (legal standard)
- APA, MLA formats
- Custom format
- Include/exclude key points, summaries, notes

### 4. Search & Filter
- Search saved citations by title, content, notes, tags
- Filter by category, court, relevance level
- Filter by collection

### 5. Import to Reports
- Format citations for insertion into documents
- Batch export multiple citations
- Customizable formatting options

## Usage Examples

### Basic Save Button
```svelte
<CitationsSaveButton
  {citation}
  size="sm"
  on:saved={(e) => handleSaved(e.detail)}
  on:error={(e) => handleError(e.detail)}
/>
```

### Get User's Saved Citations
```typescript
const savedCitations = citationsManager.getSavedCitations();
const collections = citationsManager.getCollections();
```

### Search Saved Citations
```typescript
const results = citationsManager.searchSavedCitations('Miranda rights', {
  category: 'Criminal Procedure',
  relevance: 'high'
});
```

### Export for Reports
```typescript
const formatted = citationsManager.exportCitations(
  ['citation-1', 'citation-2'],
  {
    format: 'bluebook',
    includeKeyPoints: true,
    includeSummary: true
  }
);
```

## Current Demo Features

Visit `/citations` and:
1. Click "Demo Sign In" to test authentication
2. Choose a demo user (Attorney or Paralegal)
3. Try saving citations with the save button
4. See saved citations persist when you reload
5. Test collection functionality

## Next Steps

1. Replace `auth-demo.ts` with your real authentication service
2. Optionally replace localStorage with your backend API
3. Integrate the import functionality with your report system
4. Add any custom citation formats your firm uses
5. Consider adding sharing features between users

The module is designed to work with any authentication system and can be gradually enhanced with backend integration while maintaining full functionality.