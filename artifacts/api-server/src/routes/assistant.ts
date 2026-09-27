import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  createProject,
  createConversation,
  createKnowledgeDocument,
  addConversationMessage,
  deleteProject,
  deleteKnowledgeDocument,
  getProject,
  getConversation,
  listConversationMessages,
  listConversations,
  listKnowledgeDocuments,
  listProjects,
  updateProject,
  type KnowledgeDocument,
  type ProjectStatus,
} from "../lib/project-memory";

const router: IRouter = Router();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : undefined;

type ChatRole = "user" | "assistant";
type ChatMode = "coding" | "ideas";
type ChatLanguage = "english" | "urdu" | "roman";
type ChatProvider = "auto" | "gemini" | "groq" | "deepseek" | "openai" | "local";

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

function isChatProvider(value: unknown): value is ChatProvider {
  return (
    value === "auto" ||
    value === "gemini" ||
    value === "groq" ||
    value === "deepseek" ||
    value === "openai" ||
    value === "local"
  );
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
  documents: KnowledgeDocument[],
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
  const knowledgeInstruction = documents.length
    ? `Custom project knowledge:
${documents
  .map(
    (document) =>
      `--- ${document.name} (${document.mimeType}) ---
${document.content.slice(0, 12000)}`,
  )
  .join("\n")}
Use this material as project context. Do not claim it is authoritative if it conflicts with the user's latest message.`
    : "There are no uploaded project documents yet.";

  return `You are SAZ AI, a personal assistant for coding and app development.
${languageInstruction}
${modeInstruction}
${memoryInstruction}
${knowledgeInstruction}
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

async function generateWithOpenAICompatible(
  apiKey: string,
  baseURL: string | undefined,
  model: string,
  system: string,
  history: ChatMessage[],
  message: string,
) {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [
      { role: "system", content: system },
      ...history,
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content?.trim();
}

function providerIsConfigured(provider: ChatProvider, localEndpoint?: string) {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (provider === "deepseek") return Boolean(process.env.DEEPSEEK_API_KEY);
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "local") return Boolean(localEndpoint);
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

async function generateWithProvider(
  provider: Exclude<ChatProvider, "auto">,
  input: {
    system: string;
    history: ChatMessage[];
    message: string;
    localEndpoint?: string;
    localModel?: string;
  },
) {
  if (provider === "gemini") {
    return generateWithGemini(input.system, input.history, input.message);
  }
  if (provider === "groq") {
    return generateWithOpenAICompatible(
      process.env.GROQ_API_KEY!,
      "https://api.groq.com/openai/v1",
      process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      input.system,
      input.history,
      input.message,
    );
  }
  if (provider === "deepseek") {
    return generateWithOpenAICompatible(
      process.env.DEEPSEEK_API_KEY!,
      "https://api.deepseek.com",
      process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      input.system,
      input.history,
      input.message,
    );
  }
  if (provider === "local") {
    const endpoint = input.localEndpoint?.trim().replace(/\/$/, "");
    if (!endpoint) return undefined;
    return generateWithOpenAICompatible(
      "local",
      endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`,
      input.localModel ?? "local-model",
      input.system,
      input.history,
      input.message,
    );
  }
  return generateWithOpenAICompatible(
    process.env.OPENAI_API_KEY!,
    undefined,
    process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    input.system,
    input.history,
    input.message,
  );
}

router.get("/assistant/projects", (_req, res) => {
  res.json(listProjects());
});

router.get("/assistant/projects/:id/knowledge", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !getProject(id)) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(
    listKnowledgeDocuments(id).map(({ content: _content, ...document }) => document),
  );
});

router.post("/assistant/projects/:id/knowledge", (req, res) => {
  const id = Number(req.params.id);
  const body = isRecord(req.body) ? req.body : {};
  const name = cleanText(body.name);
  if (!Number.isInteger(id) || !getProject(id)) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "A document name is required." });
    return;
  }
  const content = cleanText(body.content);
  if (content.length > 100_000) {
    res.status(413).json({ error: "Document is too large. Keep uploads under 100 KB." });
    return;
  }
  res.status(201).json(
    createKnowledgeDocument({
      projectId: id,
      name,
      mimeType: cleanText(body.mimeType, "text/plain"),
      content,
    }),
  );
});

router.delete("/assistant/knowledge/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !deleteKnowledgeDocument(id)) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.status(204).send();
});

router.get("/assistant/projects/:id/conversations", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !getProject(id)) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(listConversations(id, cleanText(req.query.search)));
});

router.get("/assistant/conversations/:id/messages", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !getConversation(id)) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  res.json(listConversationMessages(id));
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
  const provider = isChatProvider(body.provider) ? body.provider : "auto";
  const localEndpoint = cleanText(body.localEndpoint);
  const localModel = cleanText(body.localModel, "local-model");
  const conversationId =
    typeof body.conversationId === "number" && Number.isInteger(body.conversationId)
      ? body.conversationId
      : undefined;
  const projectId =
    typeof body.projectId === "number" && Number.isInteger(body.projectId)
      ? body.projectId
      : undefined;

  if (!message) {
    res.status(400).json({ error: "Message cannot be empty." });
    return;
  }
  if (!providerIsConfigured(provider, localEndpoint)) {
    res.status(503).json({ error: "The selected AI provider is not configured." });
    return;
  }

  const project = projectContext(projectId);
  const documents = projectId ? listKnowledgeDocuments(projectId) : [];
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
    const system = systemPrompt(mode, language, project, documents);
    const conversation = conversationId && getConversation(conversationId)
      ? getConversation(conversationId)!
      : createConversation({
          projectId,
          title: message.replace(/\s+/g, " ").slice(0, 72),
        });
    addConversationMessage({ conversationId: conversation.id, role: "user", content: message });
    const candidates: Array<Exclude<ChatProvider, "auto">> =
      provider === "auto"
        ? ["gemini", "groq", "deepseek", "openai"]
        : [provider];
    let reply: string | undefined;
    let usedProvider: Exclude<ChatProvider, "auto"> | undefined;
    for (const candidate of candidates) {
      if (!providerIsConfigured(candidate, localEndpoint)) continue;
      try {
        reply = await generateWithProvider(candidate, {
          system,
          history,
          message,
          localEndpoint,
          localModel,
        });
        if (reply) {
          usedProvider = candidate;
          break;
        }
      } catch (error) {
        req.log.warn({ provider: candidate, err: error }, "SAZ AI provider unavailable");
      }
    }
    if (!reply) {
      res.status(502).json({ error: "All configured AI providers were unavailable." });
      return;
    }
    addConversationMessage({ conversationId: conversation.id, role: "assistant", content: reply });

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

    res.json({ reply, project: nextProject ?? null, conversationId: conversation.id, provider: usedProvider });
  } catch (error) {
    req.log.error({ err: error }, "SAZ AI provider request failed");
    res.status(502).json({
      error: "I couldn't reach the AI provider. Check the server configuration and try again.",
    });
  }
});

export default router;