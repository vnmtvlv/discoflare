import { ThinkWorkflow, type ThinkWorkflowStep } from '@cloudflare/think/workflows'
import type { AgentWorkflowEvent } from 'agents/workflows'
import { z } from 'zod'
import type { AgentMessageWorkflowParams, DiscoflareEnv } from './env'
import type { DiscoflareAgent } from './discoflare-agent'

const outputSchema = z.object({
  reply: z.string().min(1).max(2000),
})

export class AgentMessageWorkflow extends ThinkWorkflow<DiscoflareAgent, AgentMessageWorkflowParams, Record<string, unknown>, DiscoflareEnv> {
  override async run(event: AgentWorkflowEvent<AgentMessageWorkflowParams>, step: ThinkWorkflowStep) {
    const { channelId, authorName, content } = event.payload
    const result = await step.prompt('reply-to-message', {
      prompt: [
        `${authorName} sent you this workspace message:`,
        content,
        'Respond as a helpful workspace participant. Use tools when concrete work is requested. Keep the chat reply under 2000 characters.',
      ].join('\n\n'),
      output: outputSchema,
      timeout: '1 day',
    })
    await step.do('post-reply', async () => {
      await this.agent.postMessage(channelId, result.reply)
      return { posted: true }
    })
    return result
  }
}
