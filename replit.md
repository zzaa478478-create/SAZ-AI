# Zubair AI

Zubair AI is a mobile-first personal coding and app-development assistant with Urdu, Roman Urdu, English, and persistent project memory.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/zubair-ai run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets: `OPENAI_API_KEY` or `GEMINI_API_KEY` for server-side AI responses

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- AI: OpenAI SDK or Gemini REST API, selected by configured secret
- Project memory: SQLite via better-sqlite3 in `artifacts/api-server/data/zubair-ai.sqlite`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web chat UI: `artifacts/zubair-ai/src/App.tsx`
- API routes: `artifacts/api-server/src/routes/assistant.ts`
- SQLite project memory: `artifacts/api-server/src/lib/project-memory.ts`
- Shared theme: `artifacts/zubair-ai/src/index.css`

## Architecture decisions

- AI credentials stay server-side; the browser only calls `/api/assistant/chat`.
- Gemini is preferred when `GEMINI_API_KEY` exists; OpenAI is the fallback when `OPENAI_API_KEY` is valid.
- Project memory is deliberately single-user and local SQLite for a beginner-friendly first version.
- Idea-mode chats automatically create project memory; coding chats update the selected project's latest progress.

## Product

- Real AI coding and app-idea responses in English, Urdu, and Roman Urdu.
- Coding Assistant and App Idea Generator modes.
- Persistent project list with idea, status, and latest progress.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Gemini model availability can change; the current direct API path uses `gemini-3.8-flash` for new users.
- Add AI credentials through Replit Secrets, never in frontend code or checked-in files.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
