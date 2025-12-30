"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/contexts/user-context";
import { fetchSessions, type SessionRecord } from "@/services/sessions";
import { KbArticleContent } from "./kb-article-content";

type Props = {
  sessionId: string;
  articleId: string;
};

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

function resolveKbConnection(sessionConfig: Record<string, unknown> | null | undefined) {
  const cfg = (sessionConfig ?? {}) as any;
  const endpoint = String(
    cfg.agent_kb_endpoint ??
      cfg.agent_kb_url ??
      cfg.agent_kb_endpoint_url ??
      cfg.agent_kb_endpoint_base ??
      "",
  ).trim();
  const keyName = String(cfg.agent_kb_key_name ?? cfg.agent_kb_api_key_name ?? "x-api-key").trim();
  const keyValue = String(cfg.agent_kb_key ?? cfg.agent_kb_api_key ?? cfg.agent_kb_token ?? "").trim();

  return {
    endpoint,
    keyName: keyName || "x-api-key",
    keyValue,
  };
}

export function KbArticleEditor({ sessionId, articleId }: Props) {
  const { tokens, attributes, user, isLoading: userLoading } = useUser();
  const resolvedSessionId = useMemo(() => String(sessionId ?? "").trim(), [sessionId]);
  const resolvedArticleId = useMemo(() => String(articleId ?? "").trim(), [articleId]);

  const derivedUserId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      if (!resolvedSessionId) {
        setError("No agent ID provided.");
        setSession(null);
        return;
      }
      if (!derivedUserId) {
        if (!userLoading) {
          setError("Unable to resolve user identity. Please sign in again.");
        }
        setSession(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const sessions = await fetchSessions(derivedUserId);
        if (!active) return;
        const found = sessions.find((s) => s.id === resolvedSessionId) ?? null;
        setSession(found);
        if (!found) {
          setError("Agent not found.");
        }
      } catch (err) {
        if (!active) return;
        console.error("[KbArticleEditor] Unable to load session", err);
        setSession(null);
        setError("Unable to load agent configuration right now.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [derivedUserId, resolvedSessionId, userLoading]);

  const kbConnection = useMemo(
    () => resolveKbConnection((session?.config ?? {}) as Record<string, unknown>),
    [session],
  );

  if (loading || userLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-dark-5 dark:text-dark-6">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        Loading agent settings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!resolvedArticleId) {
    return (
      <div className="rounded-lg border border-stroke bg-white p-4 text-sm text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
        No article ID provided. Open an article from{" "}
        <Link
          href={`/kb-articles?session_id=${encodeURIComponent(resolvedSessionId)}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          Knowledgebase Articles
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Article</h2>
        <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
          Agent:{" "}
          <span className="font-medium text-dark dark:text-white">{session?.name ?? resolvedSessionId}</span>
          <span className="mx-2">|</span>
          ID:{" "}
          <Link
            href={`/session?id=${encodeURIComponent(resolvedSessionId)}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {resolvedSessionId}
          </Link>
        </div>
        <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
          Article ID: <span className="text-dark dark:text-white">{resolvedArticleId}</span>
        </div>
      </div>

      <KbArticleContent
        kbEndpoint={kbConnection.endpoint}
        kbKeyName={kbConnection.keyName}
        kbKeyValue={kbConnection.keyValue}
        articleId={resolvedArticleId}
      />
    </div>
  );
}
