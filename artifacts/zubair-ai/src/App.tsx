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
  Check,
  ChevronDown,
  Code2,
  Copy,
  FileCode2,
  FolderKanban,
  Lightbulb,
  Mic,
  Moon,
  PanelLeft,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
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
type Message = { id: number; role: 'assistant' | 'user'; text: string; time: string };
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
  text: "Assalam-o-alaikum, Zubair. I’m ready to turn a rough thought into a working build. Ask me to code, debug, explain, or shape your next app idea.",
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
  const [notice, setNotice] = useState('');
  const [mobilePanel, setMobilePanel] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    void fetch('/api/assistant/projects')
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Project[]) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setNotice('Project memory is unavailable'));
  }, []);

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
          history: [...messages, userMessage].slice(-16).map((item) => ({ role: item.role, content: item.text })),
        }),
      });
      const data = await response.json() as { reply?: string; project?: Project | null; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error ?? 'The assistant could not respond.');
      setMessages((current) => [...current, { id: messageId.current++, role: 'assistant', text: data.reply!, time: getTime() }]);
      if (data.project) upsertProject(data.project);
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

  const resetConversation = (label: string) => {
    setMessages([{ ...initialMessage, text: language === 'english' ? initialMessage.text : language === 'urdu' ? 'السلام علیکم، زبیر۔ میں آپ کے خیال کو ایک کام کرنے والی ایپ میں بدلنے کے لیے تیار ہوں۔ کوڈ، ڈیبگ، وضاحت یا اگلے ایپ آئیڈیا کے بارے میں پوچھیں۔' : 'Assalam-o-alaikum, Zubair. Main aap ke khayal ko working app mein badalne ke liye tayyar hoon. Code, debug, wazahat ya aglay app idea ke baare mein poochein.' }]);
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
                <div className="font-serif text-[21px] font-semibold leading-none tracking-[-0.03em]">Zubair AI</div>
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
              <button type="button" data-testid="button-theme" aria-label="Theme settings" onClick={() => setNotice('Light, focused workspace')} className="ml-auto rounded-lg p-2 text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"><Moon size={16} /></button>
            </div>
          </div>
        </aside>

        {mobilePanel && <button type="button" aria-label="Close navigation overlay" data-testid="button-close-overlay" onClick={() => setMobilePanel(false)} className="fixed inset-0 z-20 bg-sidebar/40 backdrop-blur-sm lg:hidden" />}

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-8 lg:px-12">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Open navigation" data-testid="button-open-sidebar" onClick={() => setMobilePanel(true)} className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground hover:bg-muted lg:hidden"><PanelLeft size={18} /></button>
              <div className="hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-primary animate-pulse-soft" /><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Workspace /</span><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/60">{activeMode.label}</span></div>
              <div className="sm:hidden"><div className="font-serif text-lg font-semibold">Zubair AI</div><div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">ready to build</div></div>
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
                    {messages.map((message) => <MessageBubble key={message.id} message={message} onCopy={() => setNotice('Message copied')} />)}
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
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); } }} rows={2} data-testid="input-message" placeholder={language === 'urdu' ? 'اپنی سوچ یہاں لکھیں...' : language === 'roman' ? 'Apni soch yahan likhein...' : 'Tell me what you want to build...'} className="w-full resize-none bg-transparent px-3 pb-11 pt-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground/65" />
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                      <div className="flex items-center gap-1"><button type="button" data-testid="button-voice" onClick={() => setNotice('Voice input is coming next')} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><Mic size={16} /></button><span className="hidden font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 sm:inline">Shift + Enter for a new line</span></div>
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
      {notice && <div role="status" data-testid="status-notice" className="animate-rise-in fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground shadow-xl"><Check size={13} className="text-primary" />{notice}</div>}
    </div>
  );
}

function MessageBubble({ message, onCopy }: { message: Message; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message.text); } catch { /* local demo */ }
    setCopied(true);
    onCopy();
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className={`animate-rise-in flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className={`grid size-8 shrink-0 place-items-center rounded-xl ${isAssistant ? 'bg-sidebar text-primary' : 'bg-accent text-accent-foreground'}`}>{isAssistant ? <Bot size={16} /> : <span className="text-xs font-extrabold">Z</span>}</div>
      <div className={`group max-w-[min(88%,620px)] ${isAssistant ? '' : 'items-end'}`}>
        <div className={`flex items-center gap-2 px-1 pb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground ${isAssistant ? '' : 'justify-end'}`}><span>{isAssistant ? 'Zubair AI' : 'You'}</span><span className="text-muted-foreground/50">{message.time}</span></div>
        <div
          data-testid={`message-${message.role}-${message.id}`}
          dir="auto"
          className={`rounded-2xl px-4 py-3.5 text-[13px] leading-6 ${isAssistant ? 'rounded-tl-md border border-border bg-card text-foreground shadow-[0_6px_20px_hsl(var(--foreground)/.035)]' : 'rounded-tr-md bg-sidebar text-sidebar-foreground'}`}
        >
          <MarkdownMessage content={message.text} />
        </div>
        {isAssistant && <button type="button" aria-label="Copy assistant message" data-testid={`button-copy-message-${message.id}`} onClick={copyMessage} className="mt-1.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>}
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
