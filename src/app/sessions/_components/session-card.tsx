import Link from "next/link";

type Session = {
  id: string;
  name: string;
  status?: string;
  overall_score?: number;
  updated_at?: string;
};

export function SessionCard({ session }: { session: Session }) {

  const formatRelative = (timestamp?: string) => {
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
  };

  const prettyStatus = (status?: string) =>
    (status || "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="col-span-12 rounded-[10px] bg-white py-6 shadow-1 dark:bg-gray-dark dark:shadow-card xl:col-span-4">
      <h2 className="mb-5.5 px-7.5 text-body-2xlg font-bold text-dark dark:text-white">Name: {session.name}</h2>

      <Link href={`/session?id=${session.id}`} className="block px-7.5 py-3 outline-none hover:bg-gray-2 focus-visible:bg-gray-2 dark:hover:bg-dark-2 dark:focus-visible:bg-dark-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                <span className="text-dark-5 dark:text-dark-6">Status: </span>
                {prettyStatus(session.status)}
              </span>
              <span>
                <span className="text-dark-5 dark:text-dark-6">Score: </span>
                {session.overall_score}%
              </span>
            </div>
          </div>

          <div className="text-xs text-dark-5 dark:text-dark-6">
            ID: #{session.id}
            <span className="mx-2">|</span>
            Last Updated: {formatRelative(session.updated_at)}
          </div>
        </div>
      </Link>
    </div>
  );
}
