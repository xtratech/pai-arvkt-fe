import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionById } from "../session/fetch";
import { SystemPromptContent } from "./_components/system-prompt-content";
import type { SessionRecord } from "@/services/sessions";

export const metadata: Metadata = {
  title: "System Prompt",
};

type SystemPromptSearchParams = Promise<{ session_id?: string }>;

export default async function SystemPromptPage({
  searchParams,
}: {
  searchParams: SystemPromptSearchParams;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="System Prompt" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">No agent ID provided.</p>
        </div>
      </div>
    );
  }

  const session = await getSessionById(sessionId).catch(() => null);

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="System Prompt" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-dark dark:text-white">System Prompt Settings</h2>
            <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Agent:{" "}
              <span className="font-medium text-dark dark:text-white">{session?.name ?? "Unknown"}</span>
              <span className="mx-2">|</span>
              ID:{" "}
              <Link
                href={`/session?id=${sessionId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {sessionId}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/chat-editor?session_id=${encodeURIComponent(sessionId)}`}
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
            >
              Chat Editor
            </Link>
            <Link
              href={`/kb-articles?session_id=${encodeURIComponent(sessionId)}`}
              className="inline-flex items-center rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark shadow-sm transition hover:bg-gray-2 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
            >
              KB Articles
            </Link>
            <Link
              href={`/session/edit?id=${encodeURIComponent(sessionId)}`}
              className="inline-flex items-center rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark shadow-sm transition hover:bg-gray-2 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
            >
                Edit Agent
            </Link>
          </div>
        </div>

        <SystemPromptContent
          sessionId={sessionId}
          initialSession={session as SessionRecord | null}
        />
      </div>
    </div>
  );
}
