# TypeScript 5.6 Best Practices

## Tags
#typescript #typescript5.6 #types #generics #strictmode #migration

## Type Safety Patterns

### Strict Null Checks
Always enable strict null checking in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Use optional chaining and nullish coalescing:

```typescript
// ✅ Good
const name = user?.profile?.name ?? 'Anonymous';

// ❌ Bad
const name = user && user.profile && user.profile.name || 'Anonymous';
```

### Type Guards

Create type guards for runtime type checking:

```typescript
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'email' in obj
  );
}

// Usage
if (isUser(data)) {
  // TypeScript knows data is User here
  console.log(data.email);
}
```

### Branded Types

Use branded types for type-safe IDs:

```typescript
type UserId = string & { readonly __brand: 'UserId' };
type PostId = string & { readonly __brand: 'PostId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

// This prevents mixing different ID types
function getUser(id: UserId) { /* ... */ }
function getPost(id: PostId) { /* ... */ }
```

## Generic Constraints

### Constrained Generics

Use constraints to ensure type safety:

```typescript
interface HasId {
  id: string;
}

function updateEntity<T extends HasId>(entity: T, updates: Partial<T>): T {
  return { ...entity, ...updates };
}

// Works
const user = updateEntity({ id: '1', name: 'John' }, { name: 'Jane' });

// Error: missing id
const invalid = updateEntity({ name: 'John' }, { name: 'Jane' });
```

### Conditional Types

Use conditional types for type transformations:

```typescript
type Awaited<T> = T extends Promise<infer U> ? U : T;

type Result = Awaited<Promise<string>>; // string
type Direct = Awaited<number>; // number
```

### Mapped Types

Create derived types from existing ones:

```typescript
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

type Optional<T> = {
  [K in keyof T]?: T[K];
};

// Usage
interface User {
  id: string;
  name: string;
  email: string;
}

type NullableUser = Nullable<User>;
// { id: string | null; name: string | null; email: string | null }
```

## Utility Types

### Built-in Utilities

Leverage TypeScript's built-in utility types:

```typescript
// Partial - make all properties optional
type UserUpdate = Partial<User>;

// Required - make all properties required
type CompleteUser = Required<Partial<User>>;

// Pick - select specific properties
type UserCredentials = Pick<User, 'email' | 'password'>;

// Omit - exclude specific properties
type PublicUser = Omit<User, 'password'>;

// Record - create object type with specific keys
type UserMap = Record<string, User>;

// ReturnType - extract return type from function
type ApiResponse = ReturnType<typeof fetchUser>;
```

### Custom Utility Types

Create project-specific utilities:

```typescript
// Deep Partial
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Exact - prevent excess properties
type Exact<T, U extends T> = T & { [K in Exclude<keyof U, keyof T>]: never };

// NonNullable - remove null and undefined
type DefinedUser = NonNullable<User | null | undefined>;
```

## Error Handling

### Type-Safe Error Handling

Use discriminated unions for errors:

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Usage with type narrowing
const result = await fetchUser('123');
if (result.success) {
  console.log(result.data.name); // TypeScript knows data exists
} else {
  console.error(result.error.message); // TypeScript knows error exists
}
```

### Never Type for Exhaustiveness

Use `never` to ensure all cases are handled:

```typescript
type Status = 'pending' | 'success' | 'error';

function handleStatus(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Loading...';
    case 'success':
      return 'Done!';
    case 'error':
      return 'Failed!';
    default:
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
  }
}
```

## Module Declarations

### Ambient Module Declarations

Declare modules for untyped libraries:

```typescript
// global.d.ts
declare module 'legacy-library' {
  export function doSomething(param: string): void;
  export const VERSION: string;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '$lib/*'; // Wildcard for development
```

### Augmenting Existing Types

Extend third-party types safely:

```typescript
// types/express.d.ts
import 'express';

declare module 'express' {
  interface Request {
    user?: {
      id: string;
      role: string;
    };
  }
}

// Now available in middleware
app.use((req, res, next) => {
  req.user = { id: '123', role: 'admin' };
  next();
});
```

## Performance Optimization

### Avoid Expensive Type Operations

```typescript
// ❌ Bad - complex recursive type
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

// ✅ Good - use simpler alternatives where possible
type Readonly<T> = { readonly [K in keyof T]: T[K] };
```

### Type Inference Over Explicit Types

```typescript
// ✅ Good - let TypeScript infer
const users = await fetchUsers();

// ❌ Bad - redundant annotation
const users: User[] = await fetchUsers();
```

### Use `const` Assertions

```typescript
// Without const assertion
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000
}; // type: { apiUrl: string; timeout: number }

// With const assertion
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000
} as const; // type: { readonly apiUrl: "https://api.example.com"; readonly timeout: 5000 }
```

## Migration from TypeScript 5.5

### Breaking Changes in 5.6

1. **Stricter `lib.d.ts` checks**: DOM types are more strict
2. **Better `infer` constraint checking**: May require explicit constraints
3. **Improved `this` parameter inference**: May expose hidden errors

### Common Migration Issues

#### Issue: Implicit `any` in Callbacks

```typescript
// ❌ Old code (5.5)
array.map(item => item.value); // item: any

// ✅ New code (5.6)
array.map((item: MyType) => item.value);
// or
const typedArray: MyType[] = array;
typedArray.map(item => item.value);
```

#### Issue: Stricter Optional Properties

```typescript
// ❌ Old code
interface User {
  id: string;
  name?: string;
}

function printName(user: User) {
  console.log(user.name.toUpperCase()); // Error in 5.6
}

// ✅ New code
function printName(user: User) {
  console.log(user.name?.toUpperCase() ?? 'N/A');
}
```

## Testing Types

### Type-Level Testing

Use type assertions to test types:

```typescript
// tests/types.test.ts
import { expectType } from 'tsd';

expectType<User>(await fetchUser('123'));
expectType<string>(user.id);

// Ensure error is thrown for wrong types
expectType<number>(user.id); // Compile error
```

### Runtime Type Validation

Use Zod or similar for runtime validation:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().positive()
});

type User = z.infer<typeof UserSchema>;

// Runtime validation
const result = UserSchema.safeParse(data);
if (result.success) {
  const user: User = result.data;
}
```

## Best Practices Summary

1. **Enable strict mode** in `tsconfig.json`
2. **Use type guards** for runtime checks
3. **Prefer type inference** over explicit annotations
4. **Use branded types** for domain-specific IDs
5. **Leverage utility types** instead of manual type construction
6. **Handle errors** with discriminated unions
7. **Test types** with compile-time assertions
8. **Validate at boundaries** with runtime schemas
9. **Avoid `any`** - use `unknown` instead
10. **Document complex types** with JSDoc comments
