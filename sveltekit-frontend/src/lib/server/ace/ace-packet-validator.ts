import { validateAcePacket as validateStoredPacket, type AceFullPacket } from './ace-packet-store.js';
import { validateAceSchema } from '$lib/server/ai/ace-schema-validator.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SafetyCheckResult {
  allowed: boolean;
  reasons: string[];
}

export class AcePacketValidator {
  validate(packet: Partial<AceFullPacket>): ValidationResult {
    return validateStoredPacket(packet);
  }

  validateText(text: string): SafetyCheckResult {
    const result = validateAceSchema({ text });
    return {
      allowed: result.valid,
      reasons: [
        ...result.blockedTerms,
        ...result.missingIdentity,
        ...result.schemaViolations,
        ...result.unsafeOperations,
      ],
    };
  }
}

export function createAcePacketValidator(): AcePacketValidator {
  return new AcePacketValidator();
}
