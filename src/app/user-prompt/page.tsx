import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { getSessionById } from "../session/fetch";
import { UserPromptContent } from "./_components/user-prompt-content";

export const metadata: Metadata = {
  title: "User Prompt",
};

type UserPromptSearchParams = Promise<{ session_id?: string; file_id?: string }>;

export default async function UserPromptPage({
  searchParams,
}: {
  searchParams: UserPromptSearchParams;
}) {
  const { session_id: sessionId, file_id: fileId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="User Prompt" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">No agent ID provided.</p>
        </div>
      </div>
    );
  }

  const session = await getSessionById(sessionId).catch(() => null);

  const userId = (session as any)?.user_id as string | undefined;
  const fileName =
    fileId ??
    (session as any)?.user_prompt_file_name ??
    (session as any)?.user_prompt_files?.find?.((f: any) => f?.active)?.file_name ??
    (session as any)?.user_prompt_files?.[0]?.file_name;

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="User Prompt" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-dark dark:text-white">Agent User Prompt</h2>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            Agent: <span className="text-dark dark:text-white font-medium">{session?.name ?? "Unknown"}</span>
            <span className="mx-2">|</span>
            ID:{" "}
            <a
              href={`/session?id=${sessionId}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {sessionId}
            </a>
          </div>
          {fileName ? (
            <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              File: <span className="text-dark dark:text-white">{fileName}</span>
            </div>
          ) : null}
        </div>

        <UserPromptContent
          userId={userId}
          sessionId={sessionId}
          fileName={fileName}
          fallbackContent={(session as any)?.user_prompt}
          initialSession={session as any}
        />
      </div>
    </div>
  );
}
