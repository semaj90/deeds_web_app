# Drizzle Configuration Cleanup

## Problem Analysis

You have multiple Drizzle configurations scattered across different directories because:

1. **Nested Project Structure**: The project has been extracted/moved multiple times, creating nested folders:
   - `Deeds-App-doesn-t-work--main/` (inner extracted folder)
   - `web-app/sveltekit-frontend/` (main working directory)
   - `referenceeeedontUSEweb-app/` (backup/reference folder)
   - `desktop-app/` (different app variant)

2. **Multiple Schema Files**: Different schema files exist for different purposes:
   - `unified-schema.ts` - The canonical, complete schema (CURRENT)
   - `schema.ts` - Re-exports the unified schema (CURRENT)
   - Legacy schema files in various directories (OUTDATED)

## Current Active Configuration

**Primary Working Directory**: `c:\Users\james\Downloads\Deeds-App-doesn-t-work--main (2)\web-app\sveltekit-frontend\`

**Active Drizzle Config**: `web-app\sveltekit-frontend\drizzle.config.ts`
**Active Schema**: `web-app\sveltekit-frontend\src\lib\server\db\unified-schema.ts`

## Recommended Cleanup Actions

### 1. Keep Only Essential Directories
```
c:\Users\james\Downloads\Deeds-App-doesn-t-work--main (2)\
├── web-app\sveltekit-frontend\                    ← KEEP (main app)
├── python-masking-service\                        ← KEEP (PII service)
├── desktop-app\ (if needed)                       ← OPTIONAL
├── referenceeeedontUSEweb-app\                     ← DELETE (backup)
├── Deeds-App-doesn-t-work--main\                  ← DELETE (duplicate)
└── other utility files and configs                ← KEEP
```

### 2. Consolidate Drizzle Configurations
Remove duplicated `drizzle.config.ts` files from:
- Root directory
- Nested duplicate directories
- Reference directories

Keep only:
- `web-app\sveltekit-frontend\drizzle.config.ts` (main)
- `desktop-app\sveltekit-frontend\drizzle.config.ts` (if using desktop app)

### 3. Schema File Hierarchy
```
web-app\sveltekit-frontend\src\lib\server\db\
├── unified-schema.ts      ← Master schema (all tables, relations)
├── schema.ts              ← Re-exports unified schema
└── migrations\            ← Migration files
```

## Fixed User Profile Type

The user profile has been updated with proper TypeScript interface:

```typescript
interface UserProfile {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  role: string;
  isActive: boolean;
  emailVerified?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

This matches the actual database schema in `unified-schema.ts`.

## Next Steps

1. **Clean up directories**: Remove duplicate and reference directories
2. **Verify active config**: Ensure `web-app\sveltekit-frontend\drizzle.config.ts` points to the correct database
3. **Update imports**: Make sure all code imports from the unified schema
4. **Test database connection**: Run a migration to verify everything works

## Migration Command (if needed)
```bash
cd web-app\sveltekit-frontend
npm run db:generate
npm run db:migrate
```
