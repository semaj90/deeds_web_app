import { createHash } from 'node:crypto';
import { blockHash, taskBlock } from './wfu-metadata.mjs';

const sha256 = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const fieldLine = names => new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?(?:${names})(?:\\*\\*)?\\s*[:=]\\s*(.+)$`, 'i');
const LABELS = [
  ['status', fieldLine('status|execution_status|gate_status')],
  ['owner', fieldLine('owner')],
  ['dependency', fieldLine('dependency|depends_on')],
  ['blocker', fieldLine('blocker|blocked_by')],
  ['proof', fieldLine('proof|evidence')],
  ['safeNextCommand', fieldLine('safe_next_command|safe next command')],
  ['reportPath', fieldLine('report_path|report path')],
];

function lineStarts(text) {
  const starts = [0];
  for (let offset = 0; offset < text.length; offset += 1) if (text[offset] === '\n') starts.push(offset + 1);
  return starts;
}

export function extractNextStepObservationV1({ task, sourceText, expectedTaskFileSha256 }) {
  if (!task || typeof task.source !== 'string' || !Number.isInteger(task.line) || task.line < 1
    || typeof task.taskKey !== 'string' || typeof task.blockHash !== 'string'
    || typeof sourceText !== 'string' || typeof expectedTaskFileSha256 !== 'string') {
    throw new TypeError('NEXT_STEP_OBSERVATION_INPUT_INVALID');
  }
  const fileDigest = sha256(Buffer.from(sourceText, 'utf8'));
  if (fileDigest !== expectedTaskFileSha256) throw new Error('NEXT_STEP_SOURCE_REVISION_MISMATCH');
  const lines = sourceText.split(/\r?\n/);
  const start = task.line - 1;
  if (start >= lines.length) throw new Error('NEXT_STEP_TASK_LINE_OUT_OF_RANGE');
  const block = taskBlock(lines, start);
  if (blockHash(block) !== task.blockHash) throw new Error('NEXT_STEP_TASK_BLOCK_MISMATCH');
  const starts = lineStarts(sourceText);
  const observations = [];
  block.forEach((line, blockOffset) => {
    const lineNumber = start + blockOffset + 1;
    const startChar = starts[lineNumber - 1];
    if (startChar === undefined || lines[lineNumber - 1] !== line) throw new Error('NEXT_STEP_TASK_LINE_MISMATCH');
    const add = (field, rawValue, valueStart, valueEnd) => {
      const startByte = Buffer.byteLength(sourceText.slice(0, valueStart), 'utf8');
      const endByte = Buffer.byteLength(sourceText.slice(0, valueEnd), 'utf8');
      const bytes = Buffer.from(sourceText, 'utf8').subarray(startByte, endByte);
      observations.push({
        field,
        value: rawValue.trim().replace(/^`|`$/g, '').trim(),
        evidenceText: bytes.toString('utf8'),
        startByte,
        endByte,
        line: lineNumber,
        evidenceSha256: sha256(bytes),
      });
    };
    if (blockOffset === 0) {
      const checkbox = line.match(/^\s*-\s*\[([ xX])\]/);
      if (checkbox) {
        const startCharInLine = line.indexOf(checkbox[1]);
        add('authoredCheckboxStatus', checkbox[1].toLowerCase() === 'x' ? 'CHECKED' : 'OPEN',
          startChar + startCharInLine, startChar + startCharInLine + 1);
      }
    }
    if (blockOffset > 0 && /^\s*-\s*\[[ xX]\]\s+/.test(line)) return;
    for (const [field, pattern] of LABELS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const value = match[1].trim();
      if (!value) continue;
      const valueIndex = line.indexOf(match[1]) + (match[1].length - match[1].trimStart().length);
      add(field, value, startChar + valueIndex, startChar + valueIndex + value.length);
    }
  });
  observations.sort((left, right) => left.line - right.line || left.startByte - right.startByte || left.field.localeCompare(right.field));
  return {
    schema: 'atlas.next-step-observation.v1',
    taskRef: `${task.source}#L${task.line}`,
    taskKey: task.taskKey,
    taskSnapshotState: task.state ?? null,
    taskSnapshotExecutionState: task.executionState ?? null,
    taskFileSha256: fileDigest,
    taskBlockSha256: task.blockHash,
    workspaceRevision: null,
    authorityStatus: 'TASK_SOURCE_CURRENT_BYTES_UNBOUND_TO_WORKSPACE_REVISION',
    observations,
  };
}
