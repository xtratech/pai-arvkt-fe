import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { getSessionById } from "../session/fetch";

export const metadata: Metadata = {
  title: "Knowledgebase",
};

type KbSearchParams = Promise<{ session_id?: string }>;

export default async function KnowledgebasePage({
  searchParams,
}: {
  searchParams: KbSearchParams;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Knowledgebase" />
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
        <Breadcrumb pageName="Knowledgebase" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">Session not found.</p>
        </div>
      </div>
    );
  }

  const entries = Object.entries(session.knowledgebase || {});

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Knowledgebase" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-dark dark:text-white">
            Session Knowledgebase
          </h2>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            Session: <span className="text-dark dark:text-white font-medium">{session.name}</span>
            <span className="mx-2">•</span>
            ID: <span className="text-dark dark:text-white">{session.id}</span>
          </div>
        </div>

        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-neutral-100/50 data-[state=selected]:bg-neutral-100 dark:border-dark-3 dark:hover:bg-dark-2 dark:data-[state=selected]:bg-neutral-800 border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400 min-w-[180px] xl:pl-7.5">Key</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400">Value</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {entries.map(([k, v]) => (
                <tr key={k} className="border-b transition-colors hover:bg-neutral-100/50 data-[state=selected]:bg-neutral-100 dark:hover:bg-dark-2 dark:data-[state=selected]:bg-neutral-800 border-[#eee] dark:border-dark-3">
                  <td className="p-4 align-middle min-w-[180px] xl:pl-7.5">
                    <h5 className="text-dark dark:text-white font-medium">{k}</h5>
                  </td>
                  <td className="p-4 align-middle">
                    <p className="text-dark dark:text-white break-words">v</p>
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-dark-5 dark:text-dark-6" colSpan={2}>
                    No knowledgebase entries for this session.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
