import { createHash } from 'node:crypto';
import { z } from 'zod';
import { openSpecEvidencePayloadSchema, type OpenSpecEvidencePayloadV1 } from './evidence-entity-extractors.js';

const revision = z.string().min(1);

export const openSpecDocumentKindSchema = z.enum(['main_spec', 'delta_spec', 'tasks']);
export const openSpecDeltaOperationSchema = z.enum(['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED', 'BASE']);

export const openSpecEvidenceLocationSchema = z.object({
  entity_type: z.enum(['requirement', 'scenario', 'task']),
  entity_id: z.string().min(1),
  title: z.string().min(1),
  start_line: z.number().int().positive(),
  operation: openSpecDeltaOperationSchema,
}).strict();

export const openSpecRenameAliasSchema = z.object({
  from_requirement_id: z.string().min(1),
  to_requirement_id: z.string().min(1),
  from_title: z.string().min(1),
  to_title: z.string().min(1),
  source_line: z.number().int().positive(),
}).strict();

export const openSpecCompilationReceiptSchema = z.object({
  schema: z.literal('atlas.openspec-compilation-receipt.v1').default('atlas.openspec-compilation-receipt.v1'),
  source_ref: z.string().min(1),
  source_revision: revision,
  document_kind: openSpecDocumentKindSchema,
  capability: z.string().min(1).nullable().optional(),
  change_name: z.string().min(1).nullable().optional(),
  requirement_count: z.number().int().nonnegative(),
  scenario_count: z.number().int().nonnegative(),
  task_count: z.number().int().nonnegative(),
  rename_count: z.number().int().nonnegative(),
  locations: z.array(openSpecEvidenceLocationSchema),
  renames: z.array(openSpecRenameAliasSchema),
  input_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  output_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  canonical_identity_created: z.literal(true).default(true),
  canonical_identity_owner: z.literal('openspec_parser').default('openspec_parser'),
}).strict();

export type OpenSpecCompilationReceiptV1 = z.infer<typeof openSpecCompilationReceiptSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function slug(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function requirementId(capability: string, title: string): string {
  const titleSlug = slug(title);
  if (!titleSlug) throw new Error(`OPENSPEC_REQUIREMENT_TITLE_EMPTY:${title}`);
  return `openspec:req:${slug(capability)}:${titleSlug}`;
}

function scenarioId(requirementIdValue: string, title: string): string {
  const titleSlug = slug(title);
  if (!titleSlug) throw new Error(`OPENSPEC_SCENARIO_TITLE_EMPTY:${title}`);
  return `openspec:scn:${requirementIdValue}:${titleSlug}`;
}

function taskId(changeName: string, taskKey: string): string {
  return `openspec:task:${slug(changeName)}:${slug(taskKey)}`;
}

function inferPathContext(sourceRef: string): { kind: 'main_spec' | 'delta_spec' | 'tasks'; capability?: string; changeName?: string } {
  const normalized = sourceRef.replaceAll('\\', '/');
  const main = normalized.match(/(?:^|\/)openspec\/specs\/([^/]+)\/spec\.md$/i);
  if (main) return { kind: 'main_spec', capability: main[1] };
  const delta = normalized.match(/(?:^|\/)openspec\/changes\/([^/]+)\/specs\/([^/]+)\/spec\.md$/i);
  if (delta) return { kind: 'delta_spec', changeName: delta[1], capability: delta[2] };
  const tasks = normalized.match(/(?:^|\/)openspec\/changes\/([^/]+)\/tasks\.md$/i);
  if (tasks) return { kind: 'tasks', changeName: tasks[1] };
  throw new Error(`OPENSPEC_SOURCE_PATH_UNRECOGNIZED:${sourceRef}`);
}

function assertUniqueId(map: Map<string, string>, id: string, title: string, kind: string): void {
  const previous = map.get(id);
  if (previous && previous !== title) {
    throw new Error(`OPENSPEC_${kind}_ID_COLLISION:${id}:${previous}:${title}`);
  }
  map.set(id, title);
}

function parseRequirementTitle(value: string): string | null {
  const match = value.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
  return match?.[1]?.trim() || null;
}

function parseScenarioTitle(value: string): string | null {
  const match = value.match(/^####\s+Scenario:\s*(.+?)\s*$/i);
  return match?.[1]?.trim() || null;
}

function operationForHeading(line: string): z.infer<typeof openSpecDeltaOperationSchema> | null {
  const match = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i);
  return match ? match[1]!.toUpperCase() as z.infer<typeof openSpecDeltaOperationSchema> : null;
}

function parseStableTaskLine(line: string): { key: string; title: string } | null {
  const match = line.match(/^\s*-\s*\[[ xX]\]\s+((?:\d+(?:\.\d+)*)|(?:[A-Za-z][A-Za-z0-9_-]*-\d+[A-Za-z0-9_-]*))\s+(.+?)\s*$/);
  if (!match) return null;
  return { key: match[1]!, title: match[2]!.trim() };
}

export function compileOpenSpecEvidence(input: {
  source_ref: string;
  source_revision: string;
  markdown: string;
  capability?: string;
  change_name?: string;
  producer_revision: string;
}): { payload: OpenSpecEvidencePayloadV1; receipt: OpenSpecCompilationReceiptV1 } {
  const inferred = inferPathContext(input.source_ref);
  const capability = input.capability ?? inferred.capability;
  const changeName = input.change_name ?? inferred.changeName;
  const lines = input.markdown.replaceAll('\r\n', '\n').split('\n');
  const locations: z.infer<typeof openSpecEvidenceLocationSchema>[] = [];
  const renames: z.infer<typeof openSpecRenameAliasSchema>[] = [];
  const requirements: Array<{ requirement_id: string; identity_status: 'canonical' }> = [];
  const scenarios: Array<{ scenario_id: string; identity_status: 'canonical'; requirement_id?: string }> = [];
  const tasks: Array<{ task_id: string; identity_status: 'canonical'; requirement_id?: string; scenario_id?: string }> = [];
  const requirementIds = new Map<string, string>();
  const scenarioIds = new Map<string, string>();
  const taskIds = new Map<string, string>();

  if (inferred.kind === 'tasks') {
    if (!changeName) throw new Error(`OPENSPEC_CHANGE_NAME_REQUIRED:${input.source_ref}`);
    for (let index = 0; index < lines.length; index += 1) {
      const parsedTask = parseStableTaskLine(lines[index]!);
      if (!parsedTask) continue;
      const idValue = taskId(changeName, parsedTask.key);
      assertUniqueId(taskIds, idValue, parsedTask.title, 'TASK');
      tasks.push({ task_id: idValue, identity_status: 'canonical' });
      locations.push({ entity_type: 'task', entity_id: idValue, title: parsedTask.title, start_line: index + 1, operation: 'BASE' });
    }
  } else {
    if (!capability) throw new Error(`OPENSPEC_CAPABILITY_REQUIRED:${input.source_ref}`);
    let operation: z.infer<typeof openSpecDeltaOperationSchema> = 'BASE';
    let currentRequirementId: string | null = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const nextOperation = operationForHeading(line);
      if (nextOperation) {
        operation = nextOperation;
        currentRequirementId = null;
        continue;
      }

      if (operation === 'RENAMED') {
        const fromMatch = line.match(/^\s*-\s*FROM:\s*`?###\s+Requirement:\s*(.+?)`?\s*$/i);
        if (fromMatch) {
          const nextLine = lines[index + 1] ?? '';
          const toMatch = nextLine.match(/^\s*-\s*TO:\s*`?###\s+Requirement:\s*(.+?)`?\s*$/i);
          if (!toMatch) throw new Error(`OPENSPEC_RENAME_TO_REQUIRED:${input.source_ref}:${index + 1}`);
          const fromTitle = fromMatch[1]!.trim();
          const toTitle = toMatch[1]!.trim();
          renames.push({
            from_requirement_id: requirementId(capability, fromTitle),
            to_requirement_id: requirementId(capability, toTitle),
            from_title: fromTitle,
            to_title: toTitle,
            source_line: index + 1,
          });
          index += 1;
          continue;
        }
      }

      const requirementTitle = parseRequirementTitle(line);
      if (requirementTitle) {
        const idValue = requirementId(capability, requirementTitle);
        assertUniqueId(requirementIds, idValue, requirementTitle, 'REQUIREMENT');
        if (!requirements.some((item) => item.requirement_id === idValue)) {
          requirements.push({ requirement_id: idValue, identity_status: 'canonical' });
        }
        locations.push({ entity_type: 'requirement', entity_id: idValue, title: requirementTitle, start_line: index + 1, operation });
        currentRequirementId = idValue;
        continue;
      }

      const scenarioTitle = parseScenarioTitle(line);
      if (scenarioTitle) {
        if (!currentRequirementId) {
          throw new Error(`OPENSPEC_SCENARIO_WITHOUT_REQUIREMENT:${input.source_ref}:${index + 1}:${scenarioTitle}`);
        }
        const idValue = scenarioId(currentRequirementId, scenarioTitle);
        assertUniqueId(scenarioIds, idValue, scenarioTitle, 'SCENARIO');
        if (!scenarios.some((item) => item.scenario_id === idValue)) {
          scenarios.push({ scenario_id: idValue, identity_status: 'canonical', requirement_id: currentRequirementId });
        }
        locations.push({ entity_type: 'scenario', entity_id: idValue, title: scenarioTitle, start_line: index + 1, operation });
      }
    }
  }

  const payload = openSpecEvidencePayloadSchema.parse({
    schema: 'atlas.openspec-evidence.v1',
    document_revision: input.source_revision,
    requirements,
    scenarios,
    tasks,
  });
  const outputStable = JSON.stringify({ payload, locations, renames });
  const receipt = openSpecCompilationReceiptSchema.parse({
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    document_kind: inferred.kind,
    capability: capability ?? null,
    change_name: changeName ?? null,
    requirement_count: requirements.length,
    scenario_count: scenarios.length,
    task_count: tasks.length,
    rename_count: renames.length,
    locations,
    renames,
    input_checksum: sha256(input.markdown),
    output_checksum: sha256(outputStable),
    producer_revision: input.producer_revision,
    canonical_identity_created: true,
    canonical_identity_owner: 'openspec_parser',
  });

  return { payload, receipt };
}

export function describeOpenSpecEvidenceCompiler(): string {
  return [
    'OpenSpec requirement identity is parser-owned and derived from capability plus normalized Requirement heading.',
    'Scenario identity is scoped beneath the canonical requirement ID.',
    'Delta ADDED/MODIFIED/REMOVED sections preserve the same requirement identity; RENAMED emits an explicit alias transition.',
    'Task identity requires an explicit stable task key such as 1.2 or FI-16A under a change; unkeyed checkbox prose is not promoted.',
    'LangExtract may summarize or relate OpenSpec content but never owns OpenSpec canonical identity.',
  ].join(' ');
}
