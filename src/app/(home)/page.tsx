import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";

export const metadata: Metadata = {
  title: "Home",
};

const introMessages = [
  {
    text: "Welcome to Pluree Toolkit. It is a SaaS workspace built to design, test, and continuously improve AI systems without losing control of system prompts, models, or knowledge.",
  },
  {
    text: "Three core pillars:\n- Prompts and model configuration\n- Knowledge base management\n- The chat-and-training loop",
  },
  {
    text: "Prompts and model configuration: create multiple system-prompt profiles like Default, Knowledgebase Expert, Knowledgebase Analyzer, and Knowledgebase Creator. Tune prompts, LLM settings, and a thinking level for each profile.",
  },
  {
    text: "Knowledge base management: maintain articles in a searchable list with filters across status, access, channels, and IDs. The Smart Draft Wizard can draft new entries, check for duplicates and conflicts, run support checks, and ask for confirmation before saving. Power users can jump straight into the KB editor by article ID.",
  },
  {
    text: "Chat and training workflows: each agent has a dedicated chat editor with Markdown responses, quick-reply suggestions, message history shortcuts, and token usage. Training is explicit with confirmations and live status. Source attribution highlights what should be grounded in knowledge sources so every chat can drive a knowledgebase update.",
    suggestions: [
      "Show me prompt profiles",
      "Explain the Smart Draft Wizard",
      "How does source attribution work?",
    ],
  },
];

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center bg-gray-1 dark:bg-dark-2">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
          </div>
        }
      >
        <ChatInterface
          fullHeight
          cardOnly
          variant="bleed"
          headerTitle="Pluree Toolkit Assistant"
          headerSubtitle="Ask about prompts, knowledgebase management, and the chat-and-training loop."
          initialMessages={introMessages}
          showAuthCta
        />
      </Suspense>
    </div>
  );
}
