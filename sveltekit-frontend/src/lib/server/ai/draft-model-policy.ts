import { isVlmOrMmprojRequestModel } from './request-classifiers.js';

export function shouldUseDraftModel(model: string, turboQuantAvailable: boolean): boolean {
  return turboQuantAvailable && !isVlmOrMmprojRequestModel(model);
}
