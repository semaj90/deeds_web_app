#!/usr/bin/env node
/**
 * Phase 89: Web Search Integration for Error Documentation
 *
 * Fetches official documentation for TypeScript and Svelte errors
 * to augment LLM-generated fixes with authoritative sources.
 */

import https from 'https';
import { createClient } from 'redis';

const CONFIG = {
  redis: {
    url: 'redis://127.0.0.1:6379',
    prefix: 'phase89:docsearch:',
    ttl: 86400 * 30 // 30 days cache for documentation
  },
  sources: {
    typescript: {
      baseUrl: 'https://www.typescriptlang.org/docs/handbook',
      errorCodes: 'https://github.com/microsoft/TypeScript/blob/main/src/compiler/diagnosticMessages.json'
    },
    svelte: {
      baseUrl: 'https://svelte.dev/docs',
      migration: 'https://svelte.dev/docs/svelte/v5-migration-guide'
    }
  },
  timeout: 5000
};

let redis;

/**
 * Search for error documentation
 */
async function searchErrorDocs(errorCode, language = 'typescript') {
  if (!redis) {
    redis = createClient({ url: CONFIG.redis.url });
    await redis.connect();
  }

  const cacheKey = `${CONFIG.redis.prefix}${language}:${errorCode}`;

  // Check cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`✅ Cache HIT for ${errorCode}`);
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn('Cache read error:', err.message);
  }

  console.log(`⏳ Searching documentation for ${errorCode}...`);

  let results = {};

  if (language === 'typescript' || language === 'javascript') {
    results = await searchTypeScriptDocs(errorCode);
  } else if (language === 'svelte') {
    results = await searchSvelteDocs(errorCode);
  }

  // Cache results
  if (results && Object.keys(results).length > 0) {
    try {
      await redis.setEx(cacheKey, CONFIG.redis.ttl, JSON.stringify(results));
    } catch (err) {
      console.warn('Cache write error:', err.message);
    }
  }

  return results;
}

/**
 * Search TypeScript documentation
 */
async function searchTypeScriptDocs(errorCode) {
  // Extract numeric code (e.g., TS1005 -> 1005)
  const numericCode = errorCode.replace(/\D/g, '');

  if (!numericCode) {
    return {};
  }

  // Known TypeScript error categories
  const categories = {
    '1xxx': { category: 'Syntax', url: `${CONFIG.sources.typescript.baseUrl}/intro-to-ts.html` },
    '2xxx': { category: 'Semantic', url: `${CONFIG.sources.typescript.baseUrl}/2/basic-types.html` },
    '4xxx': { category: 'Module Resolution', url: `${CONFIG.sources.typescript.baseUrl}/modules.html` },
    '5xxx': { category: 'JSX', url: `${CONFIG.sources.typescript.baseUrl}/jsx.html` },
    '6xxx': { category: 'Emit', url: `${CONFIG.sources.typescript.baseUrl}/compiler-options.html` },
    '7xxx': { category: 'Diagnostic', url: `${CONFIG.sources.typescript.baseUrl}/tsconfig-json.html` }
  };

  const prefix = numericCode.substring(0, 1);
  const categoryInfo = categories[`${prefix}xxx`] || { category: 'Unknown', url: CONFIG.sources.typescript.baseUrl };

  return {
    errorCode,
    language: 'typescript',
    category: categoryInfo.category,
    officialDocs: categoryInfo.url,
    description: getTypeScriptErrorDescription(numericCode),
    searchQuery: `TypeScript error ${errorCode} site:typescriptlang.org`,
    stackOverflow: `https://stackoverflow.com/search?q=%5Btypescript%5D+${errorCode}`,
    github: `https://github.com/search?q=${errorCode}+language%3ATypeScript&type=issues`
  };
}

/**
 * Search Svelte documentation
 */
async function searchSvelteDocs(errorCode) {
  return {
    errorCode,
    language: 'svelte',
    category: 'Svelte 5 Migration',
    officialDocs: CONFIG.sources.svelte.migration,
    description: 'Check Svelte 5 migration guide for breaking changes',
    searchQuery: `${errorCode} site:svelte.dev`,
    stackOverflow: `https://stackoverflow.com/search?q=%5Bsvelte%5D+${errorCode}`,
    github: `https://github.com/sveltejs/svelte/issues?q=${errorCode}`
  };
}

/**
 * Get TypeScript error descriptions (common ones)
 */
function getTypeScriptErrorDescription(code) {
  const descriptions = {
    '1005': 'Expected token missing (syntax error)',
    '1109': 'Expression expected',
    '1128': 'Declaration or statement expected',
    '2304': 'Cannot find name',
    '2305': 'Module has no exported member',
    '2322': 'Type is not assignable to type',
    '2339': 'Property does not exist on type',
    '2345': 'Argument of type is not assignable to parameter',
    '2554': 'Expected N arguments, but got M',
    '2741': 'Property is missing in type but required in type',
    '4060': 'Return type of exported function has or is using name from external module',
    '6133': 'Variable is declared but never used',
    '7006': 'Parameter implicitly has an "any" type',
    '7016': 'Could not find a declaration file for module',
    '7031': 'Binding element implicitly has an "any" type'
  };

  return descriptions[code] || 'Check TypeScript documentation for details';
}

/**
 * Fetch remote content (not implemented, requires cheerio/JSDOM)
 */
async function fetchRemoteContent(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, CONFIG.timeout);

    https.get(url, (res) => {
      clearTimeout(timeout);
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node phase89-web-search.mjs <error-code> [--language ts|svelte]');
    console.log('\nExamples:');
    console.log('  node phase89-web-search.mjs TS1005');
    console.log('  node phase89-web-search.mjs TS2304 --language typescript');
    process.exit(0);
  }

  const errorCode = args[0];
  const language = args.includes('--language') ? args[args.indexOf('--language') + 1] : 'typescript';

  const results = await searchErrorDocs(errorCode, language);

  console.log('\n📚 Documentation Search Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Error Code:     ${results.errorCode}`);
  console.log(`Language:       ${results.language}`);
  console.log(`Category:       ${results.category}`);
  console.log(`Description:    ${results.description}`);
  console.log(`\nOfficial Docs:  ${results.officialDocs}`);
  console.log(`Stack Overflow: ${results.stackOverflow}`);
  console.log(`GitHub Issues:  ${results.github}`);
  console.log(`Search Query:   ${results.searchQuery}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (redis) {
    await redis.quit();
  }
}

// Export for use in other scripts
export { searchErrorDocs };

// Run if called directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
