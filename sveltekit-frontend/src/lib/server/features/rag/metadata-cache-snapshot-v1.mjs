const encoder = new TextEncoder();

export async function collectBoundedMetadataSnapshot(readPage, options) {
  const maxPoints = options.maxPoints;
  const maxBytes = options.maxBytes;
  const maxPages = options.maxPages;
  const deadlineAt = options.now() + options.deadlineMs;
  const items = [];
  const seenOffsets = new Set();
  let estimatedBytes = 0;
  let offset = null;
  let pages = 0;

  while (true) {
    if (pages >= maxPages) {
      return failure('page_limit', items.length, estimatedBytes);
    }

    const page = await readPage(offset);
    if (options.now() >= deadlineAt) {
      return failure('deadline', items.length, estimatedBytes);
    }
    if (!page || !Array.isArray(page.points)) {
      return failure('invalid_page', items.length, estimatedBytes);
    }

    pages++;
    for (const point of page.points) {
      const item = options.mapPoint(point);
      const itemBytes = encoder.encode(JSON.stringify(item)).byteLength;
      if (items.length + 1 > maxPoints) {
        return failure('point_limit', items.length, estimatedBytes);
      }
      if (estimatedBytes + itemBytes > maxBytes) {
        return failure('byte_limit', items.length, estimatedBytes);
      }
      items.push(item);
      estimatedBytes += itemBytes;
    }

    const nextOffset = page.nextOffset ?? null;
    if (nextOffset === null) {
      return { ok: true, items, pointCount: items.length, estimatedBytes, pages };
    }
    const offsetKey = `${typeof nextOffset}:${String(nextOffset)}`;
    if (seenOffsets.has(offsetKey)) {
      return failure('repeated_offset', items.length, estimatedBytes);
    }
    seenOffsets.add(offsetKey);
    offset = nextOffset;
  }
}

function failure(reason, pointCount, estimatedBytes) {
  return { ok: false, reason, pointCount, estimatedBytes };
}
