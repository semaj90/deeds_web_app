export function classifyImageReference(image) {
  if (/\$/.test(image)) return 'BUILD_ARG_SUBSTITUTED';
  if (/@sha256:[a-f0-9]{64}$/i.test(image)) return 'DIGEST_PINNED';
  const leaf = image.split('/').at(-1);
  if (!leaf.includes(':') || leaf.endsWith(':latest')) return 'FLOATING_TAG';
  return 'TAG_PINNED_ONLY';
}

/** Static default-ARG analysis. Build-time overrides require separate evidence. */
export function parseDockerBaseReferences(text) {
  const args = new Map();
  const aliases = new Map();
  const stages = [];
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  for (const line of lines) {
    const arg = line.match(/^\s*ARG\s+([A-Za-z_][\w]*)(?:=(.*))?\s*$/i);
    if (arg && stages.length === 0 && arg[2] !== undefined) args.set(arg[1], arg[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
    const from = line.match(/^\s*FROM\s+((?:--\S+\s+)*)((?:\S+))(?:\s+AS\s+(\S+))?\s*$/i);
    if (!from) continue;
    const image = from[2];
    const dynamic = image.includes('$');
    const resolvedImage = image.replace(/\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g, (whole, a, b) => args.get(a ?? b) ?? whole);
    const parent = aliases.get(resolvedImage.toLowerCase());
    const scratch = resolvedImage === 'scratch';
    const externalBase = parent ? parent.externalBase : scratch ? null : resolvedImage;
    const pinStatus = parent ? parent.pinStatus : scratch ? 'NO_EXTERNAL_BASE' : classifyImageReference(resolvedImage);
    const stage = {
      stageIndex: stages.length,
      stageName: from[3] ?? null,
      image,
      resolvedImage,
      externalBase,
      inheritedFromStage: parent?.stageIndex ?? null,
      platform: from[1].match(/--platform=(\S+)/)?.[1] ?? null,
      pinStatus,
      classification: parent ? 'INTERNAL_STAGE_REFERENCE' : scratch ? 'SCRATCH' : dynamic ? pinStatus === 'DIGEST_PINNED' ? 'DYNAMIC_ARG_PINNED' : 'DYNAMIC_ARG_UNRESOLVED' : pinStatus === 'DIGEST_PINNED' ? 'EXTERNAL_PINNED_DIGEST' : pinStatus === 'TAG_PINNED_ONLY' ? 'EXTERNAL_VERSION_TAG_ONLY' : 'EXTERNAL_FLOATING',
      argumentEvidence: dynamic ? 'DOCKERFILE_DEFAULTS_ONLY_OVERRIDES_NOT_VERIFIED' : null,
    };
    stages.push(stage);
    if (stage.stageName) aliases.set(stage.stageName.toLowerCase(), stage);
  }
  return stages;
}
