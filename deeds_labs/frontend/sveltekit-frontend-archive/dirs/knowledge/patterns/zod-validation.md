# Zod Validation Patterns

## Overview
We use Zod for runtime schema validation of API inputs, form data, and environment variables.

## Core Patterns

### 1. API Input Validation
Validate JSON bodies in API endpoints.

```typescript
import { z } from 'zod';
import { json } from '@sveltejs/kit';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().min(18).optional()
});

export const POST = async ({ request }) => {
  const body = await request.json();

  const result = CreateUserSchema.safeParse(body);

  if (!result.success) {
    return json({
      error: 'Validation Failed',
      details: result.error.flatten()
    }, { status: 400 });
  }

  const data = result.data; // Typed correctly
  // ...
};
```

### 2. Form Data Validation (zod-form-data)
Validate `FormData` objects in Form Actions.

```typescript
import { zfd } from 'zod-form-data';

const schema = zfd.formData({
  email: zfd.text(),
  quantity: zfd.numeric(z.number().min(1))
});

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const result = schema.safeParse(formData);

    if (!result.success) {
      return fail(400, { errors: result.error.flatten().fieldErrors });
    }
    // ...
  }
};
```

### 3. Environment Variables
Validate `process.env` at startup.

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test'])
});

const env = EnvSchema.parse(process.env);
export { env };
```

## Best Practices
1.  **Strict Mode**: Use `.strict()` for API endpoints to reject unknown fields.
2.  **Coercion**: Use `z.coerce.number()` or `zfd` for form data which is always string-based.
3.  **Error Messages**: Provide custom error messages for better UX. `.min(8, "Password must be at least 8 characters")`.
