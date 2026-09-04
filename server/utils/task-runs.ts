import { eq } from 'drizzle-orm'
import { nowIso } from '../../shared/ids'
import type { TaskStatus } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'
import { getDb } from './db'
import { taskRuns, tasks } from '../../drizzle/schema'

type WorkflowState = Awaited<ReturnType<WorkflowInstance['status']>>

export async function reconcileTaskRun(
  env: DiscoflareEnv,
  run: typeof taskRuns.$inferSelect,
): Promise<WorkflowState> {
  if (!run.workflowId) throw new Error('Workflow has not been attached to this run')
  const state = await (await env.AGENT_TASK_WORKFLOW.get(run.workflowId)).status()
  const now = nowIso()
  const db = getDb(env.DB)
  if (state.status === 'complete') {
    const output = state.output as { status?: TaskStatus; summary?: string; details?: string } | undefined
    const status = output?.status === 'review' || output?.status === 'done' ? output.status : 'review'
    const summary = output?.summary ?? run.summary ?? 'Workflow completed'
    const details = output?.details ?? run.details ?? ''
    await db.batch([
      db.update(taskRuns).set({ status: 'completed', progress: null, summary, details, error: null, completedAt: run.completedAt ?? now }).where(eq(taskRuns.id, run.id)),
      db.update(tasks).set({ status, resultSummary: summary, resultDetails: details, lastError: null, activeRunId: null, updatedAt: now }).where(eq(tasks.activeRunId, run.id)),
    ])
  }
  else if (state.status === 'errored') {
    const error = state.error?.message ?? 'Workflow failed'
    await db.batch([
      db.update(taskRuns).set({ status: 'failed', progress: null, error, completedAt: run.completedAt ?? now }).where(eq(taskRuns.id, run.id)),
      db.update(tasks).set({ status: 'failed', lastError: error, activeRunId: null, updatedAt: now }).where(eq(tasks.activeRunId, run.id)),
    ])
  }
  else if (state.status === 'terminated') {
    await db.batch([
      db.update(taskRuns).set({ status: 'cancelled', progress: null, cancelledAt: run.cancelledAt ?? now, completedAt: run.completedAt ?? now }).where(eq(taskRuns.id, run.id)),
      db.update(tasks).set({ status: run.taskStatusBefore, activeRunId: null, updatedAt: now }).where(eq(tasks.activeRunId, run.id)),
    ])
  }
  else if (state.status === 'running' || state.status === 'waiting' || state.status === 'waitingForPause') {
    await db.update(taskRuns).set({ status: 'running', startedAt: run.startedAt ?? now }).where(eq(taskRuns.id, run.id))
  }
  return state
}
