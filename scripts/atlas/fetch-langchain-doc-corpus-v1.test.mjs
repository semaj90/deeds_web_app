import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractScopedMarkdownUrls,
  normalizeMarkdown,
  parseArgs,
  rejectDuplicateResolvedPageAliases,
  validateConfig,
} from './fetch-langchain-doc-corpus-v1.mjs';

const section = {
  id: 'langgraph-python',
  indexUrl: 'https://docs.langchain.com/oss/python/langgraph/llms.txt',
  allowedPathPrefix: '/oss/python/langgraph/',
};

test('discovery keeps only unique markdown URLs within exact section prefix', () => {
  const markdown = [
    '[A](https://docs.langchain.com/oss/python/langgraph/a.md)',
    '[A duplicate](https://docs.langchain.com/oss/python/langgraph/a.md)',
    '[outside](https://docs.langchain.com/oss/python/deepagents/b.md)',
    '[external](https://example.com/oss/python/langgraph/c.md)',
    '[not markdown](https://docs.langchain.com/oss/python/langgraph/d.html)',
  ].join('\n');
  assert.deepEqual(extractScopedMarkdownUrls(markdown, section), [
    'https://docs.langchain.com/oss/python/langgraph/a.md',
  ]);
});

test('normalization changes line endings and BOM only', () => {
  assert.equal(normalizeMarkdown(Buffer.from('\uFEFF# title\r\ncode  \r\n', 'utf8')), '# title\ncode  \n');
});

test('resolved URL aliases keep the canonical page and conserve the discarded alias as a failure', () => {
  const resolvedUrl =
    'https://docs.langchain.com/langsmith/javascript/managed-deep-agents-overview.md';
  const discovered = [
    {
      section: { id: 'langsmith' },
      url: 'https://docs.langchain.com/langsmith/javascript/managed-deep-agents.md',
    },
    { section: { id: 'langsmith' }, url: resolvedUrl },
  ];
  const pages = discovered.map(({ url }) => ({
    status: 'FETCHED',
    sectionId: 'langsmith',
    canonicalUrl: url,
    resolvedUrl,
    normalizedSha256: 'sha256:same-content',
  }));

  const result = rejectDuplicateResolvedPageAliases(discovered, pages);
  assert.equal(result[0].status, 'FAILED');
  assert.equal(result[0].error, 'DUPLICATE_RESOLVED_URL_ALIAS');
  assert.equal(result[1].status, 'FETCHED');
});

test('conflicting bytes under one resolved URL fail closed for every alias', () => {
  const resolvedUrl = 'https://docs.langchain.com/oss/javascript/langchain/mcp.md';
  const discovered = [
    { section: { id: 'langchain' }, url: resolvedUrl },
    {
      section: { id: 'langchain' },
      url: 'https://docs.langchain.com/oss/javascript/deepagents/mcp.md',
    },
  ];
  const pages = discovered.map(({ url }, index) => ({
    status: 'FETCHED',
    sectionId: 'langchain',
    canonicalUrl: url,
    resolvedUrl,
    normalizedSha256: `sha256:content-${index}`,
  }));

  const result = rejectDuplicateResolvedPageAliases(discovered, pages);
  assert.deepEqual(
    result.map((page) => page.error),
    ['RESOLVED_URL_CONTENT_CONFLICT', 'RESOLVED_URL_CONTENT_CONFLICT']
  );
});

test('manifest must keep its section indexes on the authority origin', () => {
  const valid = {
    schema: 'atlas.external-doc-corpus-discovery.v1', canonicalAuthority: false,
    artifactOnly: true, authority: 'https://docs.langchain.com', sections: [section, { ...section, id: 'deep', indexUrl: 'https://docs.langchain.com/oss/python/deepagents/llms.txt', allowedPathPrefix: '/oss/python/deepagents/' }, { ...section, id: 'concepts', indexUrl: 'https://docs.langchain.com/oss/python/concepts/llms.txt', allowedPathPrefix: '/oss/python/concepts/' }],
  };
  assert.equal(validateConfig(valid), valid);
  assert.throws(() => validateConfig({ ...valid, sections: [{ ...section, indexUrl: 'https://evil.test/llms.txt' }, ...valid.sections.slice(1)] }), /SECTION_INDEX_OUTSIDE_AUTHORITY/);
});

test('manifest accepts a language-labeled index advertised by the official root', () => {
  const config = {
    schema: 'atlas.external-doc-corpus-discovery.v1',
    canonicalAuthority: false,
    artifactOnly: true,
    authority: 'https://docs.langchain.com',
    sections: [
      {
        id: 'langchain-typescript',
        product: 'langchain',
        language: 'typescript',
        indexUrl:
          'https://docs.langchain.com/_llms/agent-development-lifecycle/build/type-script.md',
        allowedPathPrefix: '/oss/javascript/langchain/',
      },
    ],
  };
  assert.equal(validateConfig(config), config);
  assert.throws(
    () =>
      validateConfig({
        ...config,
        sections: [{ ...config.sections[0], indexUrl: 'https://evil.test/_llms/type-script.md' }],
      }),
    /SECTION_INDEX_OUTSIDE_AUTHORITY/
  );
});

test('CLI arguments are bounded and reject unknown options', () => {
  assert.deepEqual(parseArgs(['--concurrency=4', '--out=.tmp/atlas/langchain-doc-corpus-v1/run']), {
    concurrency: 4,
    out: '.tmp/atlas/langchain-doc-corpus-v1/run',
    config: null,
  });
  assert.equal(
    parseArgs(['--config=docs/.okf/topics/langchain/corpus-typescript.json']).config,
    'docs/.okf/topics/langchain/corpus-typescript.json'
  );
  assert.throws(() => parseArgs(['--concurrency=9']), /CONCURRENCY_MUST_BE_INTEGER_1_TO_8/);
  assert.throws(() => parseArgs(['--apply']), /UNKNOWN_ARGUMENT/);
});
