const WORKSPACE_ROOT = '/workspace'

export type AgentComputerExecResult = {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
}

export type AgentComputerFile = {
  path: string
  type: 'file' | 'directory' | 'symlink'
  size: number
}

export interface AgentComputer {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  list(path: string, recursive?: boolean): Promise<AgentComputerFile[]>
  exec(command: string): Promise<AgentComputerExecResult>
  close(): void
}

type WorkspaceLike = {
  fs: {
    readFile(path: string, encoding: 'utf8'): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    mkdir(path: string, options: { recursive: boolean }): Promise<void>
    readdir(path: string, options: { limit: number }): Promise<Array<{
      parentPath: string
      name: string
      size: number
      isDirectory: boolean
      isSymbolicLink: boolean
    }>>
    find(path: string, pattern: undefined, options: { limit: number }): Promise<Array<{
      path: string
      type: 'file' | 'dir'
    }>>
  }
  runtime: {
    exec(command: string, options: {
      cwd: string
      encoding: 'utf8'
      timeoutMs: number
    }): Promise<{
      result(): Promise<{
        status: string
        exitCode: number
        stdout: string
        stderr: string
      }>
      [Symbol.dispose](): void
    }>
  }
  [Symbol.dispose](): void
}

class WorkspaceAgentComputer implements AgentComputer {
  constructor(
    private readonly workspace: WorkspaceLike,
    private readonly onMutation: () => Promise<void> = async () => {},
  ) {}

  async read(path: string): Promise<string> {
    return this.workspace.fs.readFile(cleanComputerPath(path), 'utf8')
  }

  async write(path: string, content: string): Promise<void> {
    const target = cleanComputerPath(path)
    const parent = target.slice(0, target.lastIndexOf('/')) || WORKSPACE_ROOT
    await this.workspace.fs.mkdir(parent, { recursive: true })
    await this.workspace.fs.writeFile(target, content)
    await this.onMutation()
  }

  async list(path: string, recursive = false): Promise<AgentComputerFile[]> {
    const root = cleanComputerPath(path)
    if (recursive) {
      const entries = await this.workspace.fs.find(root, undefined, { limit: 500 })
      return entries.map(entry => ({
        path: entry.path,
        type: entry.type === 'dir' ? 'directory' : 'file',
        size: 0,
      }))
    }
    const entries = await this.workspace.fs.readdir(root, { limit: 500 })
    return entries.map(entry => ({
      path: `${entry.parentPath.replace(/\/$/u, '')}/${entry.name}`,
      type: entry.isDirectory ? 'directory' : entry.isSymbolicLink ? 'symlink' : 'file',
      size: entry.size,
    }))
  }

  async exec(command: string): Promise<AgentComputerExecResult> {
    const run = await this.workspace.runtime.exec(command, {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      timeoutMs: 120_000,
    })
    try {
      const result = await run.result()
      await this.onMutation()
      return {
        success: result.status === 'completed' && result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }
    }
    finally {
      run[Symbol.dispose]()
    }
  }

  close(): void {
    this.workspace[Symbol.dispose]()
  }
}

export function cleanComputerPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `${WORKSPACE_ROOT}/${path}`
  if (normalized !== WORKSPACE_ROOT && !normalized.startsWith(`${WORKSPACE_ROOT}/`)) {
    throw new Error('Path must be inside /workspace')
  }
  if (normalized.split('/').includes('..')) throw new Error('Path traversal is not allowed')
  return normalized
}

/** Adapts the preview Workspace client to Discoflare's stable, narrow Computer contract. */
export function createAgentComputer(
  workspace: WorkspaceLike,
  onMutation?: () => Promise<void>,
): AgentComputer {
  return new WorkspaceAgentComputer(workspace, onMutation)
}
