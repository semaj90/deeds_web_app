# Zod Validation Contracts: Type-Safe Input/Output Validation

**Category:** Data Validation
**Tags:** #zod #validation #schema #typescript #type-safety #api #forms
**Symbols:** `z` `ZodSchema` `safeParse` `parse` `refine` `transform` `infer` `flatten` `ZodError` `ZodIssue`
**Route Kind:** `validation`
**Risk:** `security data-loss`
**Last Updated:** 2025-12-24

---

## Intent

Comprehensive pattern for type-safe data validation using Zod schemas in SvelteKit endpoints and form actions. Provides **compile-time type safety**, **runtime validation**, **standardized error shapes**, and **automatic TypeScript type inference** from schemas.

**One-Sentence Summary:**
Define schema once → Get TypeScript types + runtime validation + error messages automatically.

---

## When to Use

✅ **Use Zod schemas when:**
- API endpoints receive JSON data (POST/PUT/PATCH requests)
- Form actions process user input
- External data needs validation (webhooks, third-party APIs)
- You want automatic TypeScript type inference from validation rules
- You need consistent error message formatting

❌ **Don't use when:**
- Static data that never changes (constants, enums)
- Server-to-server calls with trusted sources (use type assertions)
- Performance-critical hot paths (validation has ~1ms overhead per call)
- Simple string/number checks (use native TypeScript type guards)

---

## Schema Design Patterns

### Basic Schema Structure
```typescript
// $lib/schemas/case.ts
import { z } from 'zod';

// Define schema
export const CreateCaseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10).max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).max(10).optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional()
});

// Infer TypeScript type from schema (no duplicate typing!)
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
// Type is automatically: { title: string; description?: string; priority: 'low' | 'medium' | 'high' | 'critical'; ... }
```

### Schema Composition
```typescript
// Base schemas (reusable parts)
const EmailSchema = z.string().email().toLowerCase();
const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);

// Compose into larger schemas
export const ContactInfoSchema = z.object({
  email: EmailSchema,
  phone: PhoneSchema.optional(),
  preferredContact: z.enum(['email', 'phone']).default('email')
});

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  contact: ContactInfoSchema
});
```

### Input vs Output Schemas
```typescript
// Input schema (what clients send)
export const CreateReportInput = z.object({
  title: z.string().min(5).max(200),
  content: z.string().min(20),
  caseId: z.number().int().positive()
});

// Output schema (what API returns)
export const ReportOutput = z.object({
  id: z.number().int(),
  title: z.string(),
  content: z.string(),
  caseId: z.number(),
  createdAt: z.date(),
  createdBy: z.object({
    id: z.string(),
    username: z.string()
  })
});

// TypeScript types
export type CreateReportInput = z.infer<typeof CreateReportInput>;
export type ReportOutput = z.infer<typeof ReportOutput>;
```

### Partial/Picked/Omitted Schemas
```typescript
// Full schema
const CaseSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'active', 'closed']),
  createdAt: z.date()
});

// Update schema (id required, others optional)
export const UpdateCaseSchema = CaseSchema.partial().required({ id: true });
// Equivalent to: { id: number; title?: string; description?: string; status?: ...; createdAt?: date }

// Pick specific fields
export const CaseSummarySchema = CaseSchema.pick({ id: true, title: true, status: true });

// Omit fields
export const PublicCaseSchema = CaseSchema.omit({ createdAt: true });
```

---

## Validation in Endpoints

### Basic Validation Pattern
```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import { CreateCaseSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Parse request body
  const body = await request.json();

  // Validate with safeParse (returns success/error object)
  const validation = CreateCaseSchema.safeParse(body);

  if (!validation.success) {
    // Standardized error response
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  // Type-safe validated data
  const { title, description, priority } = validation.data;

  // ... business logic with validated data
};
```

### Advanced Validation with Refinements
```typescript
// Custom validation logic
export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8)
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'] // Error attached to this field
}).refine((data) => data.newPassword !== data.currentPassword, {
  message: "New password must be different from current password",
  path: ['newPassword']
});
```

### Async Validation
```typescript
// Check uniqueness in database
export const CreateUserSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email()
}).refine(async (data) => {
  const existing = await db.query.user.findFirst({
    where: eq(schema.username, data.username)
  });
  return !existing; // Return true if valid
}, {
  message: "Username already taken",
  path: ['username']
});

// Usage in endpoint
const validation = await CreateUserSchema.safeParseAsync(body);
```

### Transforms (Data Normalization)
```typescript
// Transform data during validation
export const SearchQuerySchema = z.object({
  query: z.string().trim().toLowerCase().min(1),
  tags: z.string().transform((val) => val.split(',').map(t => t.trim())).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

// Input: { query: "  LEGAL CASE  ", tags: "urgent, important", limit: "20" }
// Output: { query: "legal case", tags: ["urgent", "important"], limit: 20 }
```

---

## Standardized Error Shapes

### Error Response Format
```typescript
// Zod validation error structure
interface ValidationErrorResponse {
  message: string;
  errors: {
    [field: string]: string[];
  };
}

// Example error response
{
  "message": "Validation failed",
  "errors": {
    "title": ["String must contain at least 3 character(s)"],
    "priority": ["Invalid enum value. Expected 'low' | 'medium' | 'high' | 'critical', received 'super-high'"],
    "dueDate": ["Invalid date"]
  }
}
```

### Error Formatting Helper
```typescript
// $lib/utils/validation.ts
import type { ZodError } from 'zod';

export function formatZodError(zodError: ZodError) {
  return {
    message: 'Validation failed',
    errors: zodError.flatten().fieldErrors
  };
}

// Usage in endpoint
if (!validation.success) {
  throw error(400, formatZodError(validation.error));
}
```

### Custom Error Messages
```typescript
// Define custom messages for each rule
export const CreateCaseSchema = z.object({
  title: z.string()
    .min(3, { message: "Title is too short (min 3 chars)" })
    .max(200, { message: "Title is too long (max 200 chars)" }),

  priority: z.enum(['low', 'medium', 'high', 'critical'], {
    errorMap: () => ({ message: "Priority must be low, medium, high, or critical" })
  }),

  email: z.string()
    .email({ message: "Invalid email format" })
    .refine((val) => !val.includes('+'), { message: "Email aliases not allowed" })
});
```

---

## Type Inference

### Automatic Type Generation
```typescript
// Schema definition
const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.date()
});

// TypeScript type inferred automatically
type User = z.infer<typeof UserSchema>;
// Equivalent to:
// type User = {
//   id: string;
//   username: string;
//   email: string;
//   role: 'USER' | 'ADMIN';
//   createdAt: Date;
// }
```

### Input vs Output Types
```typescript
// Schema with default and transform
const ConfigSchema = z.object({
  port: z.coerce.number().default(3000),
  host: z.string().default('localhost'),
  debug: z.boolean().default(false)
});

// Input type (what you pass to parse)
type ConfigInput = z.input<typeof ConfigSchema>;
// { port?: string | number; host?: string; debug?: boolean }

// Output type (what you get after parse)
type ConfigOutput = z.output<typeof ConfigSchema>;
// { port: number; host: string; debug: boolean }
```

### Generic Schemas
```typescript
// Paginated response schema
function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number()
  });
}

// Usage
const PaginatedCasesSchema = paginatedSchema(CaseSchema);
type PaginatedCases = z.infer<typeof PaginatedCasesSchema>;
// { data: Case[]; total: number; page: number; pageSize: number }
```

---

## Form Actions Integration

### Form Action with Zod
```typescript
// src/routes/cases/create/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { CreateCaseSchema } from '$lib/schemas';
import type { Actions } from './$types';

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { message: 'Unauthorized' });
    }

    const formData = await request.formData();
    const data = {
      title: formData.get('title'),
      description: formData.get('description'),
      priority: formData.get('priority')
    };

    const validation = CreateCaseSchema.safeParse(data);

    if (!validation.success) {
      return fail(400, {
        errors: validation.error.flatten().fieldErrors,
        data // Return original data to repopulate form
      });
    }

    const newCase = await db.insert(cases).values({
      ...validation.data,
      assignedAttorney: locals.user.id
    }).returning();

    throw redirect(303, `/cases/${newCase[0].id}`);
  }
};
```

### Client-Side Form Validation (Svelte 5)
```svelte
<!-- src/routes/cases/create/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { CreateCaseSchema } from '$lib/schemas';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  let clientErrors = $state<Record<string, string[]>>({});

  function validateOnBlur(field: string, value: string) {
    const result = CreateCaseSchema.pick({ [field]: true }).safeParse({ [field]: value });
    if (!result.success) {
      clientErrors[field] = result.error.flatten().fieldErrors[field] || [];
    } else {
      delete clientErrors[field];
    }
  }
</script>

<form method="POST" action="?/create" use:enhance>
  <label>
    Title
    <input
      name="title"
      value={form?.data?.title || ''}
      onblur={(e) => validateOnBlur('title', e.currentTarget.value)}
    />
    {#if form?.errors?.title || clientErrors.title}
      <span class="error">{form?.errors?.title?.[0] || clientErrors.title?.[0]}</span>
    {/if}
  </label>

  <label>
    Priority
    <select name="priority" value={form?.data?.priority || 'medium'}>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="critical">Critical</option>
    </select>
    {#if form?.errors?.priority}
      <span class="error">{form.errors.priority[0]}</span>
    {/if}
  </label>

  <button type="submit">Create Case</button>
</form>
```

---

## Common Validation Patterns

### Date/Time Validation
```typescript
export const EventSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ['endDate']
});
```

### File Upload Validation
```typescript
export const UploadSchema = z.object({
  file: z.custom<File>((val) => val instanceof File),
  filename: z.string().regex(/^[a-zA-Z0-9_\-\.]+$/),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf'])
}).refine((data) => data.file.size <= 10 * 1024 * 1024, {
  message: "File size must be less than 10MB",
  path: ['file']
});
```

### Conditional Fields
```typescript
export const ContactSchema = z.object({
  contactMethod: z.enum(['email', 'phone']),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional()
}).refine((data) => {
  if (data.contactMethod === 'email') return !!data.email;
  if (data.contactMethod === 'phone') return !!data.phone;
  return true;
}, {
  message: "Email required when contact method is email",
  path: ['email']
});
```

### Array Validation
```typescript
export const BulkCreateSchema = z.object({
  cases: z.array(CreateCaseSchema).min(1).max(100)
});

// Validates each array item against CreateCaseSchema
// Errors are nested: { cases: { 0: { title: ["error"] }, 1: { ... } } }
```

### Union Types
```typescript
// Accept either format
export const IdentifierSchema = z.union([
  z.string().uuid(),           // UUID format
  z.number().int().positive()  // Integer ID
]);

// Or discriminated union
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), email: z.string().email() }),
  z.object({ type: z.literal('sms'), phone: z.string() })
]);
```

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| `"string" is not assignable to type "number"` | Schema expects number, got string | Use `z.coerce.number()` for form data (always strings) | Check `typeof formData.get('field')` |
| Validation passes invalid data | Schema doesn't match actual requirements | Add `.refine()` with custom validation logic | Write unit test with edge cases |
| Error messages are generic | No custom messages defined | Add `{ message: "..." }` to each rule | Check API response errors object |
| TypeScript error on `validation.data` | Forgot to check `validation.success` | Add `if (!validation.success) return` before accessing `.data` | TypeScript compiler will catch |
| Async refinement not running | Used `safeParse` instead of `safeParseAsync` | Change to `await schema.safeParseAsync(data)` | Add `console.log` in refinement |
| Nested errors not displayed | Using `error.errors` instead of `flatten()` | Use `validation.error.flatten().fieldErrors` | Check error response structure |
| Schema throws instead of returning error | Used `parse()` instead of `safeParse()` | Change to `safeParse()` for error handling | Wrap in try-catch temporarily |
| Date validation fails on valid dates | String not coerced to Date | Use `z.coerce.date()` not `z.date()` | Test with ISO string: "2025-12-24" |
| Optional fields cause errors when missing | Schema expects value even when optional | Use `.optional()` not `.nullable()` | Send request without optional field |
| Performance slow with large arrays | Validating every array item individually | Use `.array()` method, Zod optimizes internally | Profile with `console.time()` |

---

## Reference Implementation

### Complete Endpoint with Validation
```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema-postgres';
import { CreateCaseSchema, UpdateCaseSchema, QueryCasesSchema } from '$lib/schemas';
import { formatZodError } from '$lib/utils/validation';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// ========== GET: Query with validation ==========
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Validate query parameters
  const queryValidation = QueryCasesSchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
    status: url.searchParams.get('status'),
    priority: url.searchParams.get('priority')
  });

  if (!queryValidation.success) {
    throw error(400, formatZodError(queryValidation.error));
  }

  const { limit, offset, status, priority } = queryValidation.data;

  const userCases = await db.select()
    .from(cases)
    .where(eq(cases.assignedAttorney, locals.user.id))
    .limit(limit)
    .offset(offset);

  return json({
    success: true,
    data: userCases,
    meta: { limit, offset, total: userCases.length }
  });
};

// ========== POST: Create with validation ==========
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const validation = CreateCaseSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, formatZodError(validation.error));
  }

  const newCase = await db.insert(cases).values({
    ...validation.data,
    assignedAttorney: locals.user.id,
    status: 'pending',
    createdAt: new Date()
  }).returning();

  return json({ success: true, data: newCase[0] }, { status: 201 });
};

// ========== PUT: Update with validation ==========
export const PUT: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const validation = UpdateCaseSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, formatZodError(validation.error));
  }

  const { id, ...updates } = validation.data;

  const updated = await db.update(cases)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(cases.id, id))
    .returning();

  if (updated.length === 0) {
    throw error(404, 'Case not found');
  }

  return json({ success: true, data: updated[0] });
};
```

### Schema Library
```typescript
// $lib/schemas/index.ts
export * from './case';
export * from './user';
export * from './report';

// $lib/schemas/case.ts
import { z } from 'zod';

export const CaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  status: z.enum(['pending', 'active', 'investigating', 'closed']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  assignedAttorney: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const CreateCaseSchema = CaseSchema.omit({
  id: true,
  assignedAttorney: true,
  createdAt: true,
  updatedAt: true
}).extend({
  tags: z.array(z.string()).max(10).optional(),
  dueDate: z.coerce.date().optional()
});

export const UpdateCaseSchema = CaseSchema.partial().required({ id: true });

export const QueryCasesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'active', 'investigating', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  search: z.string().min(1).optional()
});

export type Case = z.infer<typeof CaseSchema>;
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
export type UpdateCaseInput = z.infer<typeof UpdateCaseSchema>;
export type QueryCasesInput = z.infer<typeof QueryCasesSchema>;
```

---

## Integration Checklist

When adding Zod validation to an endpoint:

- [ ] **1. Create schema:** Add to `$lib/schemas/` with descriptive name
- [ ] **2. Define rules:** Use appropriate validators (min/max/regex/email/etc)
- [ ] **3. Add custom messages:** Override default error messages for clarity
- [ ] **4. Export types:** Use `z.infer<typeof Schema>` for TypeScript types
- [ ] **5. Use safeParse:** Always use `safeParse()` not `parse()` in endpoints
- [ ] **6. Check success:** `if (!validation.success)` before accessing `.data`
- [ ] **7. Format errors:** Use `.flatten().fieldErrors` for consistent error shape
- [ ] **8. Return 400:** Throw `error(400, ...)` on validation failure
- [ ] **9. Use validated data:** Reference `validation.data` (type-safe)
- [ ] **10. Test edge cases:** Write tests for invalid/missing/malformed data
- [ ] **11. Add client validation:** Sync schema to client for progressive enhancement
- [ ] **12. Document schema:** Add JSDoc comments explaining each field

---

## Tests

### Unit Test: Schema Validation
```typescript
// tests/unit/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { CreateCaseSchema } from '$lib/schemas';

describe('CreateCaseSchema', () => {
  it('should accept valid data', () => {
    const valid = {
      title: 'Test Case',
      description: 'This is a test case description.',
      priority: 'high'
    };

    const result = CreateCaseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject title shorter than 3 chars', () => {
    const invalid = {
      title: 'AB',
      description: 'Valid description here.',
      priority: 'low'
    };

    const result = CreateCaseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it('should reject invalid priority enum', () => {
    const invalid = {
      title: 'Valid Title',
      description: 'Valid description.',
      priority: 'super-high' // Invalid
    };

    const result = CreateCaseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should apply default priority', () => {
    const data = {
      title: 'Test Case',
      description: 'Description here.'
      // No priority provided
    };

    const result = CreateCaseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('medium');
    }
  });
});
```

### Integration Test: Endpoint Validation
```typescript
// tests/integration/validation.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '$routes/api/cases/+server';

describe('POST /api/cases validation', () => {
  it('should return 400 on invalid title', async () => {
    const response = await POST({
      locals: { user: { id: '123', username: 'test', role: 'USER' } },
      request: new Request('http://localhost/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'AB', description: 'Valid desc', priority: 'high' })
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors.title).toBeDefined();
  });

  it('should return 400 on missing required fields', async () => {
    const response = await POST({
      locals: { user: { id: '123', username: 'test', role: 'USER' } },
      request: new Request('http://localhost/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Empty body
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors.title).toBeDefined();
    expect(body.errors.description).toBeDefined();
  });
});
```

---

## Performance Considerations

### Schema Caching
```typescript
// ❌ Don't recreate schemas in hot paths
function validateInput(data: unknown) {
  const schema = z.object({ name: z.string() }); // Created every call
  return schema.safeParse(data);
}

// ✅ Define schemas at module level (cached)
const InputSchema = z.object({ name: z.string() });
function validateInput(data: unknown) {
  return InputSchema.safeParse(data);
}
```

### Lazy Evaluation
```typescript
// For expensive schemas that aren't always used
const ExpensiveSchema = z.lazy(() => z.object({
  nested: z.array(z.object({
    deep: z.array(ComplexSchema)
  }))
}));
```

### Benchmarks
- Simple schema (5 fields): ~0.05ms
- Complex schema (20 fields + refinements): ~0.5ms
- Array validation (100 items): ~5ms
- Async refinement (DB check): ~10-50ms (depends on DB)

---

## Related Patterns

- **SvelteKit REST Route Structure** - Using validated data in endpoints
- **Protected Endpoints Patterns** - Combining auth + rate limiting + validation
- **Form Actions Validation Errors** - Client-server validation sync
- **Redis Caching Strategies** - Caching validated responses

---

**Pattern Status:** ✅ Complete
**Next Review:** After Phase 79 testing
**Maintained By:** API Validation Team
