/**
 * How a workspace reaches this account's Discoflare Admin: a service binding to
 * the Admin's `WorkspaceControl` entrypoint. `props.workerName` identifies the
 * calling workspace; Cloudflare does not let the caller change it.
 */
export const ADMIN_WORKER_NAME = 'discoflare-admin'
export const ADMIN_ENTRYPOINT = 'WorkspaceControl'
export const ADMIN_BINDING = 'DISCOFLARE_ADMIN'
/** Release capability: the workspace can use Live, domains, mail, and updates through an Admin. */
export const ADMIN_CAPABILITY = 'discoflare-admin-v1'

export type WorkspaceAdminLink = {
  /** The Admin's Worker name; `discoflare-admin` unless the account runs it under another name. */
  service: string
}

export type WorkspaceControlProps = {
  workerName: string
}

export function workspaceAdminBinding(workerName: string, admin: WorkspaceAdminLink) {
  const props: WorkspaceControlProps = { workerName }
  return {
    type: 'service',
    name: ADMIN_BINDING,
    service: admin.service,
    entrypoint: ADMIN_ENTRYPOINT,
    props,
  }
}
