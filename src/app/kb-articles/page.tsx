import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { KbArticlesContent } from "./_components/kb-articles-content";

export const metadata: Metadata = {
  title: "Knowledgebase Articles",
};

type KbArticlesSearchParams = Promise<{ session_id?: string }>;

export default async function KbArticlesPage({
  searchParams,
}: {
  searchParams: KbArticlesSearchParams;
}) {
  const { session_id: sessionId } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Knowledgebase Articles" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        {!sessionId ? (
          <div className="text-sm text-dark-5 dark:text-dark-6">
            No agent ID provided.
          </div>
        ) : (
          <KbArticlesContent sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}

