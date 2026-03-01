# Report Schema Notes

## Actual Database Schema

The `reports` table has these fields:

```typescript
{
  id: uuid (PK)
  caseId: uuid (FK to cases.id)
  createdBy: uuid (FK to users.id)
  title: varchar(255)
  content: text  // Single field for HTML/text content
  status: reportStatusEnum  // Values: 'draft', 'pending', 'completed', 'published'
  generatedAt: timestamp
  metadata: jsonb  // Flexible JSON storage
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Important Differences from Documentation

1. **No `contentHtml` / `contentJson` fields** - Only a single `content` text field
2. **No `type` field** - Report types (charging_memo, etc.) should be stored in `metadata.reportType`
3. **No `createdByUserId`** - Field is named `createdBy`
4. **No `rawModelOutput`** - Can store in `metadata.rawOutput` if needed

## Recommended Usage

```typescript
// Creating a report
await db.insert(reports).values({
  caseId: '...',
  title: 'Charging Memorandum',
  content: '<h1>...</h1>',  // HTML content
  status: 'draft',
  createdBy: userId,
  metadata: {
    reportType: 'charging_memo',  // Store type here
    template: 'v1',
    aiGenerated: true,
    rawOutput: '...'  // Original LLM output
  }
});
```

## Current Implementation Status

The report routes created in this session use the **documented** field names (contentHtml, type, etc.), not the **actual** schema field names. This causes TypeScript errors.

**TO FIX**: Update all report routes to match actual schema:
- `contentHtml` → `content`
- `type` → `metadata.reportType`
- `createdByUserId` → `createdBy`
- `contentJson` → remove (or store in metadata)
