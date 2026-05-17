# TypeScript 5.4 Language & Type System Reference Manual

This manual details key language advancements, generic inferencing improvements, TSConfig options, and advanced type declarations introduced in TypeScript 5.4.

---

## 1. Advanced Generic Constraints & Inferencing

TypeScript 5.4 improves generic type argument inference within nested callbacks and closures, ensuring strict type safety.

```typescript
// Type utility to map and infer structural values
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

interface DataPayload<T> {
  id: string;
  timestamp: number;
  payload: T;
}

function processPayload<T>(data: DataPayload<T>): UnwrapPromise<T> {
  // TypeScript 5.4 correctly infers generic types inside inner scope closures
  return data.payload as any;
}
```

---

## 2. Structured Preserved Narrowing

Narrowing checks are preserved within closure blocks, allowing variables to maintain narrowed types inside function references.

```typescript
function handleInput(input: string | number | null) {
  if (input === null) return;

  // input is narrowed to string | number
  const checker = () => {
    if (typeof input === 'string') {
      console.log(input.toUpperCase()); // Safe narrowing preserved in TS 5.4
    } else {
      console.log(input.toFixed(2));
    }
  };

  checker();
}
```

---

## 3. TSConfig Configuration Settings

Recommended compiler configurations for modern ESM runtime execution with Node.js 22.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```
