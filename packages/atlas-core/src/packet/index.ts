/**
 * Packet module barrel export
 * Central location for all packet identity, validation, and lifecycle
 */

export {
  PacketIdentitySchema,
  type PacketIdentity,
  type PacketKey,
  type SourceRef,
  type FeatureId,
  createPacketKey,
  createSourceRef,
  createFeatureId,
  extractPacketIdentity,
  validatePacketIdentity,
  identitiesEqual,
  mergePacketIdentities,
} from './identity.js';
