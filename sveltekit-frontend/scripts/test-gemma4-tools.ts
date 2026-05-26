import { streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const provider = createOpenAICompatible({
  name: 'bifrost-local',
  baseURL: 'http://127.0.0.1:8090/v1',
  apiKey: 'local'
});

async function main() {
  const result = streamText({
    model: provider('gemma4-offload'),
    prompt: 'Say hello from Gemma4 through Bifrost.'
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log();
}

main().catch(console.error);
