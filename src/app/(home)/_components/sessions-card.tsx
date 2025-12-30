"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchSessions, type SessionRecord } from "@/services/sessions";
import { useUser } from "@/contexts/user-context";

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") {
    return atob(normalized);
  }
  const bufferLike = (globalThis as Record<string, unknown>).Buffer as
    | { from: (input: string, encoding: string) => { toString: (encoding: string) => string } }
    | undefined;
  if (bufferLike) {
    return bufferLike.from(normalized, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available in this environment.");
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

function prettyStatus(status?: string) {
  return (status || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

function normalizeStatus(status?: string) {
  return String(status ?? "").trim().toLowerCase();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStatusPill(status?: string) {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return {
      label: "Unknown",
      className: "bg-gray-2 text-dark dark:bg-dark-3 dark:text-dark-6",
    };
  }

  if (normalized === "active") {
    return {
      label: "Active",
      className: "bg-green-light-7 text-green-dark",
    };
  }

  if (normalized === "paused") {
    return {
      label: "Paused",
      className: "bg-orange-light/20 text-orange-light",
    };
  }

  return {
    label: prettyStatus(status),
    className: "bg-gray-2 text-dark dark:bg-dark-3 dark:text-dark-6",
  };
}

export function SessionsCard({ className = "" }: { className?: string }) {
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

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [disabledTooltipSessionId, setDisabledTooltipSessionId] = useState<string | null>(null);

  const activeCount = useMemo(
    () => sessions.filter((session) => normalizeStatus(session.status) === "active").length,
    [sessions],
  );
  const pausedCount = useMemo(
    () => sessions.filter((session) => normalizeStatus(session.status) === "paused").length,
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesQuery = query
        ? session.name.toLowerCase().includes(query) || session.id.toLowerCase().includes(query)
        : true;

      if (!matchesQuery) return false;
      if (statusFilter === "all") return true;
      return normalizeStatus(session.status) === statusFilter;
    });
  }, [search, sessions, statusFilter]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!userId) {
          return;
        }
        const data = await fetchSessions(userId);
        if (!active) return;
        const sorted = [...data].sort((a, b) => {
          const ta = new Date(a.updated_at || a.id).getTime();
          const tb = new Date(b.updated_at || b.id).getTime();
          return tb - ta;
        });
        setSessions(sorted);
      } catch (err) {
        if (!active) return;
        console.error("[SessionsCard] Unable to load sessions", err);
        setError("Unable to load agents right now.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (userId) {
      load();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div
      className={`rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card ${className}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="px-1.5 text-body-2xlg font-bold text-dark dark:text-white">Agents</h2>
              {!loading ? (
                <span className="rounded-full bg-gray-2 px-2 py-0.5 text-xs font-semibold text-dark dark:bg-dark-3 dark:text-dark-6">
                  {filteredSessions.length}
                </span>
              ) : null}
            </div>
            <p className="px-1.5 text-sm text-dark-5 dark:text-dark-6">
              Open chat editor, manage prompts, and maintain knowledge base articles.
            </p>
          </div>
          <Link href="/sessions" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>

        {!loading && sessions.length ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents by name or ID"
                className="w-full rounded-lg border border-stroke bg-white px-3 py-2 pr-10 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              />
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-dark-5 transition hover:bg-gray-2 dark:text-dark-6 dark:hover:bg-dark-3"
                  title="Clear search"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="inline-flex w-full overflow-hidden rounded-lg border border-stroke bg-white shadow-sm dark:border-dark-3 dark:bg-dark-2 sm:w-auto">
              {[
                { value: "all" as const, label: `All (${sessions.length})` },
                { value: "active" as const, label: `Active (${activeCount})` },
                { value: "paused" as const, label: `Paused (${pausedCount})` },
              ].map((option) => {
                const selected = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
                    className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:flex-none ${
                      selected
                        ? "bg-primary text-white"
                        : "text-dark hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
          </div>
        ) : !userId ? (
          <div className="text-sm text-red-600 dark:text-red-400">
            Unable to determine your user identity. Please sign out and sign in again.
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : sessions.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredSessions.map((session) => {
              const status = getStatusPill(session.status);
              const scoreValue = typeof session.overall_score === "number" ? session.overall_score : null;
              const safeScore = scoreValue === null ? null : clampNumber(scoreValue, 0, 100);

              const cfg = session.config ?? {};

              const missingChatProps: string[] = [];
              if (!cfg.chat_api_endpoint || String(cfg.chat_api_endpoint).trim() === "") {
                missingChatProps.push("chat_api_endpoint");
              }
              if (!cfg.chat_api_key || String(cfg.chat_api_key).trim() === "") {
                missingChatProps.push("chat_api_key");
              }
              if (!cfg.chat_api_key_name || String(cfg.chat_api_key_name).trim() === "") {
                missingChatProps.push("chat_api_key_name");
              }
              if (!cfg.chat_api_request_schema || String(cfg.chat_api_request_schema).trim?.() === "") {
                missingChatProps.push("chat_api_request_schema");
              }
              if (!cfg.chat_api_response_schema || String(cfg.chat_api_response_schema).trim?.() === "") {
                missingChatProps.push("chat_api_response_schema");
              }

              const missingSystemPromptProps: string[] = [];
              if (!cfg.agent_config_endpoint || String(cfg.agent_config_endpoint).trim() === "") {
                missingSystemPromptProps.push("agent_config_endpoint");
              }
              if (!cfg.agent_config_key || String(cfg.agent_config_key).trim() === "") {
                missingSystemPromptProps.push("agent_config_key");
              }
              if (!cfg.agent_config_key_name || String(cfg.agent_config_key_name).trim() === "") {
                missingSystemPromptProps.push("agent_config_key_name");
              }

              const missingKbProps: string[] = [];
              if (!cfg.agent_kb_endpoint || String(cfg.agent_kb_endpoint).trim() === "") {
                missingKbProps.push("agent_kb_endpoint");
              }
              if (!cfg.agent_kb_key || String(cfg.agent_kb_key).trim() === "") {
                missingKbProps.push("agent_kb_key");
              }
              if (!cfg.agent_kb_key_name || String(cfg.agent_kb_key_name).trim() === "") {
                missingKbProps.push("agent_kb_key_name");
              }

              const missingAreas: string[] = [];
              if (missingChatProps.length) missingAreas.push("Chat");
              if (missingSystemPromptProps.length) missingAreas.push("System prompt");
              if (missingKbProps.length) missingAreas.push("KB");

              const readiness =
                missingAreas.length === 0
                  ? {
                      label: "Ready",
                      title: "All key settings are configured.",
                      className: "bg-green-light-7 text-green-dark",
                    }
                  : {
                      label: "Setup required",
                      title: `Missing: ${missingAreas.join(", ")}`,
                      className: "bg-orange-light/20 text-orange-light",
                    };

              const renderActionLink = (options: {
                label: string;
                href: string;
                disabled: boolean;
                missingProps: string[];
                className: string;
              }) =>
                options.disabled ? (
                  <span
                    className={`${options.className} cursor-help opacity-60`}
                    aria-disabled="true"
                    onMouseEnter={() => setDisabledTooltipSessionId(session.id)}
                    onMouseLeave={() =>
                      setDisabledTooltipSessionId((prev) => (prev === session.id ? null : prev))
                    }
                  >
                    {options.label}
                  </span>
                ) : (
                  <Link href={options.href} className={options.className}>
                    {options.label}
                  </Link>
                );

              const botActionClassName =
                "inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm transition hover:bg-primary/15 dark:border-primary/30 dark:bg-primary/15 dark:hover:bg-primary/20";

              const tooltipSections = [
                { label: "Chat Editor", items: missingChatProps },
                { label: "System Prompt", items: missingSystemPromptProps },
                { label: "KB Articles", items: missingKbProps },
              ].filter((section) => section.items.length > 0);

              const showMergedTooltip =
                disabledTooltipSessionId === session.id && tooltipSections.length > 0;

              return (
                <div
                  key={session.id}
                  className="group relative overflow-visible rounded-xl border border-stroke bg-white p-4 transition hover:border-primary/40 hover:shadow-sm dark:border-dark-3 dark:bg-dark-2"
                >
                  <Link
                    href={`/session?id=${session.id}`}
                    className="absolute inset-0"
                    aria-label={`View agent ${session.name}`}
                  />
                  <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-dark dark:text-white">
                              {session.name}
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                            >
                              {status.label}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${readiness.className}`}
                            >
                              {readiness.label}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dark-5 dark:text-dark-6">
                            <span className="font-mono">{session.id}</span>
                            {session.updated_at ? <span>Updated {formatRelative(session.updated_at)}</span> : null}
                          </div>
                          {safeScore !== null ? (
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-dark-5 dark:text-dark-6">
                              <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-2 dark:bg-dark-3">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${safeScore}%` }}
                                />
                              </div>
                              <span className="font-semibold text-dark dark:text-white">
                                Score {safeScore}%
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="relative flex flex-wrap items-center justify-end gap-2 sm:max-w-[520px]">
                      {renderActionLink({
                        label: "Chat Editor",
                        href: `/chat-editor?session_id=${encodeURIComponent(session.id)}`,
                        disabled: missingChatProps.length > 0,
                        missingProps: missingChatProps,
                        className: botActionClassName,
                      })}
                      {renderActionLink({
                        label: "System Prompt",
                        href: `/system-prompt?session_id=${encodeURIComponent(session.id)}`,
                        disabled: missingSystemPromptProps.length > 0,
                        missingProps: missingSystemPromptProps,
                        className: botActionClassName,
                      })}
                      {renderActionLink({
                        label: "KB Articles",
                        href: `/kb-articles?session_id=${encodeURIComponent(session.id)}`,
                        disabled: missingKbProps.length > 0,
                        missingProps: missingKbProps,
                        className: botActionClassName,
                      })}

                      {showMergedTooltip ? (
                        <div className="pointer-events-none absolute right-0 bottom-full z-50 mb-2 w-80 rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark shadow-lg dark:border-dark-3 dark:bg-dark-2 dark:text-white">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-light">
                            Setup required
                          </div>
                          <div className="mt-1 text-xs font-semibold text-dark dark:text-white">
                            Missing settings:
                          </div>
                          <div className="mt-2 space-y-2">
                            {tooltipSections.map((section) => (
                              <div key={section.label}>
                                <div className="text-[11px] font-semibold text-dark dark:text-white">
                                  {section.label}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {section.items.map((item) => (
                                    <span
                                      key={item}
                                      className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] font-semibold text-dark dark:bg-dark-3 dark:text-dark-6"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <details className="relative z-40 [&>summary::-webkit-details-marker]:hidden">
                        <summary className={`${botActionClassName} cursor-pointer`}>
                          More
                        </summary>
                        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-stroke bg-white shadow-lg dark:border-dark-3 dark:bg-dark-2">
                          <Link
                            href={`/session?id=${session.id}`}
                            className="block px-3 py-2 text-sm font-semibold text-dark transition hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                          >
                            View details
                          </Link>
                          <Link
                            href={`/session/edit?id=${session.id}`}
                            className="block px-3 py-2 text-sm font-semibold text-dark transition hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                          >
                            Edit agent
                          </Link>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filteredSessions.length ? (
              <div className="rounded-xl border border-stroke bg-white p-5 text-sm text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6 lg:col-span-2">
                <div className="font-semibold text-dark dark:text-white">No agents match your filters.</div>
                <div className="mt-1">Try clearing your search or switching the status filter.</div>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                  className="mt-3 inline-flex items-center rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-dark-5 dark:text-dark-6">No agents available yet.</div>
        )}
      </div>
    </div>
  );
}
