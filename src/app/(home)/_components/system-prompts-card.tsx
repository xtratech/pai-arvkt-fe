import Link from "next/link";
import { getSessionsData } from "@/app/sessions/fetch";

type Session = {
  id: string;
  name: string;
  system_prompt?: string;
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

function truncate(text: string, max = 120) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export async function SystemPromptsCard({ className = "" }: { className?: string }) {
  const data = (await getSessionsData()) as Session[];
  const latest = [...data].sort((a, b) => {
    const ta = new Date(a.updated_at || a.id).getTime();
    const tb = new Date(b.updated_at || b.id).getTime();
    return tb - ta;
  })[0];

  return (
    <div className={`col-span-3 rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card xl:col-span-2 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-dark dark:text-white">System Prompt</h3>
        <Link href="/sessions" className="text-sm font-medium text-primary hover:underline">View all</Link>
      </div>

      {latest ? (
        <div className="rounded-md border p-4 dark:border-light-yellow-1">
          <div className="mb-1 text-sm text-dark-5 dark:text-dark-6">Latest prompt</div>
          <Link href={`/system-prompt?session_id=${latest.id}`} className="text-body-md font-semibold text-dark hover:underline dark:text-white">
            {latest.name}
          </Link>
          {latest.system_prompt ? (
            <p className="mt-2 line-clamp-3 text-sm text-dark-5 dark:text-dark-6">{truncate(latest.system_prompt)}</p>
          ) : (
            <p className="mt-2 text-sm text-dark-5 dark:text-dark-6">No system prompt set.</p>
          )}
          {latest.updated_at && (
            <div className="mt-2 text-xs text-dark-5 dark:text-dark-6">Updated {formatRelative(latest.updated_at)}</div>
          )}
        </div>
      ) : (
        <div className="text-sm text-dark-5 dark:text-dark-6">No agents available yet.</div>
      )}
    </div>
  );
}

