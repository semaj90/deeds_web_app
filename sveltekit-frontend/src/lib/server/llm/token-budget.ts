// @ts-ignore — gpt-tokenizer not yet installed; install when needed
import { encode } from 'gpt-tokenizer';

export function countTokens(text: string): number {
  return encode(text ?? '').length;
}

export function enforceTokenBudget(input: string, maxInputTokens = 12000) {
  const tokens = countTokens(input);

  if (tokens <= maxInputTokens) {
    return { text: input, tokens, truncated: false };
  }

  const clippedLength = Math.max(0, Math.floor((input.length * maxInputTokens) / tokens));
  const clippedText = input.slice(0, clippedLength);

  return {
    text: clippedText,
    tokens,
    truncated: true
  };
}

export function buildBudgetedContext(parts: {
  system: string;
  user: string;
  acePacket?: string;
  toolResults?: string;
  maxInputTokens?: number;
}) {
  const max = parts.maxInputTokens ?? 12000;

  const ordered = [
    ['system', parts.system, 2500],
    ['user', parts.user, 2000],
    ['acePacket', parts.acePacket ?? '', 4000],
    ['toolResults', parts.toolResults ?? '', 2000]
  ] as const;

  let final = '';

  for (const [name, text, cap] of ordered) {
    const tokens = countTokens(text);
    let clipped = text;

    if (tokens > cap) {
      const sliceLength = Math.max(0, Math.floor((text.length * cap) / tokens));
      clipped = text.slice(0, sliceLength);
    }

    final += `\n\n<${name}>\n${clipped}\n</${name}>`;
  }

  const total = countTokens(final);

  return {
    text: final.trim(),
    tokens: total,
    overBudget: total > max
  };
}
