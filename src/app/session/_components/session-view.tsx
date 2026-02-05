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
import { WidgetLoader } from "./widget-loader";

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

const normalizeWidgetValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeWidgetCsv = (value: unknown) => {
  const normalized = normalizeWidgetValue(value);
  if (!normalized) return "";
  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const WEB_WIDGET_TYPES = new Set(["WebWidgetChatbot", "WebChatbot"]);

type SessionViewProps = {
  sessionId: string;
};

type SessionTab = "basics" | "integrations" | "web_widget" | "web_widget_embed";

const SESSION_TABS: Array<{ id: SessionTab; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "integrations", label: "Integrations" },
  { id: "web_widget", label: "Web Widget" },
  { id: "web_widget_embed", label: "Web Widget Embed" },
];

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
  const [activeTab, setActiveTab] = useState<SessionTab>("basics");
  const router = useRouter();
  const rawConfig = (session?.config as SessionConfig | undefined) ?? {};
  const sessionConfig: SessionConfig = {
    ...rawConfig,
    chat_api_key_name: rawConfig.chat_api_key_name || "x-api-key",
    agent_config_key_name: rawConfig.agent_config_key_name || "x-api-key",
    agent_kb_key_name: rawConfig.agent_kb_key_name || "x-api-key",
    web_widget_api_key_name: rawConfig.web_widget_api_key_name || "x-api-key",
  };
  const sessionType = typeof sessionConfig.type === "string" ? sessionConfig.type : "";
  const isWebWidgetType = WEB_WIDGET_TYPES.has(sessionType);
  const hasChatApi =
    Boolean(
      sessionConfig.chat_api_endpoint ||
        sessionConfig.chat_api_key ||
        sessionConfig.train_chatbot_command ||
        sessionConfig.chat_api_request_schema ||
        sessionConfig.chat_api_response_schema,
    ) || sessionConfig.chat_api_key_name !== "x-api-key";
  const hasAgentConfig =
    Boolean(sessionConfig.agent_config_endpoint || sessionConfig.agent_config_key) ||
    sessionConfig.agent_config_key_name !== "x-api-key";
  const hasAgentKb =
    Boolean(sessionConfig.agent_kb_endpoint || sessionConfig.agent_kb_key) ||
    sessionConfig.agent_kb_key_name !== "x-api-key";
  const hasWebWidgetSettings =
    Boolean(
      sessionConfig.web_widget_title ||
        sessionConfig.web_widget_position ||
        sessionConfig.web_widget_primary_color ||
        sessionConfig.web_widget_secondary_color ||
      sessionConfig.web_widget_accent_color ||
      sessionConfig.web_widget_primary_font ||
      sessionConfig.web_widget_secondary_font ||
      sessionConfig.web_widget_border_color ||
      sessionConfig.web_widget_border_radius ||
      sessionConfig.web_widget_capture_fields ||
        sessionConfig.web_widget_api_endpoint ||
        sessionConfig.web_widget_api_key ||
        sessionConfig.web_widget_loader_url,
    ) ||
    typeof sessionConfig.web_widget_require_consent === "boolean" ||
    typeof sessionConfig.web_widget_escalation_enabled === "boolean" ||
    typeof sessionConfig.web_widget_debug === "boolean" ||
    sessionConfig.web_widget_api_key_name !== "x-api-key";
  const hasIntegrations = hasChatApi || hasAgentConfig || hasAgentKb;
  const widgetLoaderUrl =
    typeof sessionConfig.web_widget_loader_url === "string"
      ? sessionConfig.web_widget_loader_url.trim()
      : "";
  const shouldLoadWidget = isWebWidgetType && hasWebWidgetSettings && Boolean(widgetLoaderUrl);
  const widgetEmbedCode = useMemo(() => {
    if (!widgetLoaderUrl) return "";

    const attributes: Array<[string, string]> = [];
    const title = normalizeWidgetValue(sessionConfig.web_widget_title);
    if (title) attributes.push(["data-title", title]);

    const position = normalizeWidgetValue(sessionConfig.web_widget_position);
    if (position === "left" || position === "right") {
      attributes.push(["data-position", position]);
    }

    const primaryColor = normalizeWidgetValue(sessionConfig.web_widget_primary_color);
    if (primaryColor) attributes.push(["data-primary-color", primaryColor]);

    const secondaryColor = normalizeWidgetValue(sessionConfig.web_widget_secondary_color);
    if (secondaryColor) attributes.push(["data-secondary-color", secondaryColor]);

    const accentColor = normalizeWidgetValue(sessionConfig.web_widget_accent_color);
    if (accentColor) attributes.push(["data-accent-color", accentColor]);

    const primaryFont = normalizeWidgetValue(sessionConfig.web_widget_primary_font);
    if (primaryFont) attributes.push(["data-primary-font", primaryFont]);

    const secondaryFont = normalizeWidgetValue(sessionConfig.web_widget_secondary_font);
    if (secondaryFont) attributes.push(["data-secondary-font", secondaryFont]);

    const borderColor = normalizeWidgetValue(sessionConfig.web_widget_border_color);
    if (borderColor) attributes.push(["data-border-color", borderColor]);

    const borderRadius = normalizeWidgetValue(sessionConfig.web_widget_border_radius);
    if (borderRadius) attributes.push(["data-border-radius", borderRadius]);

    const captureFields = normalizeWidgetCsv(sessionConfig.web_widget_capture_fields);
    if (captureFields) attributes.push(["data-capture-fields", captureFields]);

    if (typeof sessionConfig.web_widget_require_consent === "boolean") {
      attributes.push([
        "data-require-consent",
        sessionConfig.web_widget_require_consent ? "true" : "false",
      ]);
    }

    if (typeof sessionConfig.web_widget_escalation_enabled === "boolean") {
      attributes.push([
        "data-escalation-enabled",
        sessionConfig.web_widget_escalation_enabled ? "true" : "false",
      ]);
    }

    if (typeof sessionConfig.web_widget_debug === "boolean") {
      attributes.push(["data-debug", sessionConfig.web_widget_debug ? "true" : "false"]);
    }

    const lines = [`<script src='${escapeHtmlAttribute(widgetLoaderUrl)}'`];
    lines.push("  async");
    for (const [name, value] of attributes) {
      lines.push(`  ${name}='${escapeHtmlAttribute(value)}'`);
    }
    lines.push("></script>");
    return lines.join("\n");
  }, [
    sessionConfig.web_widget_accent_color,
    sessionConfig.web_widget_border_color,
    sessionConfig.web_widget_border_radius,
    sessionConfig.web_widget_capture_fields,
    sessionConfig.web_widget_debug,
    sessionConfig.web_widget_escalation_enabled,
    sessionConfig.web_widget_position,
    sessionConfig.web_widget_primary_color,
    sessionConfig.web_widget_primary_font,
    sessionConfig.web_widget_require_consent,
    sessionConfig.web_widget_secondary_color,
    sessionConfig.web_widget_secondary_font,
    sessionConfig.web_widget_title,
    widgetLoaderUrl,
  ]);

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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-body-2xlg font-bold text-primary dark:text-white">
              {session.name}
            </h2>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              <span className="font-mono">{session.id}</span>
              {session.updated_at
                ? ` - Updated ${formatDateTime(session.updated_at)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Link
              href={`/web-widget-editor?session_id=${encodeURIComponent(session.id)}`}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
            >
              Web Widget Editor
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

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {session.status && (
            <span className="rounded-full bg-gray-2 px-3 py-1 font-semibold text-dark dark:bg-dark-2 dark:text-dark-6">
              Status: {prettyStatus(session.status)}
            </span>
          )}
          {sessionType && (
            <span className="rounded-full bg-gray-2 px-3 py-1 font-semibold text-dark dark:bg-dark-2 dark:text-dark-6">
              Type: {sessionType}
            </span>
          )}
          {typeof session.overall_score !== "undefined" && (
            <span className="rounded-full bg-gray-2 px-3 py-1 font-semibold text-dark dark:bg-dark-2 dark:text-dark-6">
              Score: {session.overall_score}%
            </span>
          )}
        </div>
      </div>

      <div className="col-span-12">
        <div
          className="inline-flex w-full overflow-hidden rounded-lg border border-stroke bg-white shadow-sm dark:border-dark-3 dark:bg-dark-2"
          role="tablist"
          aria-label="Agent detail tabs"
        >
          {SESSION_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`session-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`session-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:flex-none ${
                  selected
                    ? "bg-primary text-white"
                    : "text-dark hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "basics" ? (
        <div
          className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card"
          role="tabpanel"
          id="session-panel-basics"
          aria-labelledby="session-tab-basics"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-primary dark:text-white">Basics</h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Key facts and ownership details for this agent.
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <dt className="text-dark-5 dark:text-dark-6">Agent ID</dt>
            <dd className="font-mono text-dark dark:text-white">{session.id}</dd>
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
          </dl>
        </div>
      ) : null}

      {activeTab === "integrations" ? (
        <div
          className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card"
          role="tabpanel"
          id="session-panel-integrations"
          aria-labelledby="session-tab-integrations"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-primary dark:text-white">Integrations</h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Connection details for chat delivery and knowledge sources.
            </p>
          </div>
          {!hasIntegrations ? (
            <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
              No integrations configured yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {hasChatApi ? (
                <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                  <h4 className="text-sm font-semibold text-primary dark:text-white">Chat API</h4>
                  <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <dt className="text-dark-5 dark:text-dark-6">Endpoint</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.chat_api_endpoint)}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key Name</dt>
                    <dd className="text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.chat_api_key_name, "x-api-key")}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {maskSecretValue(sessionConfig.chat_api_key)}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Train Command</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.train_chatbot_command)}
                    </dd>
                  </dl>
                </div>
              ) : null}

              {hasAgentConfig ? (
                <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                  <h4 className="text-sm font-semibold text-primary dark:text-white">Agent Config</h4>
                  <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <dt className="text-dark-5 dark:text-dark-6">Endpoint</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.agent_config_endpoint)}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key Name</dt>
                    <dd className="text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.agent_config_key_name, "x-api-key")}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {maskSecretValue(sessionConfig.agent_config_key)}
                    </dd>
                  </dl>
                </div>
              ) : null}

              {hasAgentKb ? (
                <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                  <h4 className="text-sm font-semibold text-primary dark:text-white">Agent KB</h4>
                  <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <dt className="text-dark-5 dark:text-dark-6">Endpoint</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.agent_kb_endpoint)}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key Name</dt>
                    <dd className="text-dark dark:text-white">
                      {formatConfigValue(sessionConfig.agent_kb_key_name, "x-api-key")}
                    </dd>
                    <dt className="text-dark-5 dark:text-dark-6">Key</dt>
                    <dd className="break-all text-dark dark:text-white">
                      {maskSecretValue(sessionConfig.agent_kb_key)}
                    </dd>
                  </dl>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "web_widget" ? (
        <div
          className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card"
          role="tabpanel"
          id="session-panel-web_widget"
          aria-labelledby="session-tab-web_widget"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-primary dark:text-white">Web Widget</h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Widget appearance, behavior, and integration settings.
            </p>
          </div>
          {!isWebWidgetType ? (
            <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
              Web widget settings apply only to WebWidgetChatbot or WebChatbot agents.
            </p>
          ) : !hasWebWidgetSettings ? (
            <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
              No web widget settings configured yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                <h4 className="text-sm font-semibold text-primary dark:text-white">Experience</h4>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <dt className="text-dark-5 dark:text-dark-6">Title</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_title)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Position</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_position)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Primary Color</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_primary_color)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Secondary Color</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_secondary_color)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Accent Color</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_accent_color)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Primary Font</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_primary_font)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Secondary Font</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_secondary_font)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Border Color</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_border_color)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Border Radius</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_border_radius)}
                  </dd>
                </dl>
              </div>

              <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                <h4 className="text-sm font-semibold text-primary dark:text-white">Behavior</h4>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <dt className="text-dark-5 dark:text-dark-6">Require Consent</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_require_consent)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Capture Fields</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_capture_fields)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Escalation Enabled</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_escalation_enabled)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Debug</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_debug)}
                  </dd>
                </dl>
              </div>

              <div className="rounded-md border border-gray-2 p-3 dark:border-dark-3">
                <h4 className="text-sm font-semibold text-primary dark:text-white">Integration</h4>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <dt className="text-dark-5 dark:text-dark-6">API Endpoint</dt>
                  <dd className="break-all text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_api_endpoint)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">API Key Name</dt>
                  <dd className="text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_api_key_name, "x-api-key")}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">API Key</dt>
                  <dd className="break-all text-dark dark:text-white">
                    {maskSecretValue(sessionConfig.web_widget_api_key)}
                  </dd>
                  <dt className="text-dark-5 dark:text-dark-6">Loader URL</dt>
                  <dd className="break-all text-dark dark:text-white">
                    {formatConfigValue(sessionConfig.web_widget_loader_url)}
                  </dd>
                </dl>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "web_widget_embed" ? (
        <div
          className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card"
          role="tabpanel"
          id="session-panel-web_widget_embed"
          aria-labelledby="session-tab-web_widget_embed"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-primary dark:text-white">Web Widget Embed</h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Copy and paste this script into your site or GTM tag.
            </p>
          </div>
          {!isWebWidgetType ? (
            <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
              Web widget embeds are only available for WebWidgetChatbot or WebChatbot agents.
            </p>
          ) : !widgetEmbedCode ? (
            <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
              Add a Widget Loader URL to generate the embed script.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              <pre className="custom-scrollbar max-h-64 overflow-auto rounded-xl border border-stroke bg-white p-4 font-mono text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6"><code>{widgetEmbedCode}</code></pre>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Unset fields are omitted so the widget uses its defaults.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {shouldLoadWidget ? (
        <WidgetLoader
          loaderUrl={widgetLoaderUrl}
          title={sessionConfig.web_widget_title}
          position={sessionConfig.web_widget_position}
          primaryColor={sessionConfig.web_widget_primary_color}
          secondaryColor={sessionConfig.web_widget_secondary_color}
          accentColor={sessionConfig.web_widget_accent_color}
          primaryFont={sessionConfig.web_widget_primary_font}
          secondaryFont={sessionConfig.web_widget_secondary_font}
          borderColor={sessionConfig.web_widget_border_color}
          borderRadius={sessionConfig.web_widget_border_radius}
          requireConsent={sessionConfig.web_widget_require_consent}
          captureFields={sessionConfig.web_widget_capture_fields}
          escalationEnabled={sessionConfig.web_widget_escalation_enabled}
          debug={sessionConfig.web_widget_debug}
        />
      ) : null}

      {confirmDeleteSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark">
            <h4 className="text-lg font-semibold text-primary dark:text-white">Delete Agent</h4>
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
