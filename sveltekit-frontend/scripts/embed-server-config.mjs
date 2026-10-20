export function resolveEmbedServerConfig(env = process.env) {
  const parseInteger = (name, fallback) => {
    const value = env[name] ?? String(fallback);
    if (!/^-?\d+$/.test(value)) throw new Error('EMBED_SERVER_CONFIG_VALUES_MUST_BE_INTEGERS');
    return Number(value);
  };
  const context = parseInteger('EMBED_SERVER_CTX', 2048);
  const batch = parseInteger('EMBED_BATCH_SIZE', context);
  const microBatch = parseInteger('EMBED_UBATCH_SIZE', context);
  const gpuLayers = parseInteger('EMBED_SERVER_NGL', 0);
  if (context < 1 || gpuLayers < 0) {
    throw new Error('EMBED_SERVER_CONFIG_VALUES_OUT_OF_RANGE');
  }
  if (batch !== microBatch) {
    throw new Error('EMBED_BATCH_SIZE_MUST_MATCH_EMBED_UBATCH_SIZE');
  }
  if (batch < context) {
    throw new Error('EMBED_BATCH_SIZE_MUST_COVER_EMBED_SERVER_CTX');
  }

  return { context, batch, microBatch, gpuLayers };
}
