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
        setError("Unable to load sessions right now.");
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
      className={`col-span-6 rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card ${className}`}
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="px-1.5 text-body-2xlg font-bold text-dark dark:text-white">Bots</h2>
        <Link href="/sessions" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

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
        <div className="space-y-3">
          {sessions.map((session) => (
            // Each session row is clickable to detail; quick actions on the right
            <div
              key={session.id}
              className="relative overflow-visible rounded-xl border border-stroke bg-white px-4 py-3 transition hover:shadow-sm dark:border-dark-3 dark:bg-dark-2"
            >
              <Link
                href={`/session?id=${session.id}`}
                className="absolute inset-0"
                aria-label={`View session ${session.name}`}
              />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-dark dark:text-white">
                    {session.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-dark-5 dark:text-dark-6">
                    {session.status && (
                      <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] text-dark dark:bg-dark-3 dark:text-dark-6">
                        {prettyStatus(session.status)}
                      </span>
                    )}
                    {typeof session.overall_score !== "undefined" && (
                      <span>Score: {session.overall_score}%</span>
                    )}
                    {session.updated_at && <span>Updated {formatRelative(session.updated_at)}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const cfg = session.config ?? {};
                    const missingProps: string[] = [];
                    if (!cfg.chat_api_endpoint || String(cfg.chat_api_endpoint).trim() === "") {
                      missingProps.push("chat_api_endpoint");
                    }
                    if (!cfg.chat_api_key || String(cfg.chat_api_key).trim() === "") {
                      missingProps.push("chat_api_key");
                    }
                    if (!cfg.chat_api_key_name || String(cfg.chat_api_key_name).trim() === "") {
                      missingProps.push("chat_api_key_name");
                    }
                    if (!cfg.chat_api_request_schema || String(cfg.chat_api_request_schema).trim?.() === "") {
                      missingProps.push("chat_api_request_schema");
                    }
                    if (!cfg.chat_api_response_schema || String(cfg.chat_api_response_schema).trim?.() === "") {
                      missingProps.push("chat_api_response_schema");
                    }
                    const chatDisabled = missingProps.length > 0;
                    const renderChatLink = (label: string, href: string) =>
                      chatDisabled ? (
                        <div className="group relative z-40">
                          <span
                            className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white opacity-60 shadow-sm"
                            aria-disabled="true"
                          >
                            {label}
                          </span>
                          <div className="pointer-events-none absolute -top-16 right-0 z-50 hidden w-60 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-lg group-hover:block dark:bg-black">
                            <div className="text-[11px] uppercase tracking-wide text-primary/80">
                              Missing settings
                            </div>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 font-normal text-gray-100 dark:text-gray-2">
                              {missingProps.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={href}
                          className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
                          title={`Open ${label.toLowerCase()} for this session`}
                        >
                          {label}
                        </Link>
                      );

                    return (
                      <>
                        {renderChatLink(
                          "Chat Editor",
                          `/chat-editor?session_id=${encodeURIComponent(session.id)}`,
                        )}
                      </>
                    );
                  })()}
                  <Link
                    href={`/session?id=${session.id}`}
                    className="inline-flex items-center rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
                  >
                    View
                  </Link>
                  <Link
                    href={`/session/edit?id=${session.id}`}
                    className="inline-flex items-center rounded-lg border border-stroke px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-dark-5 dark:text-dark-6">No sessions available yet.</div>
      )}
    </div>
  );
}
