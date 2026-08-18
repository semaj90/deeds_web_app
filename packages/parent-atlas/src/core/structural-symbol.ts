import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const entityType = z.string().regex(/^[a-z][a-z0-9_.-]*$/);

export const STRUCTURAL_SYMBOL_KIND_VALUES = [
  'class',
  'constant',