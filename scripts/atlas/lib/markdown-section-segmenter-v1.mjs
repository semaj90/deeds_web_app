import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function lineTable(bytes) {
  const lines = [];
  let start = 0;
  for (let offset = 0; offset <= bytes.length; offset += 1) {
    if (offset === bytes.length || bytes[offset] === 0x0a) {
      const end = offset < bytes.length ? offset + 1 : offset;
      lines.push({ start, end, text: bytes.subarray(start, offset).toString('utf8').replace(/\r$/, '') });
      start = end;
    }
  }
  return lines;
}

function headingMatch(text) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(text);
  return match ? { level: match[1].length, title: match[2].replace(/[ \t]+#+\s*$/, '').trim() } : null;
}

function fenceMatch(text) {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(text);
  return match ? { marker: match[1][0], width: match[1].length, info: match[2].trim() } : null;
}

function rangeChecksum(bytes, startByte, endByte) {
  return sha256(bytes.subarray(startByte, endByte));
}

/**
 * Deterministically segments UTF-8 Markdown/API documentation. It owns only
 * document structure; canonical identity remains the downstream chunk adapter.
 */
export function segmentMarkdownSectionsV1({ sourceBytes, sourceRef, sourceRevision, workspaceRevision, segmenterRevision = 'markdown-section:v1' }) {
  if (!Buffer.isBuffer(sourceBytes)) throw new TypeError('sourceBytes must be a Buffer');
  if (!sourceRef || !sourceRevision || !workspaceRevision) throw new Error('source and workspace revisions are required');

  const lines = lineTable(sourceBytes);
  const headings = lines.map((line, index) => ({ ...headingMatch(line.text), index })).filter((entry) => entry.level);
  const sections = [];
  const stack = [];
  const starts = headings.length ? [...new Set([0, ...headings.map((heading) => heading.index)])] : [0];
  const headingPathAt = (lineIndex) => {
    const path = [];
    for (const heading of headings) {
      if (heading.index > lineIndex) break;
      while (path.length && path.at(-1).level >= heading.level) path.pop();
      path.push(heading);
    }
    return path.map((heading) => heading.title);
  };

  for (const startIndex of starts) {
    const heading = headings.find((candidate) => candidate.index === startIndex) ?? null;
    if (heading) {
      while (stack.length && stack.at(-1).level >= heading.level) stack.pop();
      stack.push(heading);
    }
    const endIndex = headings.find((candidate) => candidate.index > startIndex && (!heading || candidate.level <= heading.level))?.index ?? lines.length;
    const startByte = lines[startIndex]?.start ?? sourceBytes.length;
    const endByte = endIndex > startIndex && endIndex < lines.length ? lines[endIndex].start : sourceBytes.length;
    const headingPath = stack.map((item) => item.title);
    if (endByte > startByte) sections.push({
      sourceRef, sourceRevision, workspaceRevision, segmenterRevision,
      kind: 'MARKDOWN_SECTION', headingPath, startByte, endByte,
      textChecksum: rangeChecksum(sourceBytes, startByte, endByte),
      text: sourceBytes.subarray(startByte, endByte).toString('utf8'),
    });
  }

  const fences = [];
  let open = null;
  for (const line of lines) {
    const fence = fenceMatch(line.text);
    if (!fence && !open) continue;
    if (fence && !open) {
      open = { line, fence };
    } else if (fence && open && fence.marker === open.fence.marker && fence.width >= open.fence.width) {
      const startByte = open.line.start;
      const endByte = line.end;
      fences.push({
        sourceRef, sourceRevision, workspaceRevision, segmenterRevision,
        kind: 'FENCED_CODE_EXAMPLE', language: open.fence.info || null,
        headingPath: headingPathAt(lines.indexOf(open.line)), startByte, endByte,
        textChecksum: rangeChecksum(sourceBytes, startByte, endByte),
        text: sourceBytes.subarray(startByte, endByte).toString('utf8'),
      });
      open = null;
    }
  }

  return [...sections, ...fences].sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.kind.localeCompare(b.kind));
}

export function segmentMarkdownIdentityV1(segment) {
  const identity = {
    sourceRef: segment.sourceRef,
    sourceRevision: segment.sourceRevision,
    workspaceRevision: segment.workspaceRevision,
    segmenterRevision: segment.segmenterRevision,
    kind: segment.kind,
    headingPath: segment.headingPath,
    startByte: segment.startByte,
    endByte: segment.endByte,
    textChecksum: segment.textChecksum,
  };
  return { ...segment, text: undefined, segmentId: `markdown:${sha256(JSON.stringify(identity))}` };
}
