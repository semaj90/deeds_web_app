import test from 'node:test';
import assert from 'node:assert/strict';
import { redactGoldenReviewDisplayTextV1 as redact } from './golden-review-display-redaction-v1.mjs';

test('redacts credential assignments and URL userinfo without hiding surrounding evidence', () => {
  assert.equal(
    redact('Calls service at https://alice:password123@example.test/api; token=abc123; useful symbol evidence.'),
    'Calls service at https://[REDACTED]@example.test/api; token=[REDACTED]; useful symbol evidence.',
  );
  assert.equal(
    redact('Postgres postgresql://atlas:db-secret@db.example.test/legal; Redis redis://cache:cache-secret@cache.example.test/0.'),
    'Postgres postgresql://[REDACTED]@db.example.test/legal; Redis redis://[REDACTED]@cache.example.test/0.',
  );
});

test('redacts bearer, common provider keys, and private-key blocks', () => {
  const value = 'Authorization: Bearer eyJhbGciOiJub25lIn0.abc; AKIA1234567890ABCDEF; sk-123456789012345678901234\n-----BEGIN PRIVATE KEY-----\nsecret bytes\n-----END PRIVATE KEY-----';
  const output = redact(value);
  assert.doesNotMatch(output, /eyJhbGci|AKIA1234567890ABCDEF|sk-123456789012345678901234|secret bytes/);
  assert.match(output, /Authorization: \[REDACTED\]/);
  assert.match(output, /\[REDACTED_PRIVATE_KEY\]/);
});

test('preserves ordinary relevance text and handles non-string values safely', () => {
  assert.equal(redact('The function validates packet identity and source spans.'), 'The function validates packet identity and source spans.');
  assert.equal(redact(null), '');
});
