import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { aiProvider, resolveAgentModelId, type DiscoflareEnv } from './env'

/**
 * Workers AI keeps the model id string so Think resolves it through the `AI` binding.
 * An OpenAI-compatible endpoint must be a LanguageModel: a string would be sent to `env.AI`.
 */
export function modelForAgent(env: DiscoflareEnv, profileModel?: string | null): LanguageModel | string {
  const modelId = resolveAgentModelId(env, profileModel)
  if (aiProvider(env) !== 'openai-compatible') return modelId
  const baseURL = env.AI_BASE_URL!.trim().replace(/\/+$/, '')
  return createOpenAI({
    baseURL,
    apiKey: env.AI_API_KEY!.trim(),
  }).chat(modelId)
}
