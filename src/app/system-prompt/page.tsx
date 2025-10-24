import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { getSessionById } from "../session/fetch";

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

  const session = await getSessionById(sessionId);

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="System Prompt" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">Session not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="System Prompt" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-dark dark:text-white">Session System Prompt</h2>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            Session: <span className="text-dark dark:text-white font-medium">{session.name}</span>
            <span className="mx-2">•</span>
            ID: <span className="text-dark dark:text-white">{session.id}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-dark dark:text-white">System Prompt</div>
          {session.system_prompt ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-2 p-4 text-sm dark:bg-dark-2 dark:text-dark-6">
{session.system_prompt}
            </pre>
          ) : (
            <div className="text-sm text-dark-5 dark:text-dark-6">No system prompt set for this session.</div>
          )}
        </div>
      </div>
    </div>
  );
}
