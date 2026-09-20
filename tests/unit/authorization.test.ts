import { describe, expect, it } from 'vitest'
import { authorize, AuthorizationError, WorkspaceAction, type AuthorizationContext } from '../../shared/authorization'
import { Permission } from '../../shared/permissions'
import { taskRunIdFromTurnMetadata } from '../../workers/agent-task-context'

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    workspaceId: 'main',
    principal: { id: 'agent-1', kind: 'agent', roleId: 'role-1', roleName: 'Agent', permissions: Permission.manageTasks, isOwner: false },
    credential: { kind: 'mcp', id: 'token-1', scopes: ['tasks:read'] },
    ...overrides,
  }
}

describe('workspace authorization', () => {
  it('intersects current role, credential scope, and run delegation', () => {
    const allowed = context({ delegation: { by: 'human-1', taskRunId: 'run-1', actions: [WorkspaceAction.readTasks] } })
    expect(() => authorize(allowed, WorkspaceAction.readTasks)).not.toThrow()
    expect(() => authorize(allowed, WorkspaceAction.writeTasks)).toThrow(AuthorizationError)

    const missingScope = context({ credential: { kind: 'mcp', scopes: ['documents:read'] } })
    expect(() => authorize(missingScope, WorkspaceAction.readTasks)).toThrow('tasks:read scope')

    const missingRole = context({ principal: { ...context().principal, permissions: 0 } })
    expect(() => authorize(missingRole, WorkspaceAction.readTasks)).toThrow('Agent role')
  })

  it('resolves the durable Workflow id as the Task Run id', () => {
    expect(taskRunIdFromTurnMetadata({
      __thinkWorkflowPrompt: { workflow: { name: 'AGENT_TASK_WORKFLOW', id: 'run-42' } },
    })).toBe('run-42')
    expect(taskRunIdFromTurnMetadata({
      __thinkWorkflowPrompt: { workflow: { name: 'OTHER_WORKFLOW', id: 'run-42' } },
    })).toBeNull()
  })
})
