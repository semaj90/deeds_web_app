import { readFileSync } from 'node:fs';

/**
 * Extracts messages, enums, and services from .proto files.
 */
export function extractProtoMetadata(protoPath: string): {
  messages: string[];
  enums: string[];
  services: string[];
} {
  try {
    const content = readFileSync(protoPath, 'utf8');
    const messages: string[] = [];
    const enums: string[] = [];
    const services: string[] = [];

    const msgMatches = content.matchAll(/message\s+(\w+)\s*\{/g);
    for (const m of msgMatches) messages.push(m[1]);

    const enumMatches = content.matchAll(/enum\s+(\w+)\s*\{/g);
    for (const m of enumMatches) enums.push(m[1]);

    const svcMatches = content.matchAll(/service\s+(\w+)\s*\{/g);
    for (const m of svcMatches) services.push(m[1]);

    return {
      messages: Array.from(new Set(messages)),
      enums: Array.from(new Set(enums)),
      services: Array.from(new Set(services))
    };
  } catch (err) {
    return { messages: [], enums: [], services: [] };
  }
}
