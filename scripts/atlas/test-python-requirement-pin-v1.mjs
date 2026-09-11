import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequirementPin as classify } from './lib/python-requirement-pin-v1.mjs';

test('mutable and unresolved declarations cannot be reported exact', () => {
  for (const value of ['numpy', 'numpy>=2', 'numpy==2.*', 'numpy==2,!=2.1', 'pkg @ git+https://example.org/repo.git', 'pkg @ git+https://example.org/repo.git@main', '-r base.txt', './local-wheel.whl']) {
    assert.ok(!['EXACT_VERSION', 'IMMUTABLE_VCS_COMMIT', 'HASHED_ARTIFACT'].includes(classify(value)), value);
  }
});
test('exact versions and full Git commits retain their distinction', () => {
  assert.equal(classify('uvicorn[standard]==0.49.0 # server'), 'EXACT_VERSION');
  assert.equal(classify('torch==2.7.0+cu128'), 'EXACT_VERSION');
  assert.equal(classify('numpy==2.4.6; python_version >= "3.11"'), 'EXACT_VERSION');
  assert.equal(classify('pkg @ git+https://example.org/repo.git@04f449b8a437f1bbd3dba5c9f826aca972e7709a'), 'IMMUTABLE_VCS_COMMIT');
});
