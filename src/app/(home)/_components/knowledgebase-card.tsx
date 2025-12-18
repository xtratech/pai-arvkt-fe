import Link from "next/link";
import { getSessionsData } from "@/app/sessions/fetch";

type Session = {
  id: string;
  name: string;
  updated_at?: string;
};

function formatRelative(timestamp?: string) {
  if (!timestamp) return "";
  const t = new Date(timestamp).getTime();
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export async function KnowledgebaseCard({ className = "" }: { className?: string }) {
  const data = (await getSessionsData()) as Session[];
  const latest = [...data].sort((a, b) => {
    const ta = new Date(a.updated_at || a.id).getTime();
    const tb = new Date(b.updated_at || b.id).getTime();
    return tb - ta;
  })[0];

  return (
    <div className={`col-span-3 rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card xl:col-span-2 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark dark:text-white">Knowledgebase</h3>
        <Link href="/sessions" className="text-sm font-medium text-primary hover:underline">View all</Link>
      </div>

      {latest ? (
        <div className="rounded-md border p-4 dark:border-light-yellow-1">
          <div className="mb-1 text-sm text-dark-5 dark:text-dark-6">Latest session KB</div>
          <Link href={`/session?id=${latest.id}`} className="text-body-md font-semibold text-dark hover:underline dark:text-white">
            {latest.name}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span><span className="text-dark-5 dark:text-dark-6">Entries: </span>1</span>
            {latest.updated_at && (
              <span className="text-dark-5 dark:text-dark-6">Updated {formatRelative(latest.updated_at)}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-dark-5 dark:text-dark-6">No sessions available yet.</div>
      )}
    </div>
  );
}
