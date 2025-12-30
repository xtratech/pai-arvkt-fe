import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { KbArticleEditor } from "./_components/kb-article-editor";

export const metadata: Metadata = {
  title: "Knowledgebase",
};

type KbSearchParams = Promise<{ session_id?: string; id?: string }>;

export default async function KnowledgebasePage({
  searchParams,
}: {
  searchParams: KbSearchParams;
  }) {
  const { session_id: sessionId, id: articleId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Knowledgebase" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">No agent ID provided.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Knowledgebase" />

      <div className="mt-6 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <KbArticleEditor sessionId={sessionId} articleId={articleId ?? ""} />
      </div>
    </div>
  );
}
