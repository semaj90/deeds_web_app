# Local Types Remediation

If you see TypeScript type errors coming from missing or ambiguous local types, follow these steps
to fix them:

1. Add local type declarations
   - Create a `src/types` folder and add `.d.ts` files for shared types, for example
     `src/types/global.d.ts`:
   ```ts
   declare global {
     interface MyGlobalType {
       id: string;
       name?: string;
     }
   }
   export {};
   ```
2. Use module augmentation for third-party libraries
   - To extend a library's types create a file like `src/types/augmentations.d.ts`:
   ```ts
   import 'some-lib';
   declare module 'some-lib' {
     interface SomeLibOptions {
       myOption?: boolean;
     }
   }
   ```
3. Configure tsconfig.json
   - Ensure `tsconfig.json` includes the types folder:
   ```json
   {
     "compilerOptions": {
       "typeRoots": ["./node_modules/@types", "./src/types"],
       "skipLibCheck": true
     },
     "include": ["src", "src/types"]
   }
   ```
4. Restart the TypeScript server / dev server
   - After adding or changing `.d.ts` files, restart your editor TS server (or run the dev server)
     so the compiler picks up the new declarations.

Common quick fixes:

- Add `export {}` at the bottom of a `.d.ts` file to make it a module when needed.
- Use `skipLibCheck: true` in CI only if third-party type mismatches are blocking builds and you
  understand the trade-offs.
- Keep type files small and well-scoped to avoid accidental global pollution.

Following these steps should eliminate most local-type-related compile errors.
