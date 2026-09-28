import assert from 'node:assert/strict';
import test from 'node:test';
import { extractScopedMarkdownUrls, normalizeMarkdown, parseArgs, validateConfig } from './fetch-langchain-doc-corpus-v1.mjs';

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

test('manifest must keep its section indexes on the authority origin', () => {
  const valid = {
    schema: 'atlas.external-doc-corpus-discovery.v1', canonicalAuthority: false,
    artifactOnly: true, authority: 'https://docs.langchain.com', sections: [section, { ...section, id: 'deep', indexUrl: 'https://docs.langchain.com/oss/python/deepagents/llms.txt', allowedPathPrefix: '/oss/python/deepagents/' }, { ...section, id: 'concepts', indexUrl: 'https://docs.langchain.com/oss/python/concepts/llms.txt', allowedPathPrefix: '/oss/python/concepts/' }],
  };
  assert.equal(validateConfig(valid), valid);
  assert.throws(() => validateConfig({ ...valid, sections: [{ ...section, indexUrl: 'https://evil.test/llms.txt' }, ...valid.sections.slice(1)] }), /SECTION_INDEX_OUTSIDE_AUTHORITY/);
});

test('CLI arguments are bounded and reject unknown options', () => {
  assert.deepEqual(parseArgs(['--concurrency=4', '--out=.tmp/atlas/langchain-doc-corpus-v1/run']), {
    concurrency: 4, out: '.tmp/atlas/langchain-doc-corpus-v1/run',
  });
  assert.throws(() => parseArgs(['--concurrency=9']), /CONCURRENCY_MUST_BE_INTEGER_1_TO_8/);
  assert.throws(() => parseArgs(['--apply']), /UNKNOWN_ARGUMENT/);
});
