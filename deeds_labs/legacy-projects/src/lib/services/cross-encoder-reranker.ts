export type AssistantInput = {
  content: string;
  metadata: {
    originalPartCount: number;
    usedPartCount: number;
    length: number;
  };
};

function normalizePiece(piece: string | { text: string }): string {
  const raw = typeof piece === 'string' ? piece : (piece?.text ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

export default function synthesizeAssistantInput(
  parts: Array<string | { text: string }>,
  options?: { maxLength?: number }
): AssistantInput {
  const maxLength = options?.maxLength ?? 10000;

  // Normalize and remove empty pieces
  const pieces = parts.map(normalizePiece).filter((p: string) => p.length > 0);

  // Join with double newlines to preserve logical separation
  let content = pieces.join('\n\n');

  // Truncate to allowed length
  if (content.length > maxLength) {
    content = content.slice(0, maxLength).trim();
  }

  return {
    content,
    metadata: {
      originalPartCount: parts.length,
      usedPartCount: pieces.length,
      length: content.length,
    },
  };
}
