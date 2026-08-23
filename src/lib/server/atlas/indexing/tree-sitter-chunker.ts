export type TreeSitterChunk = {
  source_ref: string;
  start_offset: number;
  end_offset: number;
  text: string;
};

export function chunkSourceText(sourceRef: string, text: string, chunkSize = 2000, overlap = 250): TreeSitterChunk[] {
  const chunks: TreeSitterChunk[] = [];
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    chunks.push({ source_ref: sourceRef, start_offset: offset, end_offset: end, text: text.slice(offset, end) });
    if (end >= text.length) break;
    offset = Math.max(0, end - overlap);
  }
  return chunks;
}

