import { ThinkWorkflow, type ThinkWorkflowStep } from '@cloudflare/think/workflows'
import type { AgentWorkflowEvent } from 'agents/workflows'
import { z } from 'zod'
import { nowIso } from '../shared/ids'
import type { AgentTaskWorkflowParams, DiscoflareEnv } from './env'
import type { DiscoflareAgent } from './discoflare-agent'

const outputSchema = z.object({
  status: z.enum(['review', 'done']),
  summary: z.string().min(1).max(2000),
  details: z.string().max(20_000),
})

type LoadedTask = {
  id: string
  title: string
  description: string
  channelId: string | null
  agentId: string
  agentName: string
}

export class AgentTaskWorkflow extends ThinkWorkflow<DiscoflareAgent, AgentTaskWorkflowParams, Record<string, unknown>, DiscoflareEnv> {
  override async run(event: AgentWorkflowEvent<AgentTaskWorkflowParams>, step: ThinkWorkflowStep) {
    const { taskId, runId } = event.payload
    const task = await step.do('load-task', async () => {
      const row = await this.env.DB.prepare(
        `SELECT t.id, t.title, t.description, t.channel_id as channelId, t.assignee_id as agentId, u.display_name as agentName
         FROM tasks t JOIN agents a ON a.user_id = t.assignee_id JOIN users u ON u.id = a.user_id
         WHERE t.id = ? AND a.status = 'active'`,
      ).bind(taskId).first<LoadedTask>()
      if (!row) throw new Error('Assigned task or active agent not found')
      return row
    })

    await step.do('mark-running', async () => {
      const now = nowIso()
      await this.env.DB.batch([
        this.env.DB.prepare("UPDATE tasks SET status = 'running', last_error = NULL, updated_at = ? WHERE id = ?").bind(now, taskId),
        this.env.DB.prepare("UPDATE task_runs SET status = 'running', started_at = ? WHERE id = ?").bind(now, runId),
      ])
      return { status: 'running' }
    })

    try {
      const result = await step.prompt('perform-task', {
        prompt: [
          `Task id: ${task.id}`,
          `Title: ${task.title}`,
          `Description:\n${task.description || '(none)'}`,
          task.channelId ? `Report channel id: ${task.channelId}` : 'No report channel is attached.',
          'Perform the task. Use your computer tools for concrete work. Return done only when the requested outcome is complete; otherwise return review with an honest summary and details.',
        ].join('\n\n'),
        output: outputSchema,
        timeout: '1 day',
      })

      await step.do('record-result', async () => {
        const now = nowIso()
        await this.env.DB.batch([
          this.env.DB.prepare(
            'UPDATE tasks SET status = ?, result_summary = ?, result_details = ?, last_error = NULL, updated_at = ? WHERE id = ?',
          ).bind(result.status, result.summary, result.details, now, taskId),
          this.env.DB.prepare(
            "UPDATE task_runs SET status = 'completed', summary = ?, details = ?, completed_at = ? WHERE id = ?",
          ).bind(result.summary, result.details, now, runId),
          this.env.DB.prepare('UPDATE agents SET last_active_at = ?, updated_at = ? WHERE user_id = ?')
            .bind(now, now, task.agentId),
        ])
        return { status: result.status }
      })

      if (task.channelId) {
        await step.do('post-result', async () => {
          await this.agent.postMessage(task.channelId!, `**${task.title}**\n\n${result.summary}`)
          return { posted: true }
        })
      }
      return result
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await step.do('record-failure', async () => {
        const now = nowIso()
        await this.env.DB.batch([
          this.env.DB.prepare("UPDATE tasks SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?").bind(message, now, taskId),
          this.env.DB.prepare("UPDATE task_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").bind(message, now, runId),
        ])
        return { failed: true }
      })
      throw error
    }
  }
}
