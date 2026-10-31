import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadRuntimeEnv } from './load-runtime-env.js';

describe('loadRuntimeEnv', () => {
  let workspaceRoot: string;
  let projectRoot: string;
  let inheritedRabbitUrl: string | undefined;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'atlas-runtime-env-'));
    projectRoot = path.join(workspaceRoot, 'sveltekit-frontend');
    mkdirSync(projectRoot);
    inheritedRabbitUrl = process.env.RABBITMQ_URL;
    delete process.env.RABBITMQ_URL;
  });

  afterEach(() => {
    if (inheritedRabbitUrl === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = inheritedRabbitUrl;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('lets project-local env override shared workspace defaults', () => {
    writeFileSync(path.join(workspaceRoot, '.env'), 'RABBITMQ_URL=amqp://workspace:5672\n');
    writeFileSync(path.join(projectRoot, '.env'), 'RABBITMQ_URL=amqp://project:5674\n');
    writeFileSync(path.join(workspaceRoot, '.env.local'), 'RABBITMQ_URL=amqp://workspace-local:5675\n');
    writeFileSync(path.join(projectRoot, '.env.local'), 'RABBITMQ_URL=amqp://project-local:5673\n');

    loadRuntimeEnv({ cwd: projectRoot, mode: 'development' });

    expect(process.env.RABBITMQ_URL).toBe('amqp://project-local:5673');
  });

  it('preserves inherited process values unless override is requested', () => {
    writeFileSync(path.join(workspaceRoot, '.env'), 'RABBITMQ_URL=amqp://workspace:5672\n');
    writeFileSync(path.join(projectRoot, '.env.local'), 'RABBITMQ_URL=amqp://project-local:5673\n');
    process.env.RABBITMQ_URL = 'amqp://process:5676';

    loadRuntimeEnv({ cwd: projectRoot, mode: 'development' });
    expect(process.env.RABBITMQ_URL).toBe('amqp://process:5676');

    loadRuntimeEnv({ cwd: projectRoot, mode: 'development', override: true });
    expect(process.env.RABBITMQ_URL).toBe('amqp://project-local:5673');
  });
});
