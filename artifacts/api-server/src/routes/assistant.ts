import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
  type ProjectStatus,
} from "../lib/project-memory";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatRole = "user" | "assistant";
type ChatMode = "coding" | "ideas";
type ChatLanguage = "english" | "urdu" | "roman";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function isChatMode(value: unknown): value is ChatMode {
  return value === "coding" || value === "ideas";
}

function isChatLanguage(value: unknown): value is ChatLanguage {
  return value === "english" || value === "urdu" || value === "roman";
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === "active" || value === "paused" || value === "complete";
}

function projectContext(projectId: number | undefined) {
  if (!projectId) return undefined;
  return getProject(projectId);
}

function systemPrompt(
  mode: ChatMode,
  language: ChatLanguage,
  project: ReturnType<typeof projectContext>,
) {
  const languageInstruction =
    language === "urdu"
      ? "Respond primarily in clear, natural Urdu script. Keep code, filenames, commands, and technical identifiers in English."
      : language === "roman"
        ? "Respond in natural Roman Urdu with English technical terms where they are clearer. Keep code, filenames, and commands in English."
        : "Respond in clear, expert English.";
  const modeInstruction =
    mode === "coding"
      ? "Act as a senior coding assistant. Explain the reasoning briefly, identify assumptions, and give practical code that a beginner can run. When debugging, ask for the smallest missing detail only if it blocks a reliable answer."
      : "Act as a product-minded app idea partner. Turn rough ideas into focused MVPs with a clear user, problem, feature scope, and first build step.";
  const memoryInstruction = project
    ? `Active project memory:
Title: ${project.title}
Idea: ${project.idea || "Not captured yet"}
Latest progress: ${project.progress || "No progress captured yet"}
Use this memory to keep continuity. Do not invent progress that is not present.`
    : "There is no active project memory yet. If the user describes a project idea, make the next step concrete.";

  return `You are Zubair AI, a personal assistant for coding and app development.
${languageInstruction}
${modeInstruction}
${memoryInstruction}
Be direct, encouraging, and specific. Never claim you ran code, accessed files, or changed a project when you did not. Use Markdown and fenced code blocks for code.`;
}

router.get("/assistant/projects", (_req, res) => {
  res.json(listProjects());
});

router.post("/assistant/projects", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const title = cleanText(body.title);
  if (!title) {
    res.status(400).json({ error: "A project title is required." });
    return;
  }
  res.status(201).json(
    createProject({
      title,
      idea: cleanText(body.idea),
      progress: cleanText(body.progress),
    }),
  );
});

router.patch("/assistant/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  const body = isRecord(req.body) ? req.body : {};
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid project id." });
    return;
  }
  const status = body.status;
  if (status !== undefined && !isProjectStatus(status)) {
    res.status(400).json({ error: "Invalid project status." });
    return;
  }
  const project = updateProject(id, {
    title: body.title === undefined ? undefined : cleanText(body.title),
    idea: body.idea === undefined ? undefined : cleanText(body.idea),
    progress: body.progress === undefined ? undefined : cleanText(body.progress),
    status: status as ProjectStatus | undefined,
  });
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(project);
});

router.delete("/assistant/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || !deleteProject(id)) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.status(204).send();
});

router.post("/assistant/chat", async (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const message = cleanText(body.message);
  const mode = isChatMode(body.mode) ? body.mode : "coding";
  const language = isChatLanguage(body.language) ? body.language : "english";
  const projectId =
    typeof body.projectId === "number" && Number.isInteger(body.projectId)
      ? body.projectId
      : undefined;

  if (!message) {
    res.status(400).json({ error: "Message cannot be empty." });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "OpenAI is not configured on the server yet." });
    return;
  }

  const project = projectContext(projectId);
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatMessage[] = rawHistory
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string",
    )
    .slice(-16)
    .map((item) => ({
      role: item.role as ChatRole,
      content: cleanText(item.content),
    }))
    .filter((item) => item.content.length > 0);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt(mode, language, project) },
        ...history,
        { role: "user", content: message },
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      res.status(502).json({ error: "The AI returned an empty response." });
      return;
    }

    let nextProject = project;
    if (mode === "ideas" && !project) {
      nextProject = createProject({
        title: message.replace(/\s+/g, " ").slice(0, 52) || "New app idea",
        idea: message,
        progress: "Idea captured. Next step: define the smallest useful MVP.",
      });
    } else if (project) {
      nextProject = updateProject(project.id, {
        progress: `Latest request: ${message.slice(0, 240)}`,
      });
    }

    res.json({ reply, project: nextProject ?? null });
  } catch (error) {
    req.log.error({ err: error }, "OpenAI chat request failed");
    res.status(502).json({
      error: "I couldn't reach the AI provider. Check the server configuration and try again.",
    });
  }
});

export default router;