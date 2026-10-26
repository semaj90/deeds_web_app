import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const packetKey = z.string().regex(/^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const int8Quantization = z.object({
  scheme: z.literal('symmetric-per-tensor-int8'),
  scale: z.number().positive(),
  zeroPoint: z.literal(0),
  inputDtype: z.enum(['float32', 'float16']),
  calibrationChecksum: digest,
}).strict();

const dtypeBytes = {
  float32: 4,
  float16: 2,
  int8: 1,
  uint8: 1,
  int32: 4,
  uint32: 4,
  float64: 8,
} as const;

export const PacketRepresentationManifestV1Schema = z.object({
  schema: z.literal('atlas.packet-representation.v1'),
  packetKey,
  titleId: z.string().min(1),
  packetRevisionId: uuidV7,
  sourceRef: z.string().min(1),
  sourceRevision: digest,
  workspaceRevision: digest,
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  artifactManifestId: z.string().min(1),
  artifactManifestChecksum: digest,
  codec: z.enum(['raw-f32-le', 'raw-f16-le', 'raw-i8', 'arrow-ipc', 'mmap-raw']),
  byteOrder: z.enum(['little-endian', 'big-endian', 'container-defined', 'not-applicable']),
  dtype: z.enum(['float32', 'float16', 'int8', 'uint8', 'int32', 'uint32', 'float64']),
  shape: z.array(z.number().int().positive()).min(1),
  stridesBytes: z.array(z.number().int().nonnegative()).min(1),
  byteLength: z.number().int().positive(),
  contentDigest: digest,
  quantization: int8Quantization.optional(),
  storage: z.object({
    kind: z.literal('immutable-artifact-ref'),
    ref: z.string().min(1),
  }).strict(),
  executorAllowlist: z.array(z.enum(['cpu-simd', 'postgresql', 'turbovec', 'cuvs', 'rapids', 'pytorch', 'n-api'])).min(1),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.shape.length !== value.stridesBytes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stridesBytes'], message: 'STRIDE_RANK_MISMATCH' });
    return;
  }

  if (value.dtype === 'int8' && !value.quantization) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantization'], message: 'INT8_QUANTIZATION_METADATA_REQUIRED' });
  }
  if (value.dtype !== 'int8' && value.quantization) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantization'], message: 'QUANTIZATION_METADATA_ONLY_SUPPORTED_FOR_INT8' });
  }

  if (value.representationId === 'semantic_768' && value.shape.at(-1) !== 768) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shape'], message: 'SEMANTIC_768_REQUIRES_768_LAST_DIMENSION' });
  }

  const expectedCodec = value.dtype === 'float32' ? 'raw-f32-le'
    : value.dtype === 'float16' ? 'raw-f16-le'
      : value.dtype === 'int8' ? 'raw-i8' : null;
  if (expectedCodec && value.codec.startsWith('raw-') && value.codec !== expectedCodec) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['codec'], message: 'RAW_CODEC_DTYPE_MISMATCH' });
  }
  if (value.codec === 'raw-f32-le' || value.codec === 'raw-f16-le') {
    if (value.byteOrder !== 'little-endian') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteOrder'], message: 'RAW_FLOAT_CODEC_REQUIRES_LITTLE_ENDIAN' });
    }
  } else if (value.codec === 'raw-i8' && value.byteOrder !== 'not-applicable') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteOrder'], message: 'RAW_I8_BYTE_ORDER_NOT_APPLICABLE' });
  } else if ((value.codec === 'arrow-ipc' || value.codec === 'mmap-raw') && value.byteOrder !== 'container-defined') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteOrder'], message: 'CONTAINER_CODEC_REQUIRES_CONTAINER_BYTE_ORDER' });
  }

  const lastStride = value.stridesBytes.at(-1)!;
  if (lastStride < dtypeBytes[value.dtype]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stridesBytes'], message: 'INNERMOST_STRIDE_TOO_SMALL' });
  }
  if (value.codec.startsWith('raw-')) {
    const addressedBytes = dtypeBytes[value.dtype] + value.shape.reduce(
      (offset, dimension, index) => offset + (dimension - 1) * value.stridesBytes[index]!,
      0,
    );
    if (addressedBytes !== value.byteLength) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byteLength'], message: 'RAW_BUFFER_EXTENT_MISMATCH' });
    }
  }
});

export type PacketRepresentationManifestV1 = z.infer<typeof PacketRepresentationManifestV1Schema>;
