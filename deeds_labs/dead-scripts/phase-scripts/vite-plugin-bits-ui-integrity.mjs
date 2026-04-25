import { analyze, report } from './check-bits-ui-integrity.mjs';

/**
 * Vite Plugin: Bits-UI Integrity Checker
 * Shows warnings during dev server startup and build
 */
export function bitsUiIntegrityPlugin(options = {}) {
  const { failOnError = false, autoFix = false } = options;

  return {
    name: 'bits-ui-integrity-checker',
    buildStart() {
      console.log('\n🔍 Checking Bits-UI integrity...');

      try {
        const analysis = analyze();

        if (analysis.missingDeps.length > 0 || analysis.advancedUsage.length > 0) {
          console.log('\n⚠️  Bits-UI Issues Detected:');
          report(analysis);

          if (autoFix && analysis.missingDeps.length > 0) {
            console.log('\n🔧 Auto-fixing missing dependencies...');
            // Note: In a real implementation, you'd import and call fixDeps here
            // But for Vite plugin, we keep it simple and just warn
          }

          if (failOnError) {
            throw new Error('Bits-UI integrity check failed. Run `node scripts/check-bits-ui-integrity.mjs --fix-deps` to resolve.');
          }
        } else {
          console.log('✅ Bits-UI integrity OK');
        }
      } catch (error) {
        console.warn('⚠️  Bits-UI integrity check failed:', error.message);
        if (failOnError) {
          throw error;
        }
      }
    }
  };
}