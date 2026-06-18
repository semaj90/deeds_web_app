import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// Vercel AI SDK provider pointing at the Bifrost semantic cache gateway.
// Bifrost exposes an OpenAI-compatible /v1 API and transparently applies
// L1 exact-match + L2 semantic cache before forwarding to the llama-server.exe
// synthesis lane on TurboQuant :8090.
// Windows host (dev):  BIFROST_OPENAI_BASE_URL=http://127.0.0.1:3040/v1
// Docker-to-Docker:    BIFROST_OPENAI_BASE_URL=http://legal-ai-bifrost:8080/v1
export const bifrost = createOpenAICompatible({
  name: 'bifrost',
  baseURL: process.env.BIFROST_OPENAI_BASE_URL ?? 'http://127.0.0.1:3040/v1',
  apiKey: process.env.BIFROST_API_KEY ?? 'local-dev-key',
})


