"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildKnowledgeBaseFilePath, buildSessionsIndexPath } from "@/services/storage-paths";
import { useUser } from "@/contexts/user-context";
import { apiGet, apiPut } from "@/services/api-client";
import type { SessionRecord } from "@/services/sessions";
import { buildBearerTokenFromTokens } from "@/lib/auth-headers";

type Props = {
  userId?: string;
  sessionId: string;
  fileName?: string | null;
  fallbackEntries?: Record<string, string>;
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

export function KbFileContent({ userId, sessionId, fileName, fallbackEntries }: Props) {
  const { tokens, attributes, user } = useUser();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [saving, setSaving] = useState<"save" | "saveAs" | "publish" | null>(null);
  const targetFile = useMemo(() => fileName?.trim() || null, [fileName]);
  const authHeader = useMemo(
    () => buildBearerTokenFromTokens(tokens),
    [tokens?.accessToken, tokens?.idToken],
  );

  const baseEndpoint = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_USERDATA_API_ENDPOINT ?? "";
    return base.replace(/\/+$/, "");
  }, []);

  const normalizeContent = useCallback((raw: string | null) => {
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string") {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        return parsed;
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      // not JSON, keep as-is
    }
    return raw;
  }, []);

  const derivedUserId = useMemo(
    () =>
      userId ??
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [userId, attributes, user, tokens],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!derivedUserId || !targetFile) {
        setContent(fallbackEntries ? JSON.stringify(fallbackEntries, null, 2) : null);
        return;
      }

      try {
        setError(null);
        const path = buildKnowledgeBaseFilePath(derivedUserId, sessionId, targetFile);
        const url = baseEndpoint ? `${baseEndpoint}/${path}` : `/${path}`;
        const headers: Record<string, string> = {
          accept: "text/plain, application/json",
        };
        if (authHeader) headers.Authorization = authHeader;
        if (process.env.NEXT_PUBLIC_USERDATA_API_KEY) {
          headers["x-api-key"] = String(process.env.NEXT_PUBLIC_USERDATA_API_KEY);
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!active) return;
        if (!res.ok) {
          throw new Error(`Failed to load file (status ${res.status})`);
        }
        const text = await res.text();
        setContent(normalizeContent(text ?? null));

        // also hydrate session metadata for updating versions
        try {
          const sessionsPath = buildSessionsIndexPath(derivedUserId);
          const sessions = (await apiGet<SessionRecord[]>(sessionsPath)) ?? [];
          const found = sessions.find((s) => s.id === sessionId) ?? null;
          setSession(found);
        } catch {
          // ignore
        }
      } catch (err) {
        if (!active) return;
        // eslint-disable-next-line no-console
        console.error("[KbFileContent] Unable to fetch file", err);
        setError("Unable to load this file right now.");
        setContent(fallbackEntries ? JSON.stringify(fallbackEntries, null, 2) : null);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [
    derivedUserId,
    sessionId,
    targetFile,
    fallbackEntries,
    normalizeContent,
    authHeader,
    baseEndpoint,
  ]);

  const resolveNextVersionName = () => {
    const base = targetFile ?? "kb.txt";
    const match = base.match(/(.*-v)(\d+)(\.[^.]+)?$/i);
    if (match) {
      const prefix = match[1];
      const num = Number(match[2]) + 1;
      const ext = match[3] ?? "";
      return `${prefix}${num}${ext}`;
    }
    const extMatch = base.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : ".txt";
    const prefix = base.replace(ext, "");
    return `${prefix}-v2${ext}`;
  };

  const updateSessionIndex = async (
    newFileName: string,
    makeActive: boolean,
    ensureEntry = false,
  ) => {
    if (!derivedUserId) return;
    try {
      const sessionsPath = buildSessionsIndexPath(derivedUserId);
      const sessions = (await apiGet<SessionRecord[]>(sessionsPath)) ?? [];
      const updated = sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const files = s.knowledgebase_files ?? [];
        const now = new Date().toISOString();
        const nextFiles = ensureEntry
          ? [
              ...files.filter((f) => f.file_name !== newFileName),
              {
                file_name: newFileName,
                created_at: now,
                updated_at: now,
                active: makeActive,
              },
            ]
          : files.map((f) =>
              f.file_name === newFileName
                ? { ...f, active: makeActive, updated_at: now }
                : f,
            );
        const ordered = nextFiles
          .map((f) => ({
            ...f,
            active: makeActive ? f.file_name === newFileName : f.active,
          }))
          .sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            const aDate = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const bDate = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return bDate - aDate;
          });
        return {
          ...s,
          knowledgebase_file_name: makeActive ? newFileName : s.knowledgebase_file_name,
          knowledgebase_files: ordered,
        };
      });
      await apiPut(sessionsPath, {
        headers: { "Content-Type": "application/json" },
        body: updated as any,
      });
      const current = updated.find((s) => s.id === sessionId) ?? null;
      setSession(current);
    } catch (err) {
      console.error("[KbFileContent] Unable to update session index", err);
      setError("Saved file but failed to update agent metadata.");
    }
  };

  const handleSave = async () => {
    if (!derivedUserId || !targetFile || content === null) return;
    setSaving("save");
    setError(null);
    try {
      const path = buildKnowledgeBaseFilePath(derivedUserId, sessionId, targetFile);
      await apiPut(path, {
        headers: { "Content-Type": "text/plain" },
        body: content,
      });
    } catch (err) {
      console.error("[KbFileContent] Save failed", err);
      setError("Unable to save file right now.");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAs = async () => {
    if (!derivedUserId || content === null) return;
    setSaving("saveAs");
    setError(null);
    const newName = resolveNextVersionName();
    try {
      const path = buildKnowledgeBaseFilePath(derivedUserId, sessionId, newName);
      await apiPut(path, {
        headers: { "Content-Type": "text/plain" },
        body: content,
      });
      await updateSessionIndex(newName, true, true);
    } catch (err) {
      console.error("[KbFileContent] Save as new version failed", err);
      setError("Unable to save new version right now.");
    } finally {
      setSaving(null);
    }
  };

  const handlePublish = async () => {
    if (!derivedUserId || !targetFile) return;
    setSaving("publish");
    setError(null);
    try {
      await updateSessionIndex(targetFile, true, true);
    } catch (err) {
      console.error("[KbFileContent] Publish failed", err);
      setError("Unable to publish this file right now.");
    } finally {
      setSaving(null);
    }
  };

  if (error && !content) {
    return <div className="text-sm text-red-600 dark:text-red-400">{error}</div>;
  }

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-dark dark:text-white">Knowledgebase</div>
      <textarea
        value={content ?? ""}
        onChange={(e) => setContent(e.target.value)}
        placeholder="No knowledgebase content set for this agent."
        className="h-64 w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
      />
      {error && (
        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSave}
          disabled={saving !== null}
        >
          {saving === "save" ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSaveAs}
          disabled={saving !== null}
        >
          {saving === "saveAs" ? "Saving..." : "Save as New Version"}
        </button>
        <button
          type="button"
          className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handlePublish}
          disabled={saving !== null || !targetFile}
        >
          {saving === "publish" ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
