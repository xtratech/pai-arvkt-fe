"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSession,
  fetchSessionDetail,
  type SessionConfig,
  type SessionRecord,
  type SessionRun,
} from "@/services/sessions";
import { useUser } from "@/contexts/user-context";
import { apiDelete, apiGet, apiPut } from "@/services/api-client";
import {
  buildSessionsIndexPath,
  buildUserPromptFilePath,
} from "@/services/storage-paths";

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return atob(normalized);
  }
  const bufferLike = (globalThis as Record<string, unknown>).Buffer as {
    from: (input: string, encoding: string) => { toString: (encoding: string) => string };
  } | undefined;
  if (bufferLike) {
    return bufferLike.from(normalized, 'base64').toString('utf8');
  }
  throw new Error('No base64 decoder available in this environment.');
}
function deriveUserId({
  attributes,
  user,
  tokens,
}: {
  attributes: Record<string, string> | null;
  user: { userId?: string; username?: string } | null;
  tokens: { idToken?: string } | null;
}) {
  if (attributes?.sub) return attributes.sub;
  if (user?.userId) return user.userId;
  if (user?.username) return user.username;

  const idToken = tokens?.idToken;
  if (!idToken) return undefined;

  try {
    const [, payload] = idToken.split(".");
    if (!payload) return undefined;
    const decoded = JSON.parse(decodeBase64Url(payload));
    if (decoded?.sub) {
      return decoded.sub as string;
    }
  } catch {
    // ignore
  }

  return undefined;
}

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

const maskSecretValue = (value: unknown) => {
  if (value === null || typeof value === "undefined") return "-";
  const str = String(value).trim();
  if (!str) return "-";
  if (str.length <= 4) return "***";
  return `${str.slice(0, 3)}***${str.slice(-2)}`;
};

const formatConfigValue = (value: unknown, fallback = "-") => {
  if (value === null || typeof value === "undefined") return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
};

type FileEntry = {
  file_name: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
};

type SessionViewProps = {
  sessionId: string;
};

export function SessionView({ sessionId }: SessionViewProps) {
  const { attributes, user, tokens } = useUser();
  const userId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const [session, setSession] = useState<SessionRecord | undefined>();
  const [runs, setRuns] = useState<SessionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const router = useRouter();
  const rawConfig = (session?.config as SessionConfig | undefined) ?? {};
  const sessionConfig: SessionConfig = {
    ...rawConfig,
    chat_api_key_name: rawConfig.chat_api_key_name || "x-api-key",
    agent_config_key_name: rawConfig.agent_config_key_name || "x-api-key",
    agent_kb_key_name: rawConfig.agent_kb_key_name || "x-api-key",
  };

  const renderFileTable = (
    title: string,
    files: FileEntry[] | undefined,
    activeFileName?: string,
    type?: "user",
    onAdd?: () => void,
    onDelete?: (file: FileEntry) => void,
    onToggle?: (file: FileEntry, isActive: boolean) => void,
  ) => {
    const sorted = (files ?? []).slice().sort((a, b) => {
      const aActive = a.active === true || a.file_name === activeFileName;
      const bActive = b.active === true || b.file_name === activeFileName;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aDate = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
      const bDate = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
      return bDate - aDate;
    });
    const linkSessionId = session?.id ?? sessionId;

    return (
      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-dark dark:text-white">{title}</h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-dark-5 dark:text-dark-6">
              Total: {files?.length ?? 0}
            </span>
            {onAdd ? (
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
                onClick={onAdd}
              >
                Add File
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-2 text-left text-sm dark:divide-dark-3">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-dark-5 dark:text-dark-6">
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Modified</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-2 dark:divide-dark-3">
                {sorted.map((file) => {
                  const isActive = file.active === true || file.file_name === activeFileName;
                  const href =
                    type === "user"
                      ? `/user-prompt?session_id=${linkSessionId}&file_id=${encodeURIComponent(file.file_name)}`
                      : undefined;
                  return (
                    <tr key={file.file_name}>
                    <td className="px-4 py-3 font-medium text-dark dark:text-white">
                      {href ? (
                        <Link
                          href={href}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {file.file_name}
                        </Link>
                      ) : (
                        file.file_name
                      )}
                    </td>
                    <td className="px-4 py-3 text-dark-5 dark:text-dark-6">
                      {formatDateTime(file.created_at) || "-"}
                    </td>
                    <td className="px-4 py-3 text-dark-5 dark:text-dark-6">
                      {formatDateTime(file.updated_at || file.created_at) || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-gray-2 text-dark-5 dark:bg-dark-2 dark:text-dark-6 hover:bg-gray-3 dark:hover:bg-dark-3"
                        }`}
                        onClick={() => onToggle?.(file, isActive)}
                      >
                        {isActive ? "Active (click to deactivate)" : "Inactive (click to activate)"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {onDelete ? (
                        <button
                          type="button"
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-red-600 shadow-sm transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          onClick={() => onDelete(file)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {!files || files.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-3 text-sm text-dark-5 dark:text-dark-6"
                    colSpan={5}
                  >
                    No files available yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      setDeleteError(null);
      try {
        if (!userId) {
          return;
        }

        const { session: fetchedSession, runs: fetchedRuns } =
          await fetchSessionDetail(sessionId, userId);

        if (!active) return;

        setSession(fetchedSession);
        setRuns(fetchedRuns);

        if (!fetchedSession) {
        setError("Agent not found.");
        }
      } catch (err) {
        if (!active) return;
        console.error("[SessionView] Unable to load session detail", err);
        setError("Unable to load this agent right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (userId) {
      load();
    } else {
      setLoading(false);
      setError("Missing user identity. Please sign in again.");
    }

    return () => {
      active = false;
    };
  }, [sessionId, userId]);

  const handleDelete = useCallback(async () => {
    if (!userId) return;

    const targetId = session?.id ?? sessionId;
    if (!targetId) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSession(targetId, userId);
      router.replace("/sessions");
      router.refresh();
    } catch (err) {
      console.error("[SessionView] Unable to delete session", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to delete this agent. Please try again.";
      setDeleteError(message);
    } finally {
      setDeleting(false);
      setConfirmDeleteSession(false);
    }
  }, [session?.id, sessionId, userId, router]);

  const updateSessionIndex = useCallback(
    async (updater: (prev: SessionRecord) => SessionRecord) => {
      if (!userId) throw new Error("Missing user ID");
      const path = buildSessionsIndexPath(userId);
      const sessions = (await apiGet<SessionRecord[]>(path)) ?? [];
      const updatedList = sessions.map((s) => (s.id === sessionId && session ? updater(s) : s));
      await apiPut(path, {
        headers: { "Content-Type": "application/json" },
        body: updatedList as any,
      });
      const updatedSession = updatedList.find((s) => s.id === sessionId);
      setSession(updatedSession);
    },
    [session, sessionId, userId],
  );

  const handleAddUserPromptFile = useCallback(async () => {
      if (!userId || !session) return;
      setActionError(null);
      const nextName = (() => {
        const files = session.user_prompt_files ?? [];
        const defaultBase = "userprompt";
        if (!files.length) return `${defaultBase}-v1.txt`;
        const maxVersion = files.reduce((acc, file) => {
          const match = file.file_name.match(/-v(\d+)\.[^.]+$/i);
          if (match) {
            const num = Number(match[1]);
            return Number.isFinite(num) ? Math.max(acc, num) : acc;
          }
          return acc;
        }, 0);
        return `${defaultBase}-v${maxVersion + 1}.txt`;
      })();
      const trimmed = nextName.trim();
      setActionLoading(true);
      try {
        const now = new Date().toISOString();
        const filePath = buildUserPromptFilePath(userId, sessionId, trimmed);
        await apiPut(filePath, {
          headers: { "Content-Type": "text/plain" },
          body: "",
        });
        await updateSessionIndex((prev) => {
          const files = prev.user_prompt_files ?? [];
          const nextFiles = [
            ...files.filter((f) => f.file_name !== trimmed),
            { file_name: trimmed, created_at: now, updated_at: now, active: false },
          ].sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            const aDate = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const bDate = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return bDate - aDate;
          });
          return { ...prev, user_prompt_files: nextFiles };
        });
      } catch (err) {
        console.error("[SessionView] Unable to add file", err);
        setActionError("Unable to add file right now.");
      } finally {
        setActionLoading(false);
      }
    },
    [session, sessionId, updateSessionIndex, userId],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!userId || !confirmDelete || !session) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const path = buildUserPromptFilePath(userId, sessionId, confirmDelete.file_name);
      await apiDelete(path);
      await updateSessionIndex((prev) => {
        const files = (prev.user_prompt_files ?? []).filter((f) => f.file_name !== confirmDelete.file_name);
        const activeName =
          prev.user_prompt_file_name === confirmDelete.file_name
            ? files.find((f) => f.active)?.file_name ?? files[0]?.file_name
            : prev.user_prompt_file_name;
        return { ...prev, user_prompt_files: files, user_prompt_file_name: activeName };
      });
    } catch (err) {
      console.error("[SessionView] Unable to delete file", err);
      setActionError("Unable to delete file right now.");
    } finally {
      setActionLoading(false);
      setConfirmDelete(null);
    }
  }, [confirmDelete, session, sessionId, updateSessionIndex, userId]);

  const handleToggleActive = useCallback(
    async (file: FileEntry, isActive: boolean) => {
      if (!userId || !session) return;
      setActionLoading(true);
      setActionError(null);
      try {
        await updateSessionIndex((prev) => {
          const files = prev.user_prompt_files ?? [];
          const updated = files
            .map((f) => ({
              ...f,
              active: isActive ? false : f.file_name === file.file_name,
              updated_at: f.file_name === file.file_name ? new Date().toISOString() : f.updated_at,
            }))
            .sort((a, b) => {
              if (a.active !== b.active) return a.active ? -1 : 1;
              const aDate = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
              const bDate = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
              return bDate - aDate;
            });
          return {
            ...prev,
            user_prompt_files: updated,
            user_prompt_file_name: isActive ? undefined : file.file_name,
          };
        });
      } catch (err) {
        console.error("[SessionView] Unable to toggle active file", err);
        setActionError("Unable to update active file right now.");
      } finally {
        setActionLoading(false);
      }
    },
    [session, updateSessionIndex, userId],
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
      {deleteError && (
        <div className="col-span-12 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {deleteError}
        </div>
      )}
      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-body-2xlg font-bold text-dark dark:text-white">
            {session.name}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
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
            <div className="flex items-center gap-2">
              <Link
                href={`/session/edit?id=${session.id}`}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
              >
                Edit Agent
            </Link>
            <Link
              href={`/chat-editor?session_id=${encodeURIComponent(session.id)}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
            >
              Chat Editor
            </Link>
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDeleteSession(true);
                }}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Agent"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12">
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
                {formatConfigValue(sessionConfig.mode)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Max Iterations</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.max_iterations)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Chat API Endpoint</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.chat_api_endpoint)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Chat API Key Name</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.chat_api_key_name, "x-api-key")}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Chat API Key</dt>
              <dd className="break-all text-dark dark:text-white">
                {maskSecretValue(sessionConfig.chat_api_key)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Train Agent Command</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.train_chatbot_command)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent Config Endpoint</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.agent_config_endpoint)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent Config Key Name</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.agent_config_key_name, "x-api-key")}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent Config Key</dt>
              <dd className="break-all text-dark dark:text-white">
                {maskSecretValue(sessionConfig.agent_config_key)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent KB Endpoint</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.agent_kb_endpoint)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent KB Key Name</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.agent_kb_key_name, "x-api-key")}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Agent KB Key</dt>
              <dd className="break-all text-dark dark:text-white">
                {maskSecretValue(sessionConfig.agent_kb_key)}
              </dd>
            </dl>
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-dark dark:text-white">LLM System Settings</h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Edit the live system prompt and model parameters for this agent.
            </p>
          </div>
          <Link
            href={`/system-prompt?session_id=${session.id ?? sessionId}`}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Edit LLM System Settings
          </Link>
        </div>
      </div>

      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Articles</h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Browse, create, and edit the source articles used for this agent.
            </p>
          </div>
          <Link
            href={`/kb-articles?session_id=${session.id ?? sessionId}`}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Open Knowledgebase Articles
          </Link>
        </div>
      </div>

      {renderFileTable(
        "User Prompt Files",
        session.user_prompt_files as FileEntry[] | undefined,
        session.user_prompt_file_name,
        "user",
        handleAddUserPromptFile,
        (file) => setConfirmDelete(file),
        handleToggleActive,
      )}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark">
            <h4 className="text-lg font-semibold text-dark dark:text-white">Confirm Delete</h4>
            <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-dark dark:text-white">
                {confirmDelete.file_name}
              </span>{" "}
              from User Prompt files?
            </p>
            {actionError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {actionError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
                onClick={() => setConfirmDelete(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmDelete}
                disabled={actionLoading}
              >
                {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark">
            <h4 className="text-lg font-semibold text-dark dark:text-white">Delete Agent</h4>
            <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
              Are you sure you want to delete this agent? This action cannot be undone.
            </p>
            {deleteError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {deleteError}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
                onClick={() => setConfirmDeleteSession(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Agent"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                    No runs yet for this agent.
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
