import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { EditSessionForm } from "../_components/edit-session-form";

export const metadata: Metadata = {
  title: "Edit Agent",
};

type SessionSearchParams = Promise<{ id?: string }>;

export default async function EditSessionPage({
  searchParams,
}: {
  searchParams: SessionSearchParams;
}) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Edit Agent" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">
            No agent ID provided.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Edit Agent" />
      <EditSessionForm sessionId={id} />
    </div>
  );
}
