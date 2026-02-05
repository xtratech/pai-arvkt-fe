import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guide",
};

const quickLinks = [
  {
    title: "Agents",
    description: "Find and copy agent IDs.",
    href: "/sessions",
  },
  {
    title: "System Prompt",
    description: "Tune behavior and models.",
    href: "/system-prompt",
  },
  {
    title: "Knowledgebase",
    description: "Manage KB articles.",
    href: "/kb-articles",
  },
  {
    title: "Chat Editor",
    description: "Test, train, and edit sources.",
    href: "/chat-editor",
  },
  {
    title: "Web Widget",
    description: "Configure the site widget.",
    href: "/web-widget-editor",
  },
];

const sectionLinks = [
  { label: "System Prompt", href: "#system-prompt" },
  { label: "Knowledgebase", href: "#knowledgebase" },
  { label: "Chat Editor", href: "#chat-editor" },
  { label: "Web Widget", href: "#web-widget" },
];

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Guide" />

      <div className="rounded-[18px] border border-stroke bg-gradient-to-br from-primary/10 via-white to-white p-6 shadow-1 dark:border-dark-3 dark:from-primary/20 dark:via-gray-dark dark:to-gray-dark">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Field Guide
            </span>
            <h3 className="mt-3 text-2xl font-semibold text-primary dark:text-white">
              Shape, train, and deploy your agent with confidence.
            </h3>
            <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
              This page walks through the full toolkit: system prompts, knowledgebase operations,
              Chat Editor workflows, and web widget setup. Use it as a reference while you build,
              test, and publish.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-md">
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="group rounded-xl border border-stroke bg-white/80 p-3 transition hover:border-primary/40 hover:shadow-sm dark:border-dark-3 dark:bg-dark-2"
              >
                <div className="text-sm font-semibold text-primary transition group-hover:text-primary dark:text-white">
                  {link.title}
                </div>
                <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  {link.description}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white/80 px-4 py-3 text-sm text-dark-5 shadow-sm dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
            <div className="text-sm font-semibold text-primary dark:text-white">Agent IDs power most tools.</div>
            <p className="mt-1">
              Open the Agents list to copy an ID, then append it in the URL as
              <span className="mx-1 rounded bg-gray-2 px-1 py-0.5 font-mono text-xs text-dark dark:bg-dark-3 dark:text-white">
                ?session_id=YOUR_ID
              </span>
              for System Prompt, Knowledgebase, Chat Editor, and Web Widget pages.
            </p>
          </div>
          <div className="rounded-xl border border-stroke bg-white/80 px-4 py-3 text-sm text-dark-5 shadow-sm dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
            <div className="text-sm font-semibold text-primary dark:text-white">Open Chat tools from the sidebar.</div>
            <p className="mt-1">
              The sidebar Chat Editor / Chat Playground links will prompt you for an agent ID and
              route you automatically. You can still deep-link if you already have the ID.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {sectionLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <section id="system-prompt" className="mt-10 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">System Prompt</p>
            <h3 className="mt-2 text-xl font-semibold text-primary dark:text-white">
              Define how your agent thinks, speaks, and behaves.
            </h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Everything here is profile-aware, so you can tailor default, KB Expert, KB Analyzer,
              and KB Creator behaviors separately.
            </p>
          </div>
          <Link
            href="/system-prompt"
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          >
            Open System Prompt
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Profiles & Prompts</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Switch between Default/Web Widget Assistant, KB Expert, KB Analyzer, and KB Creator.</li>
              <li>Default/Web Widget Assistant handles the main end-user conversations and widget replies.</li>
              <li>KB Expert focuses on deep knowledge base Q&A and grounded troubleshooting.</li>
              <li>KB Analyzer tags answers with source attribution for review and editing.</li>
              <li>KB Creator drafts new knowledge base articles and suggestions.</li>
              <li>System Prompt defines the assistant&apos;s behavior and rules.</li>
              <li>Suggestions Prompt generates follow-up questions and suggested replies.</li>
              <li>Character counts update live for every prompt field.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Model & Training</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Select the model (and see available thinking levels per model).</li>
              <li>The Training profile panel runs training for the active profile.</li>
              <li>Training requires the Chat API endpoint to be configured for the agent.</li>
              <li>KB Analyzer drives source attribution; KB Creator powers Smart Draft Wizard.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Advanced Parameters</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Temperature, Thinking level, Top K, Top P.</li>
              <li>Max output tokens and Candidate count.</li>
              <li>Response MIME type and Stop sequences (one per line).</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Saving & Visibility</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Unsaved changes are flagged in the header (Saved vs Unsaved changes).</li>
              <li>Use Save changes to persist or Discard to reset to the last loaded config.</li>
              <li>The agent config endpoint is displayed for transparency and troubleshooting.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="knowledgebase" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Knowledgebase</p>
            <h3 className="mt-2 text-xl font-semibold text-primary dark:text-white">
              Curate, draft, and refine knowledge articles.
            </h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              The Knowledgebase area combines a searchable library with an AI-powered drafting flow.
            </p>
          </div>
          <Link
            href="/kb-articles"
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          >
            Open Knowledgebase
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Library & Filters</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Search by title or content, with live totals and manual Refresh.</li>
              <li>Filter by IntranetStatus, WhatsAppStatus, VoiceCallStatus, WebStatus.</li>
              <li>Filter by AccessLevel, Channel, and specific IDs.</li>
              <li>Open any article from the table to edit details and content.</li>
              <li>If the KB endpoint is missing, a Configure Agent CTA appears.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Create Articles</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Add With AI launches the Smart Draft Wizard.</li>
              <li>Add opens a manual editor when you already know the content.</li>
              <li>Surprise Me suggests a high-value article topic to draft.</li>
              <li>The draft flow checks for similar articles before saving.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Smart Draft Wizard</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Describe the article idea, then let the KB Analyzer check for duplicates.</li>
              <li>Review duplicate matches with confidence scores and supporting excerpts.</li>
              <li>Edit existing articles or Ignore & Create New if needed.</li>
              <li>Drafts are generated by the KB Creator profile.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Draft Insights & Editing</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Toggle Article Settings for status/access/channel fields.</li>
              <li>Preview Markdown or edit raw content before saving.</li>
              <li>Run Draft Insights to flag unsupported segments and confirm before saving.</li>
              <li>Insights list sources used, assumptions, and open questions.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Article Editor</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Edit an existing article&apos;s title, content, and status fields.</li>
              <li>Use the single-article page with an article ID for direct updates.</li>
              <li>Saving persists changes to the knowledge base source endpoint.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="chat-editor" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Chat Editor</p>
            <h3 className="mt-2 text-xl font-semibold text-primary dark:text-white">
              Test responses, train the model, and edit sources inline.
            </h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Chat Editor is the live workbench for verifying outputs and refining knowledge.
            </p>
          </div>
          <Link
            href="/chat-editor"
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          >
            Open Chat Editor
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Conversation Workflow</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Open with an agent ID to load the correct configuration.</li>
              <li>Enter sends a message, Shift+Enter adds a new line.</li>
              <li>Arrow Up/Down cycles through your recent messages.</li>
              <li>Suggestions appear below bot replies for quick follow-ups.</li>
              <li>Use kbexpert: to route a prompt to KB Expert settings.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Training Controls</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Train LLM runs a training job using the agent&apos;s Train Agent Command.</li>
              <li>Train LLM KB Experts triggers the KB Expert training command.</li>
              <li>A confirmation modal displays the command and cost reminder.</li>
              <li>Training status updates appear in the conversation thread.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Source Attribution</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Click Edit on a bot response to analyze knowledge sources.</li>
              <li>Highlighted segments show source IDs and titles on hover.</li>
              <li>Click a segment to edit the source article or create a new one.</li>
              <li>Token usage appears beneath the response when available.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Source Editor Modal</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Edit Knowledge Base Source updates the referenced article directly.</li>
              <li>Create Knowledge Base Source seeds a new article from the segment text.</li>
              <li>Save writes back to the KB source endpoint used by the agent.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="web-widget" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Web Widget</p>
            <h3 className="mt-2 text-xl font-semibold text-primary dark:text-white">
              Configure and deploy the embedded web chat widget.
            </h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              The Web Widget Editor produces a live preview and ready-to-embed script tag.
            </p>
          </div>
          <Link
            href="/web-widget-editor"
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary/40 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          >
            Open Web Widget Editor
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Workflow & Deployment</h4>
            <ul className="mt-3 space-y-2 text-sm text-dark-5 dark:text-dark-6">
              <li>Configure Widget Loader URL, API key name, and API key header.</li>
              <li>Enable Preview once the loader URL is set and the agent type is WebWidgetChatbot or WebChatbot.</li>
              <li>Copy the Embed Code snippet and paste it into your site or tag manager.</li>
              <li>API base and API key attributes are omitted from the snippet for security.</li>
              <li>Save changes to persist widget settings to the agent configuration.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-gray-dark">
            <h4 className="text-sm font-semibold text-primary dark:text-white">Customization Categories</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Branding & Colors</div>
                Title, position, primary/secondary/accent colors, background, bubble colors, text + header text colors,
                borders, panel + bubble radius, shadow intensity.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Typography</div>
                Primary and secondary font families for body and headings.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Layout & Sizing</div>
                Panel width/height, launcher size/icon, offsets, wide mode, compact mode.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Content & Copy</div>
                Subtitle, input placeholder, empty state text, first suggestions, greeting message, powered-by label,
                clear button text.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Behavior & UX</div>
                Auto-open with delay, sound alerts, typing indicator, streaming, focus scroll, suggestions toggle.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Data Collection</div>
                Consent gate, capture fields, capture timing, escalation button.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Privacy & Security</div>
                Cookie consent, session persistence, anonymous mode.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">Internationalization</div>
                Locale selection and RTL toggle.
              </div>
              <div className="rounded-lg border border-stroke/70 bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <div className="text-sm font-semibold text-primary dark:text-white">API & Identity</div>
                Widget ID, API base, API key, debug logging.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
