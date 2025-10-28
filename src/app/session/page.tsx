import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { SessionView } from "./_components/session-view";

export const metadata: Metadata = {
  title: "Session Page",
};

type SessionSearchParams = Promise<{ id?: string }>;

export default async function SessionPage({
  searchParams,
}: {
  searchParams: SessionSearchParams;
}) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Session" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">
            No session id provided.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Session" />
      <SessionView sessionId={id} />
    </div>
  );
}
