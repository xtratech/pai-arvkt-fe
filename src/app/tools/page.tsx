import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary dark:text-white">Tools</h1>
        <p className="text-sm text-dark-5 dark:text-dark-6">
          Utilities and shortcuts to manage your agents and workflows.
        </p>
      </div>

      <div className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-dark-5 dark:text-dark-6">
          No tools added yet. This space is ready for future items.
        </p>
      </div>
    </div>
  );
}
