import type { CanvasDTO, CanvasEdgeDTO, CanvasNodeDTO, CanvasSummaryDTO, DataResourcesDTO, DatabaseSummaryDTO, DocumentDTO, DocumentSummaryDTO } from '../../shared/types'
import type { DiscoflareEnv } from '../../workers/env'
import { fail } from './cf'

type CanvasRow = Omit<CanvasDTO, 'nodes' | 'edges'>

export async function loadDataResources(env: DiscoflareEnv): Promise<DataResourcesDTO> {
  const [databasesResult, documentsResult, canvasesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, archived_at as archivedAt,
       (SELECT COUNT(*) FROM database_items WHERE database_id = database_definitions.id) as itemCount
       FROM database_definitions ORDER BY position, created_at`,
    ).all<DatabaseSummaryDTO>(),
    env.DB.prepare(
      `SELECT id, title, position, version, created_by as createdBy,
       created_at as createdAt, updated_at as updatedAt FROM documents ORDER BY position, created_at`,
    ).all<DocumentSummaryDTO>(),
    env.DB.prepare(
      `SELECT id, title, position, version, created_by as createdBy,
       created_at as createdAt, updated_at as updatedAt,
       (SELECT COUNT(*) FROM canvas_nodes WHERE canvas_id = canvases.id) as nodeCount
       FROM canvases ORDER BY position, created_at`,
    ).all<CanvasSummaryDTO>(),
  ])
  return {
    databases: databasesResult.results ?? [],
    documents: documentsResult.results ?? [],
    canvases: canvasesResult.results ?? [],
  }
}

export async function requireDocument(env: DiscoflareEnv, id: string): Promise<DocumentDTO> {
  const document = await env.DB.prepare(
    `SELECT id, title, content, position, version, created_by as createdBy,
     created_at as createdAt, updated_at as updatedAt FROM documents WHERE id = ?`,
  ).bind(id).first<DocumentDTO>()
  if (!document) fail(404, 'not_found', 'Document not found')
  return document
}

export async function requireCanvas(env: DiscoflareEnv, id: string): Promise<CanvasRow> {
  const canvas = await env.DB.prepare(
    `SELECT id, title, position, version, created_by as createdBy,
     created_at as createdAt, updated_at as updatedAt FROM canvases WHERE id = ?`,
  ).bind(id).first<CanvasRow>()
  if (!canvas) fail(404, 'not_found', 'Canvas not found')
  return canvas
}

export async function loadCanvas(env: DiscoflareEnv, id: string): Promise<CanvasDTO> {
  const canvas = await requireCanvas(env, id)
  const [nodesResult, edgesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, canvas_id as canvasId, kind, content, x, y, width, height, color, version,
       created_by as createdBy, created_at as createdAt, updated_at as updatedAt
       FROM canvas_nodes WHERE canvas_id = ? ORDER BY created_at`,
    ).bind(id).all<CanvasNodeDTO>(),
    env.DB.prepare(
      `SELECT id, canvas_id as canvasId, from_node_id as fromNodeId, to_node_id as toNodeId,
       created_by as createdBy, created_at as createdAt
       FROM canvas_edges WHERE canvas_id = ? ORDER BY created_at`,
    ).bind(id).all<CanvasEdgeDTO>(),
  ])
  return { ...canvas, nodes: nodesResult.results ?? [], edges: edgesResult.results ?? [] }
}

export async function requireCanvasNode(env: DiscoflareEnv, id: string): Promise<CanvasNodeDTO> {
  const node = await env.DB.prepare(
    `SELECT id, canvas_id as canvasId, kind, content, x, y, width, height, color, version,
     created_by as createdBy, created_at as createdAt, updated_at as updatedAt
     FROM canvas_nodes WHERE id = ?`,
  ).bind(id).first<CanvasNodeDTO>()
  if (!node) fail(404, 'not_found', 'Canvas item not found')
  return node
}

export async function loadCanvasNode(env: DiscoflareEnv, id: string): Promise<CanvasNodeDTO | null> {
  return env.DB.prepare(
    `SELECT id, canvas_id as canvasId, kind, content, x, y, width, height, color, version,
     created_by as createdBy, created_at as createdAt, updated_at as updatedAt
     FROM canvas_nodes WHERE id = ?`,
  ).bind(id).first<CanvasNodeDTO>()
}
