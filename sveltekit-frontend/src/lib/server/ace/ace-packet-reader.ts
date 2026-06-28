import {
  readAcePacketById,
  readLatestAcePacket,
  readAcePacketBySourceRef,
  readAcePacketByCluster,
  readAcePacketsByFeature,
  readAcePacketByTask,
  type AceFullPacket,
} from './ace-packet-store.js';

export interface AcePacketReaderOptions {
  source?: string;
}

export interface PacketLoadResult {
  packet: AceFullPacket | null;
  source: string;
}

export class AcePacketReader {
  constructor(private readonly options: AcePacketReaderOptions = {}) {}

  async readById(packetId: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketById(packetId),
      source: this.options.source ?? 'redis',
    };
  }

  async readLatest(): Promise<PacketLoadResult> {
    return {
      packet: await readLatestAcePacket(),
      source: this.options.source ?? 'redis',
    };
  }

  async readBySourceRef(sourceRef: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketBySourceRef(sourceRef),
      source: this.options.source ?? 'redis',
    };
  }

  async readByCluster(row: number, col: number): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketByCluster(row, col),
      source: this.options.source ?? 'redis',
    };
  }

  async readByFeature(featureId: string, limit = 5): Promise<AceFullPacket[]> {
    return readAcePacketsByFeature(featureId, limit);
  }

  async readByTask(taskId: string): Promise<PacketLoadResult> {
    return {
      packet: await readAcePacketByTask(taskId),
      source: this.options.source ?? 'redis',
    };
  }
}

export function createAcePacketReader(options: AcePacketReaderOptions = {}): AcePacketReader {
  return new AcePacketReader(options);
}
