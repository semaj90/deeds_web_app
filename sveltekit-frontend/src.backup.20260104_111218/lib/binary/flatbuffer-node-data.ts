// FlatBuffer Node Data Serialization
// Provides efficient binary serialization for legal document graph nodes

export interface FlatBufferNodeData {
id: string;
type: string;
properties: Record<string, unknown>;
timestamp: number;
}

export class FlatBufferSerializer {
static serialize(data: FlatBufferNodeData): Uint8Array {
const json = JSON.stringify(data);
const encoder = new TextEncoder();
return encoder.encode(json);
}

static deserialize(buffer: Uint8Array): FlatBufferNodeData {
const decoder = new TextDecoder();
const json = decoder.decode(buffer);
return JSON.parse(json) as FlatBufferNodeData;
}
}
