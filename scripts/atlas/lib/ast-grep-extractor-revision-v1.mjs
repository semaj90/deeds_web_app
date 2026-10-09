export function resolveAstGrepExtractorRevisionV1(packageMetadata) {
  if (packageMetadata?.name !== '@ast-grep/napi'
    || typeof packageMetadata.version !== 'string'
    || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageMetadata.version)) {
    throw new Error('AST_GREP_PACKAGE_IDENTITY_OR_VERSION_INVALID');
  }
  return `${packageMetadata.name}@${packageMetadata.version}`;
}
