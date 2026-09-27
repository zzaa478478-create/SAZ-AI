import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUp,
  Bot,
  Bug,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Database,
  Download,
  FileCode2,
  FileDown,
  FolderKanban,
  Github,
  Lightbulb,
  Mic,
  MicOff,
  Moon,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type Mode = 'coding' | 'ideas';
type Language = 'english' | 'urdu' | 'roman';
type Provider = 'auto' | 'gemini' | 'groq' | 'deepseek' | 'openai' | 'local';
type WorkspaceTool = 'knowledge' | 'history' | 'sandbox' | 'debugger' | 'database' | 'social' | 'settings';
type Message = { id: number; role: 'assistant' | 'user'; text: string; time: string };
type SpeechRecognitionResultLike = { 0?: { transcript: string } };
type SpeechRecognitionEventLike = Event & { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorEventLike = Event & { error: string; message?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type KnowledgeDocument = { id: number; projectId: number; name: string; mimeType: string; createdAt: string };
type ConversationSummary = { id: number; projectId: number | null; title: string; createdAt: string; updatedAt: string };
type Project = {
  id: number;
  title: string;
  idea: string;
  progress: string;
  status: 'active' | 'paused' | 'complete';
  createdAt: string;
  updatedAt: string;
};

const modes: { id: Mode; label: string; description: string; icon: typeof Code2 }[] = [
  { id: 'coding', label: 'Coding Assistant', description: 'Build, fix, explain', icon: Code2 },
  { id: 'ideas', label: 'App Idea Generator', description: 'Shape the spark', icon: Lightbulb },
];

const quickPrompts: Record<Mode, string[]> = {
  coding: ['Explain React state simply', 'Make a mobile nav', 'Debug my API route'],
  ideas: ['A useful app for Lahore', 'Turn my habit into an app', 'Something for local creators'],
};

const initialMessage: Message = {
  id: 1,
  role: 'assistant',
  time: 'just now',
  text: "Assalam-o-alaikum, Zubair. I’m SAZ AI, ready to turn a rough thought into a working build. Ask me to code, debug, explain, or shape your next app idea.",
};

function getTime() {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function Home() {
  const [mode, setMode] = useState<Mode>('coding');
  const [language, setLanguage] = useState<Language>('english');
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDark, setIsDark] = useState(() => window.localStorage.getItem('saz-ai-theme') === 'dark');
  const [provider, setProvider] = useState<Provider>(() => (window.localStorage.getItem('saz-ai-provider') as Provider | null) ?? 'auto');
  const [localEndpoint, setLocalEndpoint] = useState(() => window.localStorage.getItem('saz-ai-local-endpoint') ?? 'http://localhost:11434');
  const [localModel, setLocalModel] = useState(() => window.localStorage.getItem('saz-ai-local-model') ?? 'llama3.2');
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [activeTool, setActiveTool] = useState<WorkspaceTool | null>(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sandboxCode, setSandboxCode] = useState('<main><h1>SAZ AI Sandbox</h1><p>Edit the code and preview it safely.</p></main>');
  const [notice, setNotice] = useState('');
  const [mobilePanel, setMobilePanel] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSendTimeoutRef = useRef<number | null>(null);
  const messageId = useRef(2);

  const activeMode = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode]);
  const activeProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [projects, activeProjectId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    window.localStorage.setItem('saz-ai-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    window.localStorage.setItem('saz-ai-provider', provider);
    window.localStorage.setItem('saz-ai-local-endpoint', localEndpoint);
    window.localStorage.setItem('saz-ai-local-model', localModel);
  }, [provider, localEndpoint, localModel]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (voiceSendTimeoutRef.current !== null) {
      window.clearTimeout(voiceSendTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    void fetch('/api/assistant/projects')
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Project[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setNotice('Project memory is unavailable'));
  }, []);

  useEffect(() => {
    setConversationId(null);
    if (!activeProjectId) {
      setKnowledgeDocs([]);
      setConversations([]);
      return;
    }
    void Promise.all([
      fetch(`/api/assistant/projects/${activeProjectId}/knowledge`).then((response) => response.ok ? response.json() : []),
      fetch(`/api/assistant/projects/${activeProjectId}/conversations`).then((response) => response.ok ? response.json() : []),
    ]).then(([documents, history]) => {
      setKnowledgeDocs(Array.isArray(documents) ? documents : []);
      setConversations(Array.isArray(history) ? history : []);
    }).catch(() => setNotice('Workspace context could not be loaded'));
  }, [activeProjectId]);

  const upsertProject = (project: Project) => {
    setProjects((current) => {
      const exists = current.some((item) => item.id === project.id);
      return exists ? current.map((item) => item.id === project.id ? project : item) : [project, ...current];
    });
    setActiveProjectId(project.id);
  };

  const sendMessage = async (value: string) => {
    const clean = value.trim();
    if (!clean || isTyping) return;
    const userMessage: Message = { id: messageId.current++, role: 'user', text: clean, time: getTime() };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsTyping(true);
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: clean,
          mode,
          language,
          projectId: activeProjectId,
          provider,
          localEndpoint: provider === 'local' ? localEndpoint : undefined,
          localModel: provider === 'local' ? localModel : undefined,
          conversationId,
          history: [...messages, userMessage].slice(-16).map((item) => ({ role: item.role, content: item.text })),
        }),
      });
      const data = await response.json() as { reply?: string; project?: Project | null; conversationId?: number; provider?: string; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error ?? 'The assistant could not respond.');
      setMessages((current) => [...current, { id: messageId.current++, role: 'assistant', text: data.reply!, time: getTime() }]);
      if (data.project) upsertProject(data.project);
      if (data.conversationId) setConversationId(data.conversationId);
    } catch (error) {
      setMessages((current) => [...current, {
        id: messageId.current++,
        role: 'assistant',
        text: error instanceof Error ? error.message : 'I could not reach the assistant. Please try again.',
        time: getTime(),
      }]);
      setNotice('Response failed');
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const uploadKnowledge = async (file: File) => {
    if (!activeProjectId) {
      setNotice('Select or save a project before uploading knowledge');
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const content = isPdf
      ? `PDF uploaded for project context: ${file.name}. Extracted text is not available in this browser upload.`
      : (await file.text()).slice(0, 100_000);
    const response = await fetch(`/api/assistant/projects/${activeProjectId}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, mimeType: file.type || 'text/plain', content }),
    });
    if (!response.ok) {
      setNotice('Knowledge upload failed');
      return;
    }
    const document = await response.json() as KnowledgeDocument;
    setKnowledgeDocs((current) => [document, ...current]);
    setNotice(`${file.name} added to project knowledge`);
  };

  const deleteKnowledge = async (id: number) => {
    const response = await fetch(`/api/assistant/knowledge/${id}`, { method: 'DELETE' });
    if (response.ok) {
      setKnowledgeDocs((current) => current.filter((document) => document.id !== id));
      setNotice('Knowledge document removed');
    }
  };

  const loadHistory = async (search: string) => {
    if (!activeProjectId) return;
    const response = await fetch(`/api/assistant/projects/${activeProjectId}/conversations?search=${encodeURIComponent(search)}`);
    if (response.ok) setConversations(await response.json() as ConversationSummary[]);
  };

  const exportMarkdown = () => {
    const content = messages.map((message) => `## ${message.role === 'assistant' ? 'SAZ AI' : 'You'} · ${message.time}\n\n${message.text}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'saz-ai-conversation.md';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Markdown export downloaded');
  };

  const exportPdf = () => {
    window.print();
  };

  const downloadCode = () => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    const code = lastAssistant?.text.match(/```(?:[\w+-]+)?\s*([\s\S]*?)```/)?.[1]?.trim();
    if (!code) {
      setNotice('No code block found in the latest reply');
      return;
    }
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'saz-ai-generated-code.txt';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Code file downloaded');
  };

  const runToolPrompt = (prompt: string) => {
    setActiveTool(null);
    setMode('coding');
    void sendMessage(prompt);
  };

  const toggleVoiceInput = () => {
    if (isTyping) return;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice input is not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'english' ? 'en-US' : 'ur-PK';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      recognitionRef.current = recognition;
      setIsListening(true);
      setNotice(language === 'english' ? 'Listening in English' : 'اردو میں سن رہا ہوں');
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (!transcript) {
        setNotice('No speech detected');
        return;
      }
      setDraft(transcript);
      voiceSendTimeoutRef.current = window.setTimeout(() => {
        voiceSendTimeoutRef.current = null;
        void sendMessage(transcript);
      }, 250);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setIsListening(false);
      const message =
        event.error === 'not-allowed'
          ? 'Microphone permission is required'
          : event.error === 'no-speech'
            ? 'No speech detected'
            : 'Voice input failed. Please try again';
      setNotice(message);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setNotice('Voice input could not start');
    }
  };

  const resetConversation = (label: string) => {
    setMessages([{ ...initialMessage, text: language === 'english' ? initialMessage.text : language === 'urdu' ? 'السلام علیکم، زبیر۔ میں SAZ AI ہوں اور آپ کے خیال کو ایک کام کرنے والی ایپ میں بدلنے کے لیے تیار ہوں۔ کوڈ، ڈیبگ، وضاحت یا اگلے ایپ آئیڈیا کے بارے میں پوچھیں۔' : 'Assalam-o-alaikum, Zubair. Main SAZ AI hoon aur aap ke khayal ko working app mein badalne ke liye tayyar hoon. Code, debug, wazahat ya aglay app idea ke baare mein poochein.' }]);
    setNotice(label);
  };

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    setNotice(next === 'english' ? 'English replies ready' : next === 'urdu' ? 'اردو جوابات تیار ہیں' : 'Roman Urdu replies ready');
  };

  const rememberCurrentIdea = async () => {
    const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user');
    if (!latestUserMessage) {
      setNotice('Send an idea first, then save it');
      return;
    }
    try {
      const response = await fetch('/api/assistant/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: latestUserMessage.text.replace(/\s+/g, ' ').slice(0, 52) || 'New app idea',
          idea: latestUserMessage.text,
          progress: 'Conversation saved. Define the smallest useful MVP next.',
        }),
      });
      const project = await response.json() as Project & { error?: string };
      if (!response.ok) throw new Error(project.error ?? 'Could not save project memory');
      upsertProject(project);
      setNotice('Saved to project memory');
    } catch {
      setNotice('Could not save project memory');
    }
  };

  return (
    <div className="app-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="flex min-h-[100dvh]">
        <aside className={`${mobilePanel ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 flex w-[292px] flex-col bg-sidebar px-5 py-5 text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.22)]">
                <Sparkles size={19} strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-serif text-[21px] font-semibold leading-none tracking-[-0.03em]">SAZ AI</div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/50">personal workspace</div>
              </div>
            </div>
            <button type="button" aria-label="Close sidebar" data-testid="button-close-sidebar" onClick={() => setMobilePanel(false)} className="rounded-lg p-2 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden">
              <X size={17} />
            </button>
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Workspace</span>
              <span className="font-mono text-[10px] text-sidebar-foreground/35">01</span>
            </div>
            <button type="button" data-testid="button-new-conversation" onClick={() => resetConversation('Fresh conversation started')} className="group flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-3 py-3 text-left text-sm transition hover:border-primary/50 hover:bg-sidebar-accent">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary"><Plus size={16} /></span>
              <span className="font-semibold">New conversation</span>
              <span className="ml-auto text-sidebar-foreground/35"><kbd className="font-mono text-[10px]">N</kbd></span>
            </button>
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Project memory</span>
              <button type="button" aria-label="Remember current idea" data-testid="button-save-project" onClick={() => void rememberCurrentIdea()} className="rounded-md p-1 text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-primary"><Plus size={14} /></button>
            </div>
            {projects.length === 0 ? (
              <button type="button" onClick={() => setMode('ideas')} className="w-full rounded-xl border border-dashed border-sidebar-border px-3 py-3 text-left text-[11px] leading-5 text-sidebar-foreground/50 transition hover:border-primary/50 hover:text-sidebar-foreground/75">
                Your saved app ideas will live here.
              </button>
            ) : (
              <div className="space-y-1.5">
                {projects.slice(0, 3).map((project) => (
                  <button type="button" key={project.id} onClick={() => { setActiveProjectId(project.id); setNotice(`${project.title} selected`); }} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${activeProjectId === project.id ? 'bg-primary/15 text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}>
                    <div className="truncate text-[11px] font-semibold">{project.title}</div>
                    <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/40">{project.status} · memory saved</div>
                  </button>
                ))}
              </div>
            )}
          </div>

           <div className="mt-7">
             <div className="mb-3 flex items-center justify-between px-1">
               <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Build tools</span>
               <Settings2 size={13} className="text-sidebar-foreground/35" />
             </div>
             <div className="grid grid-cols-2 gap-1.5">
               {([
                 ['knowledge', 'Knowledge', FileCode2],
                 ['history', 'History', Search],
                 ['sandbox', 'Sandbox', Play],
                 ['debugger', 'Debugger', Bug],
                 ['database', 'DB playground', Database],
                 ['social', 'Content hub', Share2],
               ] as const).map(([tool, label, Icon]) => (
                 <button type="button" key={tool} onClick={() => setActiveTool(tool)} className="flex items-center gap-2 rounded-lg bg-sidebar-accent/45 px-2 py-2 text-left text-[10px] text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground">
                   <Icon size={13} /> {label}
                 </button>
               ))}
             </div>
           </div>

          <div className="mt-auto">
            <div className="mb-4 rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-primary"><Zap size={15} fill="currentColor" /><span className="font-mono text-[10px] uppercase tracking-[0.16em]">Coming next</span></div>
                <span className="rounded-full bg-primary/15 px-2 py-1 font-mono text-[9px] text-primary">roadmap</span>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/65">A more personal assistant is taking shape, one useful layer at a time.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[['Memory', UserRound], ['Voice', Volume2], ['Files', FileCode2], ['Debugging', Wrench], ['Project management', FolderKanban], ['Advanced coding', Code2]].map(([label, Icon]) => (
                  <div key={label as string} className="flex items-center gap-2 rounded-lg bg-sidebar/40 px-2 py-2 text-[11px] text-sidebar-foreground/50">
                    <Icon size={13} /> {label as string}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-sidebar-border pt-4">
              <div className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground"><span className="text-xs font-bold">Z</span></div>
              <div className="min-w-0"><div className="truncate text-sm font-semibold">Zubair</div><div className="font-mono text-[9px] uppercase tracking-wider text-sidebar-foreground/40">builder mode</div></div>
              <button type="button" data-testid="button-theme" aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setIsDark((current) => !current)} className="ml-auto rounded-lg p-2 text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground">{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            </div>
          </div>
        </aside>

        {mobilePanel && <button type="button" aria-label="Close navigation overlay" data-testid="button-close-overlay" onClick={() => setMobilePanel(false)} className="fixed inset-0 z-20 bg-sidebar/40 backdrop-blur-sm lg:hidden" />}

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-8 lg:px-12">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Open navigation" data-testid="button-open-sidebar" onClick={() => setMobilePanel(true)} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted lg:hidden"><PanelLeft size={18} /></button>
              <div className="hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-primary animate-pulse-soft" /><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Workspace /</span><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/60">{activeMode.label}</span></div>
              <div className="sm:hidden"><div className="font-serif text-lg font-semibold">SAZ AI</div><div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">ready to build</div></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-xl border border-border bg-card p-1 sm:flex">
                {(['english', 'urdu', 'roman'] as Language[]).map((item) => (
                  <button type="button" key={item} data-testid={`button-language-${item}`} onClick={() => changeLanguage(item)} className={`rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${language === item ? 'bg-sidebar text-sidebar-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{item === 'roman' ? 'Roman' : item === 'urdu' ? 'اردو' : 'EN'}</button>
                ))}
              </div>
              <button type="button" data-testid="button-refresh" aria-label="Refresh conversation" onClick={() => resetConversation('Conversation refreshed')} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><RefreshCw size={16} /></button>
              <button type="button" data-testid="button-clear" aria-label="Clear conversation" onClick={() => resetConversation('Conversation cleared')} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:bg-muted hover:text-accent"><Trash2 size={16} /></button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div ref={scrollRef} className="message-scroll flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-[780px]">
                  <div className="mb-10 flex items-end justify-between gap-5">
                    <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent"><span className="size-1.5 rounded-full bg-accent" />{language === 'urdu' ? 'آپ کا ورک اسپیس' : language === 'roman' ? 'Aap ka workspace' : 'Your workspace'}</div><h1 className="font-serif text-[clamp(2.1rem,6vw,4.3rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-foreground">Make the idea<br /><span className="text-accent">real.</span></h1></div>
                    <div className="hidden max-w-[175px] text-right font-mono text-[10px] uppercase leading-5 tracking-[0.13em] text-muted-foreground sm:block">A focused place for your next build.</div>
                  </div>
                  <div className="space-y-6">
                    {messages.map((message) => <MessageBubble key={message.id} message={message} language={language} onCopy={() => setNotice('Message copied')} />)}
                    {isTyping && <div className="animate-rise-in flex gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-xl bg-sidebar text-primary"><Bot size={16} /></div><div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3"><div className="flex gap-1.5 py-1"><span className="size-1.5 rounded-full bg-accent animate-blink" /><span className="size-1.5 rounded-full bg-accent animate-blink [animation-delay:150ms]" /><span className="size-1.5 rounded-full bg-accent animate-blink [animation-delay:300ms]" /></div></div></div>}
                  </div>
                </div>
              </div>

              <div className="shrink-0 px-4 pb-5 sm:px-8 lg:px-12 lg:pb-8">
                <div className="mx-auto max-w-[780px]">
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {quickPrompts[mode].map((prompt) => <button type="button" key={prompt} data-testid={`button-prompt-${prompt.replaceAll(' ', '-').toLowerCase()}`} onClick={() => sendMessage(prompt)} className="shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold text-muted-foreground transition hover:border-accent/60 hover:bg-accent/10 hover:text-foreground">{prompt}</button>)}
                  </div>
                  <form onSubmit={handleSubmit} className="relative rounded-2xl border border-border bg-card p-2 shadow-[0_14px_40px_hsl(var(--foreground)/.06)] transition focus-within:border-primary/70 focus-within:shadow-[0_14px_40px_hsl(var(--primary)/.12)]">
                    <textarea dir="auto" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }} rows={2} data-testid="input-message" placeholder={language === 'urdu' ? 'اپنی سوچ یہاں لکھیں...' : language === 'roman' ? 'Apni soch yahan likhein...' : 'Tell me what you want to build...'} className="w-full resize-none bg-transparent px-3 pb-11 pt-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/65" />
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                      <div className="flex items-center gap-1"><button type="button" data-testid="button-voice" aria-label={isListening ? 'Stop voice input' : 'Start voice input'} disabled={isTyping} onClick={toggleVoiceInput} className={`rounded-lg p-2 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 ${isListening ? 'animate-pulse bg-destructive/10 text-destructive' : 'text-muted-foreground'}`}>{isListening ? <MicOff size={16} /> : <Mic size={16} />}</button><span className="hidden font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 sm:inline">{isListening ? 'Listening...' : 'Shift + Enter for a new line'}</span></div>
                      <button type="submit" disabled={!draft.trim() || isTyping} data-testid="button-send" className="group flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-[0_6px_15px_hsl(var(--primary)/.27)] disabled:cursor-not-allowed disabled:opacity-45"><span>Send</span><ArrowUp size={15} className="transition-transform group-hover:-translate-y-0.5" /></button>
                    </div>
                  </form>
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground/60"><Sparkles size={11} /> Secure AI responses · Project memory enabled</div>
                </div>
              </div>
            </section>

            <aside className="hidden w-[285px] shrink-0 border-l border-border/70 bg-card/35 px-5 py-8 xl:block">
              <div className="mb-8"><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Assistant mode</div><p className="text-xs leading-5 text-muted-foreground">Choose the kind of momentum you need right now.</p></div>
              <div className="space-y-2">
                {modes.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} data-testid={`button-mode-${item.id}`} onClick={() => { setMode(item.id); setNotice(`${item.label} selected`); }} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${mode === item.id ? 'border-primary/60 bg-primary/10 shadow-[0_7px_20px_hsl(var(--primary)/.08)]' : 'border-transparent hover:border-border hover:bg-card'}`}><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${mode === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon size={17} /></span><span className="min-w-0"><span className="block text-[12px] font-bold text-foreground">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{item.description}</span></span>{mode === item.id && <Check className="ml-auto mt-1 text-primary" size={14} />}</button>; })}
              </div>
              <div className="my-8 h-px bg-border" />
              <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Language</span><Wrench size={14} className="text-accent" /></div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
                {(['english', 'urdu', 'roman'] as Language[]).map((item) => <button type="button" key={item} data-testid={`button-side-language-${item}`} onClick={() => changeLanguage(item)} className={`rounded-lg px-1 py-2 text-[10px] font-bold transition ${language === item ? 'bg-sidebar text-sidebar-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{item === 'english' ? 'English' : item === 'urdu' ? 'اردو' : 'Roman'}</button>)}
              </div>
               <div className="my-8 h-px bg-border" />
               <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Project memory</span><button type="button" aria-label="Save current idea" data-testid="button-side-save-project" onClick={() => void rememberCurrentIdea()} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-primary"><Plus size={14} /></button></div>
               {activeProject ? (
                 <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
                   <div className="flex items-center gap-2"><FolderKanban size={14} className="text-primary" /><span className="truncate text-xs font-bold">{activeProject.title}</span></div>
                   <p className="mt-3 line-clamp-4 text-[11px] leading-5 text-muted-foreground">{activeProject.idea || 'No idea captured yet.'}</p>
                   <p className="mt-3 border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground"><span className="font-semibold text-foreground">Latest:</span> {activeProject.progress || 'No progress captured yet.'}</p>
                 </div>
               ) : (
                 <p className="rounded-2xl border border-dashed border-border p-4 text-[11px] leading-5 text-muted-foreground">Ask for an app idea or save a conversation to start remembering your project.</p>
               )}
              <div className="mt-8 rounded-2xl border border-accent/25 bg-accent/10 p-4"><div className="flex items-center gap-2 text-accent"><Lightbulb size={15} /><span className="font-mono text-[10px] uppercase tracking-wider">Small promise</span></div><p className="mt-2 text-[12px] leading-5 text-foreground/70">Start with a messy thought. Leave with the next clear step.</p></div>
            </aside>
          </div>
        </main>
      </div>
       {activeTool && <WorkspaceToolPanel
         tool={activeTool}
         onClose={() => setActiveTool(null)}
         documents={knowledgeDocs}
         conversations={conversations}
         onUploadKnowledge={(file) => void uploadKnowledge(file)}
         onDeleteKnowledge={(id) => void deleteKnowledge(id)}
         onSearchHistory={(search) => void loadHistory(search)}
         sandboxCode={sandboxCode}
         onSandboxCodeChange={setSandboxCode}
         provider={provider}
         onProviderChange={setProvider}
         localEndpoint={localEndpoint}
         onLocalEndpointChange={setLocalEndpoint}
         localModel={localModel}
         onLocalModelChange={setLocalModel}
         onRunPrompt={runToolPrompt}
         onExportMarkdown={exportMarkdown}
         onExportPdf={exportPdf}
         onDownloadCode={downloadCode}
         onNotice={setNotice}
       />}
      {notice && <div role="status" data-testid="status-notice" className="animate-rise-in fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground shadow-xl"><Check size={13} className="text-primary" />{notice}</div>}
    </div>
  );
}

function WorkspaceToolPanel({
  tool,
  onClose,
  documents,
  conversations,
  onUploadKnowledge,
  onDeleteKnowledge,
  onSearchHistory,
  sandboxCode,
  onSandboxCodeChange,
  provider,
  onProviderChange,
  localEndpoint,
  onLocalEndpointChange,
  localModel,
  onLocalModelChange,
  onRunPrompt,
  onExportMarkdown,
  onExportPdf,
  onDownloadCode,
  onNotice,
}: {
  tool: WorkspaceTool;
  onClose: () => void;
  documents: KnowledgeDocument[];
  conversations: ConversationSummary[];
  onUploadKnowledge: (file: File) => void;
  onDeleteKnowledge: (id: number) => void;
  onSearchHistory: (search: string) => void;
  sandboxCode: string;
  onSandboxCodeChange: (value: string) => void;
  provider: Provider;
  onProviderChange: (value: Provider) => void;
  localEndpoint: string;
  onLocalEndpointChange: (value: string) => void;
  localModel: string;
  onLocalModelChange: (value: string) => void;
  onRunPrompt: (prompt: string) => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  onDownloadCode: () => void;
  onNotice: (message: string) => void;
}) {
  const [historySearch, setHistorySearch] = useState('');
  const [debugLog, setDebugLog] = useState('');
  const [databaseBrief, setDatabaseBrief] = useState('');
  const [socialBrief, setSocialBrief] = useState('');
  const toolMeta: Record<WorkspaceTool, { label: string; description: string }> = {
    knowledge: { label: 'Knowledge base', description: 'Upload project documents that SAZ AI can use as context.' },
    history: { label: 'Chat history', description: 'Search saved conversations for this project.' },
    sandbox: { label: 'Live code sandbox', description: 'Preview HTML, CSS, and JavaScript safely in the browser.' },
    debugger: { label: 'Smart error debugger', description: 'Paste a log or stack trace and get a focused fix.' },
    database: { label: 'DB playground', description: 'Generate schemas, REST APIs, and backend scripts from a brief.' },
    social: { label: 'Social content hub', description: 'Create launch scripts, captions, tags, and content plans.' },
    settings: { label: 'AI provider settings', description: 'Choose automatic fallback or a local Ollama/LM Studio endpoint.' },
  };
  const meta = toolMeta[tool];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-sidebar/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">SAZ AI workspace</div>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.03em]">{meta.label}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
          </div>
          <button type="button" aria-label="Close workspace tool" onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={17} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {tool === 'knowledge' && (
            <div className="space-y-5">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center transition hover:bg-primary/10">
                <Upload size={22} className="text-primary" />
                <span className="mt-3 text-sm font-bold">Upload text, PDF, or code files</span>
                <span className="mt-1 text-xs text-muted-foreground">Files are stored with the selected project and injected into future prompts.</span>
                <input type="file" multiple accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.css,.html,.sql,.pdf,text/*,application/pdf" className="sr-only" onChange={(event) => { for (const file of Array.from(event.target.files ?? [])) onUploadKnowledge(file); event.currentTarget.value = ''; }} />
              </label>
              <div className="space-y-2">
                {documents.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No project documents yet.</p> : documents.map((document) => (
                  <div key={document.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <FileCode2 size={16} className="shrink-0 text-primary" />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{document.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{document.mimeType}</p></div>
                    <button type="button" aria-label={`Remove ${document.name}`} onClick={() => onDeleteKnowledge(document.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tool === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"><Search size={15} className="text-muted-foreground" /><input autoFocus value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); onSearchHistory(event.target.value); }} placeholder="Search conversation titles and messages..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
              {conversations.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-xs text-muted-foreground">No saved conversations match your search.</p> : <div className="space-y-2">{conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => onNotice(`Conversation ${conversation.id} is saved in project history`)} className="w-full rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50"><p className="truncate text-xs font-bold">{conversation.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(conversation.updatedAt).toLocaleString()}</p></button>)}</div>}
            </div>
          )}

          {tool === 'sandbox' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div><label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">HTML / CSS / JS</label><textarea value={sandboxCode} onChange={(event) => onSandboxCodeChange(event.target.value)} className="h-80 w-full resize-none rounded-2xl border border-border bg-card p-4 font-mono text-xs leading-5 outline-none focus:border-primary" spellCheck={false} /></div>
              <div><label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview</label><iframe title="SAZ AI live code sandbox" sandbox="allow-scripts" srcDoc={sandboxCode} className="h-80 w-full rounded-2xl border border-border bg-white" /></div>
            </div>
          )}

          {tool === 'debugger' && (
            <div className="space-y-4"><textarea autoFocus value={debugLog} onChange={(event) => setDebugLog(event.target.value)} placeholder="Paste the error, stack trace, or failing code here..." className="h-64 w-full resize-none rounded-2xl border border-border bg-card p-4 font-mono text-xs leading-5 outline-none focus:border-primary" /><button type="button" disabled={!debugLog.trim()} onClick={() => onRunPrompt(`Act as a senior debugger. Analyze this error and return the root cause, a minimal fix, and a verification checklist:\n\n${debugLog}`)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40">Analyze and fix</button></div>
          )}

          {tool === 'database' && (
            <div className="space-y-4"><textarea autoFocus value={databaseBrief} onChange={(event) => setDatabaseBrief(event.target.value)} placeholder="Describe the data model or API you need..." className="h-40 w-full resize-none rounded-2xl border border-border bg-card p-4 text-sm outline-none focus:border-primary" /><div className="flex flex-wrap gap-2"><button type="button" disabled={!databaseBrief.trim()} onClick={() => onRunPrompt(`Generate a production-ready database schema and REST API for this requirement. Include SQL, tables, indexes, validation, and example endpoints:\n\n${databaseBrief}`)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40">Generate DB + API</button><button type="button" onClick={() => onRunPrompt('Generate a secure Node.js REST API starter with routes, validation, error handling, and environment configuration.')} className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold hover:bg-muted">Node API starter</button></div></div>
          )}

          {tool === 'social' && (
            <div className="space-y-4"><textarea autoFocus value={socialBrief} onChange={(event) => setSocialBrief(event.target.value)} placeholder="What are you launching, for whom, and on which platform?" className="h-40 w-full resize-none rounded-2xl border border-border bg-card p-4 text-sm outline-none focus:border-primary" /><button type="button" disabled={!socialBrief.trim()} onClick={() => onRunPrompt(`Create a social content launch pack for YouTube, TikTok, and Facebook. Include a short video script, hooks, captions, hashtags, thumbnail ideas, and a 7-day launch plan:\n\n${socialBrief}`)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40">Generate content pack</button></div>
          )}

          {tool === 'settings' && (
            <div className="space-y-5">
              <label className="block"><span className="mb-2 block text-xs font-bold">AI provider</span><select value={provider} onChange={(event) => onProviderChange(event.target.value as Provider)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none"><option value="auto">Automatic fallback · Gemini → Groq → DeepSeek → OpenAI</option><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="local">Local Ollama / LM Studio</option></select></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-bold">Local endpoint</span><input value={localEndpoint} onChange={(event) => onLocalEndpointChange(event.target.value)} placeholder="http://localhost:11434" className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none" /></label><label className="block"><span className="mb-2 block text-xs font-bold">Local model</span><input value={localModel} onChange={(event) => onLocalModelChange(event.target.value)} placeholder="llama3.2" className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none" /></label></div>
              <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-5 text-muted-foreground">Provider credentials remain server-side. Local mode only sends the endpoint and model name you choose to the API server.</p>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={onExportMarkdown} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"><FileDown size={14} /> Export Markdown</button><button type="button" onClick={onExportPdf} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"><Download size={14} /> Export PDF</button><button type="button" onClick={onDownloadCode} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"><Code2 size={14} /> Download code</button><button type="button" onClick={() => onNotice('GitHub integration needs to be connected before pushing code')} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"><Github size={14} /> Push to GitHub</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, language, onCopy }: { message: Message; language: Language; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const isAssistant = message.role === 'assistant';
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message.text); } catch { /* local demo */ }
    setCopied(true);
    onCopy();
    window.setTimeout(() => setCopied(false), 1200);
  };
  const speakMessage = () => {
    if (!('speechSynthesis' in window)) {
      onCopy();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = language === 'english' ? 'en-US' : 'ur-PK';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };
  return (
    <div className={`animate-rise-in flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className={`grid size-8 shrink-0 place-items-center rounded-xl ${isAssistant ? 'bg-sidebar text-primary' : 'bg-accent text-accent-foreground'}`}>{isAssistant ? <Bot size={16} /> : <span className="text-xs font-extrabold">Z</span>}</div>
      <div className={`group max-w-[min(88%,620px)] ${isAssistant ? '' : 'items-end'}`}>
                        <div className={`flex items-center gap-2 px-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground ${isAssistant ? '' : 'justify-end'}`}><span>{isAssistant ? 'SAZ AI' : 'You'}</span><span className="text-muted-foreground/50">{message.time}</span></div>
        <div
          data-testid={`message-${message.role}-${message.id}`}
          dir="auto"
          className={`rounded-2xl px-4 py-3.5 text-[13px] leading-6 ${isAssistant ? 'rounded-tl-md border border-border bg-card text-foreground shadow-[0_6px_20px_hsl(var(--foreground)/.035)]' : 'rounded-tr-md bg-sidebar text-sidebar-foreground'}`}
        >
          <MarkdownMessage content={message.text} />
        </div>
        {isAssistant && <div className="mt-1.5 flex items-center gap-3 px-1 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
          <button type="button" aria-label="Copy assistant message" data-testid={`button-copy-message-${message.id}`} onClick={copyMessage} className="flex items-center gap-1 hover:text-foreground">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" aria-label="Read assistant message aloud" data-testid={`button-speak-message-${message.id}`} onClick={speakMessage} className="flex items-center gap-1 hover:text-foreground"><Volume2 size={12} />{speaking ? 'Speaking' : 'Read aloud'}</button>
        </div>}
      </div>
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="chat-markdown" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ node, className, children, ...props }) => (
            <code className={className} {...props}>
              {children}
            </code>
          ),
          pre: ({ node, children, ...props }) => (
            <pre {...props} className="chat-markdown-pre">
              {children}
            </pre>
          ),
          a: ({ node, children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
