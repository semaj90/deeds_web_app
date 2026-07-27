import * as crypto from 'crypto';
import { FeatureDomainPacket, createFeaturePacket } from '../src/lib/core/data-hashing'; // Adjust path as necessary

// Helper function to mimic the canonicalJsonString logic for testing purposes
function canonicalJsonString(obj: Record<string, any>): string {
    function serialize(item: any): string {
        if (typeof item !== 'object' || item === null) {
            return String(item);
        }
        
        // Handle Arrays: Sort by content and then serialize
        if (Array.isArray(item)) {
            return `[${item.map(sub => serialize(sub)).join(',')}]`;
        }

        // Handle Objects: Sort keys and serialize key-value pairs
        const keys = Object.keys(item).sort();
        let result = '{';
        let content = [];
        
        for (const key of keys) {
            const value = item[key];
            
            if (typeof value === 'object' && value !== null) {
                content.push(`"${key}": ${serialize(value)}`);
            } else {
                // Basic types (strings, numbers, booleans)
                content.push(`"${key}": ${JSON.stringify(value)}`);
            }
        }
        
        result += content.join(', ') + `}`;
        return result;
    }

    return serialize(obj);
}

/**
 * @module FeatureDomainPacket
 * @description Defines the canonical, versioned container for a feature's data snapshot.
 * This object is the single source of truth for data used in model training and RAG/Atlas indexing.
 * All instances MUST be versioned via their content hash and feature schema version.
 */
export class FeatureDomainPacket {
    /**
     * @type {string} The unique identifier for the feature (e.g., "jurisdiction:contract_review").
     */
    public featureId: string;

    /**
     * @type {number} The version of the schema used to create this packet.
     */
    public featureSchemaVersion: number;

    /**
     * @type {string} The content hash (SHA256) derived from the packet's entire serialized data.
     * This value must be immutable for the packet to remain canonical.
     */
    public semanticSha256: string;

    /**
     * @type {Date} The time the packet was created or last updated.
     */
    public createdAt: Date;

    /**
     * @private
     * @typedef {Object} InternalData
     * @property {Record<string, any>} data - The raw, structured data payload.
     * @property {Record<string, any>} metadata - Associated metadata (e.g., source_ref, context_id).
     */

    /**
     * @param {string} featureId - The canonical feature identifier.
     * @param {number} featureSchemaVersion - The version number of the data structure used.
     * @param {Object} rawData - The raw data payload containing data and metadata.
     */
    constructor(featureId: string, featureSchemaVersion: number, rawData: { data: Record<string, any>, metadata: Record<string, any> }) {
        this.featureId = featureId;
        this.featureSchemaVersion = featureSchemaVersion;
        this.data = rawData.data;
        this.metadata = rawData.metadata;
        this.createdAt = new Date();
        this.semanticSha256 = "PENDING_HASH";
    }

    /**
     * Computes the canonical, deterministic hash for the current state of the packet.
     * This method must be deterministic: the same inputs MUST always produce the same hash.
     * @returns {string} The SHA256 hash of the serialized state.
     */
    public calculateHash(): string {
        // 1. Canonicalize Data: Combine data and metadata into a single, canonical object structure.
        const canonicalData: Record<string, any> = {
            data: this.data,
            metadata: this.metadata
        };

        // 2. Deterministic Serialization: Use the canonical serializer.
        const canonicalJson: string = canonicalJsonString(canonicalData);
        
        // 3. Hashing: Hash the resulting string payload using SHA256.
        return crypto.createHash('sha256').update(canonicalJson).digest('hex');
    }

    /**
     * Creates a new, transient FeatureDomainPacket instance and calculates its initial hash.
     * @param {string} featureId 
     * @param {number} schemaVersion 
     * @param {{ data: Record<string, any>, metadata: Record<string, any> }} rawData 
     * @returns {FeatureDomainPacket} A fully constructed, hashed packet.
     */
    export function createFeaturePacket(featureId: string, schemaVersion: number, rawData: { data: Record<string, any>, metadata: Record<string, any> }): FeatureDomainPacket {
        const packet = new FeatureDomainPacket(featureId, schemaVersion, rawData);
        // Calculate the hash immediately to set the canonical identity.
        packet.semanticSha256 = packet.calculateHash(); 
        return packet;
    }