import type { TaskBoardDTO, TaskDTO, TaskRunDTO } from '../../../../shared/types'
import { requireMember } from '../../../utils/guards'
import { cf } from '../../../utils/cf'

type BoardRow = Omit<TaskBoardDTO, 'tasks'>
type TaskRow = Omit<TaskDTO, 'latestRun'>

export default defineEventHandler(async (event): Promise<{ boards: TaskBoardDTO[] }> => {
  const workspaceId = getRouterParam(event, 'id')!
  await requireMember(event, workspaceId)
  const { env } = cf(event)
  const [boardResult, taskResult, runResult] = await Promise.all([
    env.DB.prepare(
      'SELECT id, name, position, created_by as createdBy, created_at as createdAt, updated_at as updatedAt FROM task_boards ORDER BY position, created_at',
    ).all<BoardRow>(),
    env.DB.prepare(
      `SELECT id, board_id as boardId, title, description, status, position, assignee_id as assigneeId,
       channel_id as channelId, created_by as createdBy, result_summary as resultSummary,
       result_details as resultDetails, last_error as lastError, created_at as createdAt, updated_at as updatedAt
       FROM tasks ORDER BY position, created_at`,
    ).all<TaskRow>(),
    env.DB.prepare(
      `SELECT r.id, r.task_id as taskId, r.agent_id as agentId, r.workflow_id as workflowId, r.status,
       r.summary, r.details, r.error, r.started_at as startedAt, r.completed_at as completedAt, r.created_at as createdAt
       FROM task_runs r
       WHERE r.id = (SELECT newest.id FROM task_runs newest WHERE newest.task_id = r.task_id ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1)`,
    ).all<TaskRunDTO>(),
  ])
  const latestRuns = new Map((runResult.results ?? []).map(run => [run.taskId, run]))
  const taskRows = (taskResult.results ?? []).map(task => ({ ...task, latestRun: latestRuns.get(task.id) ?? null }))
  return {
    boards: (boardResult.results ?? []).map(board => ({
      ...board,
      tasks: taskRows.filter(task => task.boardId === board.id),
    })),
  }
})
