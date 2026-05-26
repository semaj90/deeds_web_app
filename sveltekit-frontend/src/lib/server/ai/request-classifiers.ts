export function isVlmOrMmprojRequestModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes('vlm') || normalized.includes('vision') || normalized.includes('mmproj') || normalized.includes('image');
}
