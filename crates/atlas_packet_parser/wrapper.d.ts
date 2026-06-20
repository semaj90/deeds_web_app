export interface PacketChunkInfo {
  chunk_path: string;
  row_count: number;
  byte_size: number;
}

export interface PacketParserIndex {
  artifact_path: string;
  total_rows: number;
  chunks: PacketChunkInfo[];
}

export function parseLargeJsonToMsgpack(
  filePath: string,
  outputDir: string,
  chunkSize: number,
): string;
