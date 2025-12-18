"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  kbEndpoint: string;
  kbKeyName?: string;
  kbKeyValue?: string;
  articleId: string;
};

function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  const normalizedBase = normalizeBase(base);
  const normalizedPath = path.trim().replace(/^\/+/, "");
  if (!normalizedBase) return "";
  if (!normalizedPath) return normalizedBase;
  return `${normalizedBase}/${normalizedPath}`;
}

function resolveSourceArticleEndpoint(kbEndpoint: string) {
  const normalized = normalizeBase(kbEndpoint);
  if (!normalized) return "";
  if (/\/kb$/i.test(normalized)) {
    return joinUrl(normalized, "source-article");
  }
  return joinUrl(normalized, "kb/source-article");
}

function pickString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function pickNested(obj: unknown, path: string[]) {
  let current = obj as any;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function deriveTitle(articleObj: any) {
  const candidates = [
    pickNested(articleObj, ["fields", "Title"]),
    pickNested(articleObj, ["fields", "title"]),
    articleObj?.title,
    articleObj?.source_title,
    articleObj?.name,
  ];

  for (const candidate of candidates) {
    const str = pickString(candidate);
    if (str && str.trim()) return str.trim();
  }

  return "";
}

function deriveContent(articleObj: any) {
  const candidates = [
    articleObj?.content,
    articleObj?.body,
    articleObj?.article_body,
    articleObj?.text,
    pickNested(articleObj, ["fields", "Content"]),
    pickNested(articleObj, ["fields", "content"]),
    pickNested(articleObj, ["fields", "Body"]),
    pickNested(articleObj, ["fields", "body"]),
  ];

  for (const candidate of candidates) {
    const str = pickString(candidate);
    if (str !== null) return str;
  }

  try {
    return JSON.stringify(articleObj ?? {}, null, 2);
  } catch {
    return "";
  }
}

export function KbArticleContent({
  kbEndpoint,
  kbKeyName = "x-api-key",
  kbKeyValue = "",
  articleId,
}: Props) {
  const resolvedEndpoint = useMemo(() => resolveSourceArticleEndpoint(kbEndpoint), [kbEndpoint]);
  const resolvedId = useMemo(() => String(articleId ?? "").trim(), [articleId]);
  const resolvedKeyName = useMemo(() => String(kbKeyName ?? "x-api-key").trim() || "x-api-key", [kbKeyName]);
  const resolvedKeyValue = useMemo(() => String(kbKeyValue ?? "").trim(), [kbKeyValue]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadArticle = useCallback(async () => {
    if (!resolvedEndpoint) {
      setError("Knowledge Base endpoint is not configured for this session.");
      return;
    }
    if (!resolvedId) {
      setError("Missing knowledge base article ID.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSavedMessage(null);

    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (resolvedKeyValue) {
        headers[resolvedKeyName] = resolvedKeyValue;
      }

      const url = new URL(resolvedEndpoint);
      url.searchParams.set("id", resolvedId);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = await res.json().catch(async () => {
        const text = await res.text().catch(() => "");
        return text || null;
      });

      if (!res.ok) {
        const message =
          payload && typeof payload === "object" && ("message" in payload || "error" in payload)
            ? String((payload as any).message ?? (payload as any).error)
            : `Failed to load source article (status ${res.status})`;
        throw new Error(message);
      }

      const candidate = payload && typeof payload === "object" ? payload : {};
      const articleObj =
        candidate && typeof candidate === "object" && (candidate as any).article && typeof (candidate as any).article === "object"
          ? (candidate as any).article
          : candidate;

      setTitle(deriveTitle(articleObj));
      setContent(deriveContent(articleObj));
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("[KbArticleContent] Unable to load source article", err);
      setError(err instanceof Error && err.message ? err.message : "Unable to load this article right now.");
    } finally {
      setLoading(false);
    }
  }, [resolvedEndpoint, resolvedId, resolvedKeyName, resolvedKeyValue]);

  useEffect(() => {
    void loadArticle();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadArticle]);

  const handleSave = useCallback(async () => {
    if (!resolvedEndpoint) {
      setError("Knowledge Base endpoint is not configured for this session.");
      return;
    }
    if (!resolvedId) {
      setError("Missing knowledge base article ID.");
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (resolvedKeyValue) {
        headers[resolvedKeyName] = resolvedKeyValue;
      }

      const res = await fetch(resolvedEndpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: resolvedId, title, content }),
      });
      const payload = await res.json().catch(async () => {
        const text = await res.text().catch(() => "");
        return text || null;
      });

      if (!res.ok) {
        const message =
          payload && typeof payload === "object" && ("message" in payload || "error" in payload)
            ? String((payload as any).message ?? (payload as any).error)
            : `Failed to save source article (status ${res.status})`;
        throw new Error(message);
      }

      setSavedMessage("Saved.");
    } catch (err) {
      console.error("[KbArticleContent] Save failed", err);
      setError(err instanceof Error && err.message ? err.message : "Unable to save this article right now.");
    } finally {
      setSaving(false);
    }
  }, [content, resolvedEndpoint, resolvedId, resolvedKeyName, resolvedKeyValue, title]);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-dark-5 dark:text-dark-6">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
          Loading article...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {savedMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {savedMessage}
        </div>
      ) : null}

      <div>
        <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="kb-article-title">
          Title
        </label>
        <input
          id="kb-article-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={loading || saving}
          className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          placeholder="Article title"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="kb-article-content">
          Content
        </label>
        <textarea
          id="kb-article-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={loading || saving}
          className="custom-scrollbar h-96 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          placeholder="Article content"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
          onClick={() => void loadArticle()}
          disabled={loading || saving}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handleSave()}
          disabled={loading || saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

