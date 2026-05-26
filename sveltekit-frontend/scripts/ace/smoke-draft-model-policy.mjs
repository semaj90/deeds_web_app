import process from 'node:process';
import { shouldUseDraftModel } from '../../src/lib/server/ai/draft-model-policy.ts';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(shouldUseDraftModel('gemma4-rotorquant:latest', true) === true, 'text TurboQuant should keep draft enabled');
  assert(shouldUseDraftModel('gemma4-vlm', true) === false, 'VLM requests should disable draft');
  assert(shouldUseDraftModel('gemma4-mmproj', true) === false, 'mmproj requests should disable draft');
  assert(shouldUseDraftModel('gemma4-rotorquant:latest', false) === false, 'TurboQuant unavailable should disable draft');

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        draftPolicy: {
          textTurboQuant: true,
          vlm: false,
          mmproj: false,
          turboUnavailable: false,
        },
      },
      null,
      2
    )
  );
}

main();
