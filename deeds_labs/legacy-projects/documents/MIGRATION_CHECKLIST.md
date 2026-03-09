# Migration Checklist

This checklist helps ensure database access follows the project's "API-Route Access Only" rule.

### Migration Checklist

- [ ] All `+page.server.ts` files have NO database imports
- [ ] All `+layout.server.ts` files have NO database imports
- [ ] All database access is in `+server.ts` endpoint handlers
- [ ] All endpoints return typed responses
- [ ] All endpoints include error handling with try-catch
- [ ] All endpoints return appropriate HTTP status codes (200, 201, 400, 500)
- [ ] All responses include timestamp
- [ ] Input validation happens on server side

### Key Rules

1. **Location Rule**: Database access ONLY in `src/routes/api/**/*.ts` (+server.ts files)
2. **Type Rule**: All responses must use type definitions from `$lib/types`

---

Add this file to the repo root and use it as a reference when migrating or reviewing endpoints.
