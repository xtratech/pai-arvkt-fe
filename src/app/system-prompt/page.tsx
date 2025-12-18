import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
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
          <p className="text-sm text-dark-5 dark:text-dark-6">No session_id provided.</p>
        </div>
      </div>
    );
  }

  const session = await getSessionById(sessionId).catch(() => null);

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="System Prompt" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-dark dark:text-white">Session System Prompt</h2>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            Session:{" "}
            <span className="text-dark dark:text-white font-medium">
              {session?.name ?? "Unknown"}
            </span>
            <span className="mx-2">|</span>
            ID:{" "}
            <a
              href={`/session?id=${sessionId}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {sessionId}
            </a>
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
