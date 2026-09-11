import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyImageReference, parseDockerBaseReferences as parse } from './lib/docker-base-references-v1.mjs';
const digest = 'a'.repeat(64);
test('external bare images and registry ports do not masquerade as stages or versions', () => {
  assert.equal(classifyImageReference('ubuntu'), 'FLOATING_TAG');
  assert.equal(classifyImageReference('localhost:5000/team/image'), 'FLOATING_TAG');
  assert.equal(parse('FROM unknown AS runtime')[0].classification, 'EXTERNAL_FLOATING');
});
test('multiple inherited stages retain the external digest', () => {
  const rows = parse(`FROM python:3.13@sha256:${digest} AS base\nFROM base AS builder\nFROM builder AS runtime`);
  assert.equal(rows[2].classification, 'INTERNAL_STAGE_REFERENCE');
  assert.equal(rows[2].externalBase, `python:3.13@sha256:${digest}`);
  assert.equal(rows[2].pinStatus, 'DIGEST_PINNED');
});
test('default arguments, platforms, and unknown overrides remain explicit', () => {
  const rows = parse('ARG BASE=python:3.13@sha256:' + digest + '\nFROM --platform=$BUILDPLATFORM ${BASE} AS build\nARG NEXT=alpine\nFROM $NEXT');
  assert.equal(rows[0].classification, 'DYNAMIC_ARG_PINNED');
  assert.equal(rows[0].platform, '$BUILDPLATFORM');
  assert.equal(rows[1].classification, 'DYNAMIC_ARG_UNRESOLVED');
  assert.equal(parse('ARG BASE=python:3.13\nFROM ${BASE}')[0].pinStatus, 'TAG_PINNED_ONLY');
  assert.equal(parse('FROM scratch')[0].pinStatus, 'NO_EXTERNAL_BASE');
});
