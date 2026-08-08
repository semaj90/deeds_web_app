# TypeScript 7 Migration Timeline

## August 7, 2026

### packages/atlas-core: TS7 Compatibility

**Status**: ✅ Complete

**Changes Made**:
1. Updated `tsconfig.json`:
   - Changed `moduleResolution` from `node` to `Bundler`
   - Added `rootDir: "./src"`
   - Added `types: ["node"]`
   - Changed `include` to `"src/**/*"`
   - Removed `noImplicitAny: false`
   - Retained all explicit exclusions

2. Fixed `src/classification/graph-lane.ts`:
   - Fixed malformed line where two statements were on the same line
   - Properly separated into two distinct lines

3. Fixed `src/validation/hybrid-semantic-classification.ts`:
   - Added `'EXTERNAL_LABEL'` to `evidenceSourceEnum`
   - Added `parentDomains: []` property to all domain definitions in `CANONICAL_DOMAINS`

**Verification**:
- ✅ `npx tsc -p packages/atlas-core/tsconfig.json --noEmit` runs successfully with zero errors
- ✅ `npx tsx scripts/atlas/verify-atlas-package-boundaries.mjs` confirms package boundaries are proven
- ✅ All TypeScript 6 deprecations removed (now hard errors in TS7)

**Key Decisions**:
- Used `Bundler` resolution instead of `NodeNext` because `atlas-core` is a library package using ESM imports
- Kept `module: "ESNext"` with `moduleResolution: "Bundler"` for cleanest migration path
- Explicitly listed `types: ["node"]` to ensure Node.js globals are available
- Maintained `strict: true` without weakening to `noImplicitAny: false`

**Next Steps**:
- Continue TypeScript 7 migration across remaining packages
- Monitor for new errors introduced by strict mode enforcement
- Update any code that relied on `any` types removed by strict mode
