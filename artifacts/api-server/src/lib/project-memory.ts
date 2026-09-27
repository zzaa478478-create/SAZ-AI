import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type ProjectStatus = "active" | "paused" | "complete";

export type Project = {
  id: number;
  title: string;
  idea: string;
  progress: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocument = {
  id: number;
  projectId: number;
  name: string;
  mimeType: string;
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: number;
  projectId: number | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ProjectRow = {
  id: number;
  title: string;
  idea: string;
  progress: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

const databasePath =
  process.env.ZUBAIR_AI_DB_PATH ??
  path.resolve(process.cwd(), "data", "zubair-ai.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    idea TEXT NOT NULL DEFAULT '',
    progress TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'complete')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'text/plain',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    idea: row.idea,
    progress: row.progress,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(): Project[] {
  const rows = database
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: number): Project | undefined {
  const row = database
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}

export function createProject(input: {
  title: string;
  idea?: string;
  progress?: string;
}): Project {
  const now = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO projects (title, idea, progress, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
    )
    .run(input.title.trim(), input.idea?.trim() ?? "", input.progress?.trim() ?? "", now, now);
  return getProject(Number(result.lastInsertRowid))!;
}

export function updateProject(
  id: number,
  input: {
    title?: string;
    idea?: string;
    progress?: string;
    status?: ProjectStatus;
  },
): Project | undefined {
  const current = getProject(id);
  if (!current) return undefined;

  const next = {
    title: input.title?.trim() || current.title,
    idea: input.idea === undefined ? current.idea : input.idea.trim(),
    progress: input.progress === undefined ? current.progress : input.progress.trim(),
    status: input.status ?? current.status,
  };
  database
    .prepare(
      "UPDATE projects SET title = ?, idea = ?, progress = ?, status = ?, updated_at = ? WHERE id = ?",
    )
    .run(next.title, next.idea, next.progress, next.status, new Date().toISOString(), id);
  return getProject(id);
}

export function deleteProject(id: number): boolean {
  const result = database.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listKnowledgeDocuments(projectId: number): KnowledgeDocument[] {
  const rows = database
    .prepare(
      "SELECT id, project_id, name, mime_type, content, created_at FROM knowledge_documents WHERE project_id = ? ORDER BY created_at DESC",
    )
    .all(projectId) as Array<{
    id: number;
    project_id: number;
    name: string;
    mime_type: string;
    content: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    mimeType: row.mime_type,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function createKnowledgeDocument(input: {
  projectId: number;
  name: string;
  mimeType?: string;
  content?: string;
}): KnowledgeDocument {
  const createdAt = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO knowledge_documents (project_id, name, mime_type, content, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      input.projectId,
      input.name.trim(),
      input.mimeType?.trim() || "text/plain",
      input.content ?? "",
      createdAt,
    );
  return listKnowledgeDocuments(input.projectId).find(
    (document) => document.id === Number(result.lastInsertRowid),
  )!;
}

export function deleteKnowledgeDocument(id: number): boolean {
  const result = database
    .prepare("DELETE FROM knowledge_documents WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

function toConversation(row: {
  id: number;
  project_id: number | null;
  title: string;
  created_at: string;
  updated_at: string;
}): Conversation {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createConversation(input: {
  projectId?: number;
  title: string;
}): Conversation {
  const now = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO conversations (project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
    .run(input.projectId ?? null, input.title.trim() || "New conversation", now, now);
  return getConversation(Number(result.lastInsertRowid))!;
}

export function getConversation(id: number): Conversation | undefined {
  const row = database
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as
    | {
        id: number;
        project_id: number | null;
        title: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  return row ? toConversation(row) : undefined;
}

export function listConversations(
  projectId: number | undefined,
  search = "",
): Conversation[] {
  const query = `%${search.trim()}%`;
  const rows = projectId
    ? database
        .prepare(
          `SELECT DISTINCT c.*
           FROM conversations c
           LEFT JOIN conversation_messages m ON m.conversation_id = c.id
           WHERE c.project_id = ? AND (c.title LIKE ? OR m.content LIKE ?)
           ORDER BY c.updated_at DESC`,
        )
        .all(projectId, query, query)
    : database
        .prepare(
          `SELECT DISTINCT c.*
           FROM conversations c
           LEFT JOIN conversation_messages m ON m.conversation_id = c.id
           WHERE c.title LIKE ? OR m.content LIKE ?
           ORDER BY c.updated_at DESC`,
        )
        .all(query, query);
  return (rows as Array<{
    id: number;
    project_id: number | null;
    title: string;
    created_at: string;
    updated_at: string;
  }>).map(toConversation);
}

export function addConversationMessage(input: {
  conversationId: number;
  role: "user" | "assistant";
  content: string;
}): ConversationMessage {
  const createdAt = new Date().toISOString();
  const result = database
    .prepare(
      "INSERT INTO conversation_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(input.conversationId, input.role, input.content, createdAt);
  database
    .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
    .run(createdAt, input.conversationId);
  return {
    id: Number(result.lastInsertRowid),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt,
  };
}

export function listConversationMessages(
  conversationId: number,
): ConversationMessage[] {
  const rows = database
    .prepare(
      "SELECT id, conversation_id, role, content, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC",
    )
    .all(conversationId) as Array<{
    id: number;
    conversation_id: number;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}