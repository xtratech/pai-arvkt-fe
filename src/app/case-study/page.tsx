import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Case Study",
  description: "How Pluree AI Toolkit was designed to accelerate AI transformation and delivery quality.",
};

type CaseStudySection = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  videoUrl: string;
  embedUrl: string;
  summary: string;
  points: Array<{
    time: string;
    title: string;
    detail: string;
  }>;
};

const sections: CaseStudySection[] = [
  {
    id: "intro",
    label: "Part 1",
    title: "Intro",
    subtitle: "Agency philosophy and delivery model",
    videoUrl: "https://www.youtube.com/watch?v=pVn3puZD4Ro",
    embedUrl: "https://www.youtube-nocookie.com/embed/pVn3puZD4Ro",
    summary:
      "This introduction outlines Pluree AI Toolkit and Pluree AI's broader philosophy: use client pain points as signals for building advanced AI automation systems that can be delivered end-to-end.",
    points: [
      {
        time: "00:14",
        title: "Client-Driven Innovation",
        detail:
          "The toolkit was shaped directly by recurring client frustrations and operational gaps.",
      },
      {
        time: "00:49",
        title: "Deep Control Over AI",
        detail:
          "The team emphasizes owning the full automation stack beyond prototype-level outputs.",
      },
      {
        time: "00:57",
        title: "Rapid Development Cycles",
        detail:
          "Shared solutions are delivered in under two months today, with a goal to reduce this to under a week.",
      },
      {
        time: "01:15",
        title: "Comprehensive Delivery",
        detail:
          "Execution spans UX, front-end implementation, serverless backend architecture, and testing discipline.",
      },
      {
        time: "01:47",
        title: "Value and Quality",
        detail:
          "Automation is used to improve quality and cost effectiveness versus traditional agency workflows.",
      },
    ],
  },
  {
    id: "system-prompt",
    label: "Part 2",
    title: "System Prompt",
    subtitle: "Controlling personality, behavior, and model strategy",
    videoUrl: "https://www.youtube.com/watch?v=ZKJjPr6_6HI",
    embedUrl: "https://www.youtube-nocookie.com/embed/ZKJjPr6_6HI",
    summary:
      "Pluree AI Toolkit gives teams deep controls over AI behavior through prompt engineering, model selection, and independently trainable assistant profiles.",
    points: [
      {
        time: "00:16",
        title: "Prompt and Model Management",
        detail:
          "Users configure how agents think, speak, and behave, including temperature, top K, and thinking settings.",
      },
      {
        time: "01:10",
        title: "Default Assistant",
        detail:
          "The primary assistant handles direct interaction and response generation for end users.",
      },
      {
        time: "01:18",
        title: "Knowledge-Based Expert",
        detail:
          "Analyzes the full knowledge base to identify weaknesses and high-impact improvement opportunities.",
      },
      {
        time: "01:33",
        title: "Knowledge-Based Analyzer",
        detail:
          "Maps output segments back to source articles to power attribution and inline editing workflows.",
      },
      {
        time: "01:58",
        title: "Knowledge-Based Creator",
        detail:
          "Drafts new structured knowledge articles for review, tuning, and publication.",
      },
      {
        time: "02:35",
        title: "Independent Training",
        detail:
          "Each assistant can be trained separately, enabling granular optimization by job type.",
      },
    ],
  },
  {
    id: "knowledgebase",
    label: "Part 3",
    title: "Managing Knowledgebase Articles",
    subtitle: "Creating, validating, and refining grounded content",
    videoUrl: "https://www.youtube.com/watch?v=otS0AID3ZGY",
    embedUrl: "https://www.youtube-nocookie.com/embed/otS0AID3ZGY",
    summary:
      "This walkthrough covers the knowledge workflows used to manage channel-specific article distribution, avoid redundancy, and accelerate article creation with AI-guided drafting.",
    points: [
      {
        time: "00:43",
        title: "Manual Article Management",
        detail:
          "Users can add or edit articles and define channel distribution across web, voice, and messaging endpoints.",
      },
      {
        time: "01:01",
        title: "Duplicate Detection",
        detail:
          "Built-in checks detect overlap before publishing to avoid conflicting or redundant information.",
      },
      {
        time: "01:51",
        title: "AI-Powered Drafting",
        detail:
          "The Add with AI flow analyzes coverage and returns match scores before a new draft is generated.",
      },
      {
        time: "02:30",
        title: "Formatted Draft Generation",
        detail:
          "The Knowledge Base Creator outputs complete markdown-ready drafts with structure and titles.",
      },
      {
        time: "03:01",
        title: "Assumptions and Open Questions",
        detail:
          "Drafts surface assumptions and unresolved questions so teams can review before publishing.",
      },
      {
        time: "03:18",
        title: "Surprise Me",
        detail:
          "The Knowledge Base Expert proposes high-value next articles based on identified coverage gaps.",
      },
    ],
  },
  {
    id: "inline-chat-editor",
    label: "Part 4",
    title: "Inline Chat Editor",
    subtitle: "Fixing wrong answers directly from conversation flow",
    videoUrl: "https://www.youtube.com/watch?v=yBnColCGKMY",
    embedUrl: "https://www.youtube-nocookie.com/embed/yBnColCGKMY",
    summary:
      "The Inline Chat Editor removes the friction of searching through source databases by allowing direct, attributed edits from the response itself.",
    points: [
      {
        time: "00:36",
        title: "Direct Response Editing",
        detail:
          "Users can edit knowledge directly from the chat response instead of navigating manually through documents.",
      },
      {
        time: "01:24",
        title: "Knowledge Base Analyzer in Flow",
        detail:
          "Sentence-level mapping is automatically generated to locate where each claim came from.",
      },
      {
        time: "01:44",
        title: "Precise Content Linking",
        detail:
          "The editor identifies specific source articles and exact snippets that should be corrected.",
      },
      {
        time: "02:20",
        title: "Update and Train",
        detail:
          "Edits are saved first in a non-published state, then activated when the user explicitly runs training.",
      },
    ],
  },
];

export default function CaseStudyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-obsidian text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neon-yellow/10 blur-[110px]" />
        <div className="absolute right-[-120px] top-[320px] h-[360px] w-[360px] rounded-full bg-cyan-300/10 blur-[130px]" />
        <div className="absolute bottom-[-110px] left-[-80px] h-[340px] w-[340px] rounded-full bg-emerald-300/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8 md:pt-14">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex rounded-full border border-neon-yellow/40 bg-neon-yellow/15 px-3 py-1 font-cyborg-mono text-[11px] uppercase tracking-[0.22em] text-neon-yellow">
              Case Study
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Built from real deployment workflows
            </div>
          </div>

          <h1 className="mt-5 max-w-4xl font-cyborg text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
            How Pluree AI Toolkit turns AI operation complexity into a controllable delivery system.
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-300 sm:text-base">
            This case study explores the development and impact of the Pluree AI Toolkit, a comprehensive solution
            designed to move AI from &quot;experimental prototype&quot; to &quot;reliable enterprise asset.&quot; By integrating
            specialized AI agents&mdash;including a dedicated Knowledge Base Analyzer and a Real-Time Inline Editor&mdash;Pluree
            AI has successfully bridged the gap between raw Large Language Models (LLMs) and human-led accuracy. The
            following sections detail how this toolkit empowers non-technical users to take &quot;deep control&quot; of their
            AI&apos;s behavior, ensuring that every response is grounded in truth, every content gap is proactively
            identified, and every correction is made with surgical precision.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="font-cyborg-mono text-2xl text-neon-yellow">4</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Collaborative AI Agents</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="font-cyborg-mono text-2xl text-neon-yellow">&lt; 8 wks</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Deployment Velocity</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="font-cyborg-mono text-2xl text-neon-yellow">100%</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Response Attribution</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="font-cyborg-mono text-2xl text-neon-yellow">Multi</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Channel Knowledge Sync</div>
            </div>
          </div>
          
        </header>

        <nav className="sticky top-4 z-20 mt-6 rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-xl">
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-neon-yellow/40 hover:text-neon-yellow"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <main className="mt-8 space-y-8">
          {sections.map((section, index) => (
            <section
              id={section.id}
              key={section.id}
              className="scroll-mt-24 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-5 shadow-2xl shadow-black/25 md:p-7"
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-cyborg-mono text-xs uppercase tracking-[0.2em] text-neon-yellow">
                    {section.label}
                  </div>
                  <h2 className="mt-2 font-cyborg text-2xl font-semibold text-white md:text-3xl">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">{section.subtitle}</p>
                </div>
                <a
                  href={section.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-neon-yellow/40 hover:text-neon-yellow"
                >
                  Open on YouTube
                </a>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
                  <p className="text-sm leading-relaxed text-slate-200">{section.summary}</p>
                  <div className="mt-4 space-y-3">
                    {section.points.map((point) => (
                      <div
                        key={`${section.id}-${point.time}-${point.title}`}
                        className="rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-neon-yellow/35 bg-neon-yellow/10 px-2 py-0.5 font-cyborg-mono text-[11px] text-neon-yellow">
                            {point.time}
                          </span>
                          <h3 className="text-sm font-semibold text-white">{point.title}</h3>
                        </div>
                        <p className="mt-1 text-sm text-slate-300">{point.detail}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <aside className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-2">
                  <div className="absolute left-0 right-0 top-0 h-24 bg-gradient-to-b from-neon-yellow/10 to-transparent" />
                  <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <iframe
                      src={section.embedUrl}
                      title={`${section.title} video`}
                      loading={index === 0 ? "eager" : "lazy"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="aspect-video w-full"
                    />
                  </div>
                </aside>
              </div>
            </section>
          ))}
        </main>

        <footer className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-lg">
          <p className="mx-auto max-w-3xl text-sm text-slate-300">
            The Pluree AI Toolkit case study demonstrates a practical model for shipping AI systems with
            controllable prompts, source-grounded knowledge workflows, and direct response correction.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:border-neon-yellow/40 hover:text-neon-yellow"
            >
              Back to Home
            </Link>
            <Link
              href="/auth/sign-up"
              className="rounded-xl border border-neon-yellow/50 bg-neon-yellow px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-neon-lime"
            >
              Start Building
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
