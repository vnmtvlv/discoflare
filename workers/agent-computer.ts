import {
  getWorkspace,
  type DurableObjectStorageLike,
  type WorkspaceClient,
  type WorkspaceOptions,
  WorkspaceProxy,
  withWorkspace,
} from '@cloudflare/computer'
import {
  CloudflareContainerBackend,
  withWorkspaceContainer,
} from '@cloudflare/computer/backends/container'
import { Agent } from 'agents'
import type { DiscoflareEnv } from './env'
import { createAgentComputer, type AgentComputer } from './agent-computer-adapter'

const WORKSPACE_ROOT = '/workspace'

class AgentBase extends Agent<DiscoflareEnv> {}

class AgentComputerContainerBase extends withWorkspaceContainer(AgentBase) {
  readonly computerBackend = new CloudflareContainerBackend({
    container: () => this,
    workspace: { binding: 'AGENT_DO', id: this.ctx.id.toString() },
    egress: { mode: 'direct' },
  })
}

function computerWorkspaceOptions(self: InstanceType<typeof AgentComputerContainerBase>): WorkspaceOptions {
  const { ctx } = self as unknown as { ctx: DurableObjectState }
  return {
    storage: ctx.storage as unknown as DurableObjectStorageLike,
    backends: [self.computerBackend],
  }
}

/** Durable Agent base that owns one @cloudflare/computer Workspace and its Container backend. */
export class AgentComputerHost extends withWorkspace(AgentComputerContainerBase, computerWorkspaceOptions) {
  override async onRequest(request: Request): Promise<Response> {
    return this.computerBackend.handleFetch(request)
  }
}

async function initializeComputer(workspace: WorkspaceClient): Promise<void> {
  await workspace.fs.mkdir(WORKSPACE_ROOT, { recursive: true })
}

/** Opens the stable Discoflare AgentComputer interface for one Agent DO. */
export async function openAgentComputer(env: DiscoflareEnv, agentId: string): Promise<AgentComputer> {
  const stub = env.AGENT_DO.getByName(`agent:${agentId}`)
  const workspace = await getWorkspace(stub as unknown as Parameters<typeof getWorkspace>[0])
  try {
    await initializeComputer(workspace)
    return createAgentComputer(workspace, async () => {
      const now = new Date().toISOString()
      await env.DB.prepare('UPDATE agents SET last_active_at = ?, updated_at = ? WHERE user_id = ?')
        .bind(now, now, agentId).run()
    })
  }
  catch (error) {
    workspace[Symbol.dispose]()
    throw error
  }
}

export { WorkspaceProxy }
export type { AgentComputer } from './agent-computer-adapter'
