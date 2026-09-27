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
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : undefined;

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
  const languageInstruction = `آپ ایک ذہین اور کثیر اللسانی (Multilingual) AI اسسٹنٹ ہیں۔ آپ دنیا کی 100 سے زائد زبانیں (بشمول انگلش، عربی، فارسی، ہسپانوی، فرانسیسی وغیرہ) اور پاکستان کی تمام علاقائی زبانیں (پشتو، سندھی، پنجابی، بلوچی) آسانی سے سمجھ اور بول سکتے ہیں۔
آپ کا بنیادی اصول:
صارف جس زبان اور انداز میں سوال پوچھے گا، آپ کو اسی زبان اور انداز میں جواب دینا ہوگا:
1. اگر صارف Roman Urdu (رومن اردو) میں لکھے، تو آپ کا جواب لازماً Roman Urdu میں ہونا چاہیے۔
2. اگر صارف Urdu Script (اردو رسم الخط) میں لکھے، تو آپ کا جواب لازماً اردو رسم الخط میں ہونا چاہیے۔
3. اگر صارف English میں لکھے، تو جواب English میں ہونا چاہیے۔
آپ کا انداز دوستانہ، واضح اور پرتعتماد ہونا چاہیے۔

Detect the language and writing style of the latest user message first. The latest user message's language and style always take priority over the selected interface language. Preserve the user's level of formality and technical vocabulary.`;
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

  return `You are SAZ AI, a personal assistant for coding and app development.
${languageInstruction}
${modeInstruction}
${memoryInstruction}
Be direct, encouraging, and specific. Never claim you ran code, accessed files, or changed a project when you did not. Use Markdown and fenced code blocks for code.`;
}

async function generateWithGemini(
  system: string,
  history: ChatMessage[],
  message: string,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  let lastError = "Gemini request failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [
            ...history.map((item) => ({
              role: item.role === "assistant" ? "model" : "user",
              parts: [{ text: item.content }],
            })),
            { role: "user", parts: [{ text: message }] },
          ],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      },
    );
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (response.ok) {
      return data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
    }

    lastError = data.error?.message ?? "Gemini request failed.";
    const transient = response.status === 429 || response.status >= 500 || lastError.toLowerCase().includes("high demand");
    if (!transient || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(lastError);
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
  if (!process.env.GEMINI_API_KEY && !openai) {
    res.status(503).json({ error: "No AI provider is configured on the server yet." });
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
    const system = systemPrompt(mode, language, project);
    const reply = process.env.GEMINI_API_KEY
      ? await generateWithGemini(system, history, message)
      : (
        await openai!.chat.completions.create({
          model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
          max_completion_tokens: 8192,
          messages: [
            { role: "system", content: system },
            ...history,
            { role: "user", content: message },
          ],
        })
      ).choices[0]?.message?.content?.trim();
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
    req.log.error({ err: error }, "SAZ AI provider request failed");
    res.status(502).json({
      error: "I couldn't reach the AI provider. Check the server configuration and try again.",
    });
  }
});

export default router;