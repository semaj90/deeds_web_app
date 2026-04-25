# Schema Syntax Fix - Drizzle Relations

## Issue Fixed (Nov 1, 2025)

**Error**: `Expected ":" but found "one"` in schema-postgres.ts line 1328

## Root Cause

Our earlier syntax fixer (`fix-colon-syntax.ps1`) was too aggressive and removed colons from Drizzle ORM relation definitions.

### What Happened

**Incorrect pattern** (what our fixer created):
```typescript
export const evidenceRelations = relations(evidence, ({ one }) => ({
  uploadedBy: one(users, { ... }),
  case one(cases, { ... }),  // ❌ Missing colon!
}));
```

**Correct pattern** (what Drizzle expects):
```typescript
export const evidenceRelations = relations(evidence, ({ one }) => ({
  uploadedBy: one(users, { ... }),
  case: one(cases, { ... }),  // ✅ Colon required for object property
}));
```

## Files Fixed (11 total)

1. `cases-schema.ts` - 4 occurrences
2. `drizzle-vector-config.ts` - 2 occurrences
3. `relations.ts` - 1 occurrence
4. `schema-canvas.ts` - 5 occurrences
5. `schema-new.ts` - 4 occurrences
6. `schema-pgvector-512.ts` - 1 commented occurrence
7. `schema-postgres-enhanced.ts` - 2 occurrences
8. `schema-postgres.ts` - 6 occurrences
9. `schema-sqlite.ts` - 2 occurrences
10. `schema-unified.ts` - 1 occurrence
11. `unified-schema.ts` - 5 occurrences

## Fix Applied

```powershell
# Pattern: case one( → case: one(
$content = $content -replace '(\s+)case\s+one\(', '$1case: one('
```

## Why This Matters

In JavaScript/TypeScript object literals, property names require colons:
```typescript
{
  propertyName: value,  // ✅ Correct
  propertyName value,   // ❌ Syntax error
}
```

Drizzle uses object syntax for relation definitions, so `case:` is a property name, not a switch statement.

## Prevention

Updated the syntax fixer to be more context-aware:
- Only fix `case:` in switch statements
- Preserve `case:` in object literals
- Check for surrounding context (braces vs switch blocks)

## Verification

After fix:
- ✅ No esbuild transform errors
- ✅ Dev server compiles successfully
- ✅ Database relations work correctly

## Quick Fix Command

If this happens again:
```powershell
# Fix all schema files
Get-ChildItem -Path src/lib/server/db -Include *.ts -Recurse | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  $content = $content -replace '(\s+)case\s+one\(', '$1case: one('
  Set-Content $_.FullName $content -NoNewline
}
```
