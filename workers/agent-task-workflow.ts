import { ThinkWorkflow, type ThinkWorkflowStep } from '@cloudflare/think/workflows'
import type { AgentWorkflowEvent } from 'agents/workflows'
import { z } from 'zod'
import { newId, nowIso } from '../shared/ids'
import type { AgentTaskWorkflowParams, DiscoflareEnv } from './env'
import type { DiscoflareThink } from './discoflare-agent'
import { signalTasksChanged } from './task-events'

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
  boardId: string
  model: string
  instructions: string
}

export class AgentTaskWorkflow extends ThinkWorkflow<DiscoflareThink, AgentTaskWorkflowParams, Record<string, unknown>, DiscoflareEnv> {
  override async run(event: AgentWorkflowEvent<AgentTaskWorkflowParams>, step: ThinkWorkflowStep) {
    const { taskId, runId } = event.payload
    const task = await step.do('load-task', async () => {
      const row = await this.env.DB.prepare(
        `SELECT t.id, r.title_snapshot as title, r.description_snapshot as description,
         r.channel_id_snapshot as channelId, r.agent_id as agentId, t.board_id as boardId,
         r.agent_model_snapshot as model, r.agent_instructions_snapshot as instructions
         FROM task_runs r JOIN tasks t ON t.id = r.task_id JOIN agents a ON a.user_id = r.agent_id
         WHERE r.id = ? AND r.task_id = ? AND t.active_run_id = r.id AND r.status = 'queued' AND a.status = 'active'`,
      ).bind(runId, taskId).first<LoadedTask>()
      if (!row) throw new Error('Queued task run or active agent not found')
      return row
    })

    await step.do('mark-running', async () => {
      const now = nowIso()
      await this.env.DB.batch([
        this.env.DB.prepare("UPDATE tasks SET status = 'running', last_error = NULL, updated_at = ? WHERE id = ? AND active_run_id = ?").bind(now, taskId, runId),
        this.env.DB.prepare("UPDATE task_runs SET status = 'running', progress = 'Thinking', started_at = ? WHERE id = ? AND status = 'queued'").bind(now, runId),
      ])
      await signalTasksChanged(this.env, task.boardId, taskId)
      return { status: 'running' }
    })

    try {
      const result = await step.prompt('perform-task', {
        prompt: [
          `Task id: ${task.id}`,
          `Title: ${task.title}`,
          `Description:\n${task.description || '(none)'}`,
          `Assigned model at launch: ${task.model}`,
          task.instructions ? `Agent instructions at launch:\n${task.instructions}` : '',
          task.channelId ? `Report channel id: ${task.channelId}` : 'No report channel is attached.',
          'Perform the task. Use your computer tools for concrete work. Return done only when the requested outcome is complete; otherwise return review with an honest summary and details.',
        ].filter(Boolean).join('\n\n'),
        output: outputSchema,
        timeout: '1 day',
      })

      await step.do('record-result', async () => {
        const now = nowIso()
        await this.env.DB.batch([
          this.env.DB.prepare(
            `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at)
             SELECT ?, ?, 'task.complete', 'task', ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM task_runs r JOIN tasks t ON t.id = r.task_id
               WHERE r.id = ? AND r.status = 'running' AND t.active_run_id = r.id
             )`,
          ).bind(newId(), task.agentId, taskId, JSON.stringify({ runId, status: result.status }), now, runId),
          this.env.DB.prepare(
            'UPDATE tasks SET status = ?, result_summary = ?, result_details = ?, last_error = NULL, active_run_id = NULL, updated_at = ? WHERE id = ? AND active_run_id = ?',
          ).bind(result.status, result.summary, result.details, now, taskId, runId),
          this.env.DB.prepare(
            "UPDATE task_runs SET status = 'completed', progress = NULL, summary = ?, details = ?, completed_at = ? WHERE id = ? AND status = 'running'",
          ).bind(result.summary, result.details, now, runId),
          this.env.DB.prepare('UPDATE agents SET last_active_at = ?, updated_at = ? WHERE user_id = ?')
            .bind(now, now, task.agentId),
        ])
        await signalTasksChanged(this.env, task.boardId, taskId)
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
      const persisted = await step.do('inspect-error-state', async () => this.env.DB.prepare(
        `SELECT r.status as runStatus, r.summary, r.details, t.status as taskStatus
         FROM task_runs r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?`,
      ).bind(runId).first<{ runStatus: string; summary: string | null; details: string | null; taskStatus: string }>())
      if (persisted?.runStatus === 'completed') {
        await step.do('record-follow-up-failure', async () => {
          const now = nowIso()
          await this.env.DB.batch([
            this.env.DB.prepare('UPDATE tasks SET last_error = ?, updated_at = ? WHERE id = ?')
              .bind(`Result saved, but follow-up failed: ${message}`, now, taskId),
            this.env.DB.prepare(
              "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, 'task.follow_up_failed', 'task', ?, ?, ?)",
            ).bind(newId(), task.agentId, taskId, JSON.stringify({ runId, error: message }), now),
          ])
          await signalTasksChanged(this.env, task.boardId, taskId)
          return { recorded: true }
        })
        return {
          status: persisted.taskStatus === 'done' ? 'done' as const : 'review' as const,
          summary: persisted.summary ?? 'Task completed',
          details: persisted.details ?? '',
        }
      }
      await step.do('record-failure', async () => {
        const now = nowIso()
        await this.env.DB.batch([
          this.env.DB.prepare(
            `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at)
             SELECT ?, ?, 'task.fail', 'task', ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM task_runs r JOIN tasks t ON t.id = r.task_id
               WHERE r.id = ? AND r.status <> 'cancelled' AND t.active_run_id = r.id
             )`,
          ).bind(newId(), task.agentId, taskId, JSON.stringify({ runId, error: message }), now, runId),
          this.env.DB.prepare("UPDATE tasks SET status = 'failed', last_error = ?, active_run_id = NULL, updated_at = ? WHERE id = ? AND active_run_id = ?").bind(message, now, taskId, runId),
          this.env.DB.prepare("UPDATE task_runs SET status = 'failed', progress = NULL, error = ?, completed_at = ? WHERE id = ? AND status <> 'cancelled'").bind(message, now, runId),
        ])
        await signalTasksChanged(this.env, task.boardId, taskId)
        return { failed: true }
      })
      throw error
    }
  }
}
