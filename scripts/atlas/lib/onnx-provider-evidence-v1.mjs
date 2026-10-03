/**
 * Keep requested ONNX execution providers distinct from observed execution.
 * `listSupportedBackends()` proves backend availability, not per-node execution.
 */
export function describeOnnxProviderEvidence(requestedProvider, supportedBackends) {
  const supportedProviderNames = Array.isArray(supportedBackends)
    ? supportedBackends
        .map((backend) => (typeof backend === 'string' ? backend : backend?.name))
        .filter((name) => typeof name === 'string' && name.length > 0)
        .sort()
    : [];

  return {
    requestedProvider,
    runtimeAdvertised: supportedProviderNames.includes(requestedProvider),
    supportedProviderNames,
    actualProvider: null,
    actualProviderVerified: false,
    attribution: 'UNVERIFIED_PER_NODE_EXECUTION',
    fallbackVisibility: 'NOT_EXPOSED_BY_PROVIDER_LIST',
  };
}
