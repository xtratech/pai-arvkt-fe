"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSession,
  fetchSessionDetail,
  type SessionConfig,
  type SessionRecord,
} from "@/services/sessions";
import { useUser } from "@/contexts/user-context";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const router = useRouter();
  const rawConfig = (session?.config as SessionConfig | undefined) ?? {};
  const sessionConfig: SessionConfig = {
    ...rawConfig,
    chat_api_key_name: rawConfig.chat_api_key_name || "x-api-key",
    agent_config_key_name: rawConfig.agent_config_key_name || "x-api-key",
    agent_kb_key_name: rawConfig.agent_kb_key_name || "x-api-key",
    web_widget_api_key_name: rawConfig.web_widget_api_key_name || "x-api-key",
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

        const { session: fetchedSession } =
          await fetchSessionDetail(sessionId, userId);

        if (!active) return;

        setSession(fetchedSession);

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
              <dt className="text-dark-5 dark:text-dark-6">Type</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.type)}
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
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Title</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_title)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Position</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_position)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Primary Color</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_primary_color)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Secondary Color</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_secondary_color)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Require Consent</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_require_consent)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Capture Fields</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_capture_fields)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Escalation Enabled</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_escalation_enabled)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Debug</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_debug)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget API Endpoint</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_api_endpoint)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget API Key Name</dt>
              <dd className="text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_api_key_name, "x-api-key")}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget API Key</dt>
              <dd className="break-all text-dark dark:text-white">
                {maskSecretValue(sessionConfig.web_widget_api_key)}
              </dd>
              <dt className="text-dark-5 dark:text-dark-6">Web Widget Loader URL</dt>
              <dd className="break-all text-dark dark:text-white">
                {formatConfigValue(sessionConfig.web_widget_loader_url)}
              </dd>
            </dl>
          </div>
        </div>
      </div>


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

    </div>
  );
}
