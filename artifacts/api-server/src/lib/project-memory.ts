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