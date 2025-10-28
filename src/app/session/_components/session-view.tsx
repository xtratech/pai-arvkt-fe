"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchSessionDetail,
  type SessionRecord,
  type SessionRun,
} from "@/services/sessions";

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : "";

const formatRelative = (timestamp?: string) => {
  if (!timestamp) return "";
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const prettyStatus = (status?: string) =>
  (status || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

type SessionViewProps = {
  sessionId: string;
};

export function SessionView({ sessionId }: SessionViewProps) {
  const [session, setSession] = useState<SessionRecord | undefined>();
  const [runs, setRuns] = useState<SessionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { session: fetchedSession, runs: fetchedRuns } =
          await fetchSessionDetail(sessionId);

        if (!active) return;

        setSession(fetchedSession);
        setRuns(fetchedRuns);

        if (!fetchedSession) {
          setError("Session not found.");
        }
      } catch (err) {
        if (!active) return;
        console.error("[SessionView] Unable to load session detail", err);
        setError("Unable to load this session right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [sessionId]);

  const knowledgeEntries = useMemo(
    () => Object.entries(session?.knowledgebase ?? {}),
    [session?.knowledgebase],
  );

  if (loading) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[200px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-dark-5 dark:text-dark-6">{error}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="mt-6 grid grid-cols-12 gap-6">
      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-body-2xlg font-bold text-dark dark:text-white">
            {session.name}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            {session.status && (
              <span className="rounded-full bg-gray-2 px-3 py-1 text-xs text-dark dark:bg-dark-2 dark:text-dark-6">
                {prettyStatus(session.status)}
              </span>
            )}
            {typeof session.overall_score !== "undefined" && (
              <span className="text-sm">
                <span className="text-dark-5 dark:text-dark-6">Score: </span>
                {session.overall_score}%
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-dark-5 dark:text-dark-6">ID</dt>
              <dd className="text-dark dark:text-white">{session.id}</dd>
              <dt className="text-dark-5 dark:text-dark-6">Created</dt>
              <dd className="text-dark dark:text-white">
                {formatDateTime(session.created_at)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Updated</dt>
              <dd className="text-dark dark:text-white">
                {formatDateTime(session.updated_at)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">User</dt>
              <dd className="text-dark dark:text-white">
                {session.user_id || "-"}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Mode</dt>
              <dd className="text-dark dark:text-white">
                {(session.config as any)?.mode || "-"}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Max Iterations</dt>
              <dd className="text-dark dark:text-white">
                {(session.config as any)?.max_iterations ?? "-"}
              </dd>
            </dl>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div>
              <div className="mb-2 text-sm font-medium text-dark dark:text-white">
                System Prompt
              </div>
              <Link
                href={`/system-prompt?session_id=${session.id}`}
                className="inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                View system prompt details
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 md:col-span-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <h3 className="mb-4 text-lg font-semibold text-dark dark:text-white">
          Knowledgebase
        </h3>
        <Link
          href={`/kb?session_id=${session.id}`}
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          View knowledgebase details
        </Link>

        <div className="mt-4 space-y-3">
          {knowledgeEntries.length ? (
            knowledgeEntries.map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-gray-2 p-3 text-sm dark:border-dark-3"
              >
                <div className="font-medium text-dark dark:text-white">
                  {key}
                </div>
                <div className="text-dark-5 dark:text-dark-6">{value}</div>
              </div>
            ))
          ) : (
            <div className="text-sm text-dark-5 dark:text-dark-6">
              No knowledgebase entries for this session.
            </div>
          )}
        </div>
      </div>

      <div className="col-span-12 md:col-span-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <h3 className="mb-4 text-lg font-semibold text-dark dark:text-white">
          Test Queries
        </h3>
        <div className="space-y-3">
          {(session.test_queries || []).map((query, index) => (
            <div
              key={`${query.query}-${index}`}
              className="rounded-md border border-gray-2 p-3 text-sm dark:border-dark-3"
            >
              <div className="font-medium text-dark dark:text-white">
                {query.query}
              </div>
              {query.expected_answer && (
                <div className="text-dark-5 dark:text-dark-6">
                  Expected: {query.expected_answer}
                </div>
              )}
              {query.tags && query.tags.length > 0 && (
                <div className="text-xs text-dark-5 dark:text-dark-6">
                  Tags: {query.tags.join(", ")}
                </div>
              )}
            </div>
          ))}

          {!session.test_queries || session.test_queries.length === 0 ? (
            <div className="text-sm text-dark-5 dark:text-dark-6">
              No test queries defined yet.
            </div>
          ) : null}
        </div>
      </div>

      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-dark dark:text-white">
            Recent Runs
          </h3>
          <span className="text-sm text-dark-5 dark:text-dark-6">
            Total Runs: {session.runs?.length ?? runs.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-2 text-left text-sm dark:divide-dark-3">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-dark-5 dark:text-dark-6">
                <th className="px-4 py-3">Run ID</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-2 dark:divide-dark-3">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 font-medium text-dark dark:text-white">
                    {run.id}
                  </td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">
                    {formatRelative(run.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">
                    {prettyStatus(run.status)}
                  </td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">
                    {typeof run.validation_score !== "undefined"
                      ? `${run.validation_score}%`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-dark-5 dark:text-dark-6">
                    <span className="text-xs">{run.iteration_number ?? "-"}</span>
                  </td>
                </tr>
              ))}

              {runs.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-3 text-sm text-dark-5 dark:text-dark-6"
                    colSpan={5}
                  >
                    No runs yet for this session.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {session.notes ? (
        <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-2 text-lg font-semibold text-dark dark:text-white">
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm text-dark dark:text-white">
            {session.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}