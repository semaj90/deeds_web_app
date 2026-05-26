const shaderModules = new Map<string, GPUShaderModule>();

export async function getShaderModule(
  device: GPUDevice,
  key: string,
  code: string
): Promise<GPUShaderModule> {
  const cached = shaderModules.get(key);
  if (cached) return cached;

  const module = device.createShaderModule({ label: key, code });
  shaderModules.set(key, module);
  return module;
}
