"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/contexts/user-context";
import {
  fetchSessionDetail,
  type SessionConfig,
  type SessionRecord,
} from "@/services/sessions";
import {
  fetchSourceArticles,
  parseCsvFilter,
  type SourceArticleRecord,
  type SourceArticlesFilters,
} from "@/services/kb-source-articles";

type Props = {
  sessionId: string;
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

function deriveArticleTitle(articleObj: any) {
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

function deriveArticleContent(articleObj: any) {
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

function resolveKbConnection(sessionConfig: SessionConfig | Record<string, unknown> | null | undefined) {
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

function getFieldValue(record: SourceArticleRecord, key: string) {
  const direct = record[key];
  if (direct !== undefined) return direct;

  const fields = record.fields;
  if (fields && typeof fields === "object") {
    return (fields as Record<string, unknown>)[key];
  }

  return undefined;
}

function getFirstString(record: SourceArticleRecord, keys: string[]) {
  for (const key of keys) {
    const value = getFieldValue(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry)))
        .filter(Boolean)
        .join(", ");
      if (joined) return joined;
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function formatUpdatedAt(record: SourceArticleRecord) {
  const candidates = [
    "LastModifiedTime",
    "updated_at",
    "updatedAt",
    "last_modified",
    "lastModified",
    "modified_at",
    "modifiedAt",
  ];
  const value = getFirstString(record, candidates);
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function extractCreatedId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [
    record.id,
    record.record_id,
    record.source_id,
    (record.article as any)?.id,
    (record.article as any)?.record_id,
    (record.article as any)?.source_id,
    (record.fields as any)?.UniqueID,
    ((record.article as any)?.fields as any)?.UniqueID,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return null;
}

export function KbArticlesContent({ sessionId }: Props) {
  const { tokens, attributes, user, isLoading: userLoading, isAuthenticated } = useUser();

  const resolvedSessionId = useMemo(() => String(sessionId ?? "").trim(), [sessionId]);
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
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      if (!resolvedSessionId) {
        setSession(null);
        setSessionError("No session_id provided.");
        return;
      }
      if (!isAuthenticated) {
        setSession(null);
        setSessionError("Sign in to view knowledgebase articles.");
        return;
      }
      if (!derivedUserId) {
        if (!userLoading) {
          setSession(null);
          setSessionError("Unable to resolve user identity. Please sign in again.");
        }
        return;
      }

      setSessionLoading(true);
      setSessionError(null);
      try {
        const { session: loaded } = await fetchSessionDetail(resolvedSessionId, derivedUserId);
        if (!active) return;
        if (!loaded) {
          setSession(null);
          setSessionError("Session not found.");
          return;
        }
        setSession(loaded);
      } catch (err) {
        if (!active) return;
        console.error("[KbArticlesContent] Unable to load session", err);
        setSession(null);
        setSessionError("Unable to load session configuration right now.");
      } finally {
        if (active) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [derivedUserId, isAuthenticated, resolvedSessionId, userLoading]);

  const kbConnection = useMemo(
    () => resolveKbConnection((session?.config ?? {}) as SessionConfig),
    [session],
  );
  const kbEndpoint = kbConnection.endpoint;
  const kbKeyName = kbConnection.keyName;
  const kbKeyValue = kbConnection.keyValue;

  const sessionLinkHref = resolvedSessionId ? `/session?id=${encodeURIComponent(resolvedSessionId)}` : "/";
  const sessionEditHref = resolvedSessionId ? `/session/edit?id=${encodeURIComponent(resolvedSessionId)}` : "/";

  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [intranetStatus, setIntranetStatus] = useState("");
  const [whatsAppStatus, setWhatsAppStatus] = useState("");
  const [zendeskStatus, setZendeskStatus] = useState("");
  const [accessLevel, setAccessLevel] = useState("");
  const [channel, setChannel] = useState("");
  const [ids, setIds] = useState("");

  const [articles, setArticles] = useState<SourceArticleRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const filters = useMemo<SourceArticlesFilters>(
    () => ({
      q: query,
      IntranetStatus: parseCsvFilter(intranetStatus),
      WhatsAppStatus: parseCsvFilter(whatsAppStatus),
      ZendeskStatus: parseCsvFilter(zendeskStatus),
      AccessLevel: parseCsvFilter(accessLevel),
      Channel: parseCsvFilter(channel),
      ids: parseCsvFilter(ids),
    }),
    [accessLevel, channel, ids, intranetStatus, query, whatsAppStatus, zendeskStatus],
  );

  const loadArticles = useCallback(
    async (resolvedFilters: SourceArticlesFilters) => {
      if (!kbEndpoint) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const { articles: fetched, count } = await fetchSourceArticles({
          kbEndpoint,
          apiKeyName: kbKeyName,
          apiKeyValue: kbKeyValue,
          filters: resolvedFilters,
          signal: controller.signal,
        });
        setArticles(fetched);
        setTotalCount(count ?? fetched.length);
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError") {
          return;
        }
        console.error("[KbArticlesContent] Unable to load source articles", err);
        setError(err instanceof Error && err.message ? err.message : "Unable to load source articles right now.");
        setArticles([]);
        setTotalCount(null);
      } finally {
        setLoading(false);
      }
    },
    [kbEndpoint, kbKeyName, kbKeyValue],
  );

  const handleRefresh = useCallback(() => {
    hasLoadedOnceRef.current = true;
    void loadArticles(filters);
  }, [filters, loadArticles]);

  useEffect(() => {
    if (!kbEndpoint) {
      setArticles([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!hasLoadedOnceRef.current) {
      hasLoadedOnceRef.current = true;
      void loadArticles(filters);
    } else {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void loadArticles(filters);
      }, 300);
    }

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [filters, kbEndpoint, loadArticles]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const hasActiveFilters = Boolean(
    query.trim() ||
      intranetStatus.trim() ||
      whatsAppStatus.trim() ||
      zendeskStatus.trim() ||
      accessLevel.trim() ||
      channel.trim() ||
      ids.trim(),
  );

  const resetFilters = useCallback(() => {
    setQuery("");
    setIntranetStatus("");
    setWhatsAppStatus("");
    setZendeskStatus("");
    setAccessLevel("");
    setChannel("");
    setIds("");
    setFiltersOpen(false);
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<{ id: string | null } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const sourceArticleEndpoint = useMemo(() => resolveSourceArticleEndpoint(kbEndpoint), [kbEndpoint]);

  const handleOpenCreate = useCallback(() => {
    setCreateError(null);
    setCreateSuccess(null);
    setCreateTitle("");
    setCreateContent("");
    setCreateOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    if (createSaving) return;
    setCreateOpen(false);
    setCreateError(null);
    setCreateSuccess(null);
  }, [createSaving]);

  const editAbortRef = useRef<AbortController | null>(null);

  const loadEditArticle = useCallback(
    async (id: string) => {
      if (!sourceArticleEndpoint) {
        setEditError("Knowledge Base endpoint is not configured for this session.");
        return;
      }

      editAbortRef.current?.abort();
      const controller = new AbortController();
      editAbortRef.current = controller;

      setEditLoading(true);
      setEditError(null);
      try {
        const headers: Record<string, string> = {
          accept: "application/json",
        };
        if (kbKeyValue) {
          headers[kbKeyName] = kbKeyValue;
        }

        const url = new URL(sourceArticleEndpoint);
        url.searchParams.set("id", id);

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
          candidate &&
          typeof candidate === "object" &&
          (candidate as any).article &&
          typeof (candidate as any).article === "object"
            ? (candidate as any).article
            : candidate;

        setEditTitle(deriveArticleTitle(articleObj));
        setEditContent(deriveArticleContent(articleObj));
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError" || controller.signal.aborted) {
          return;
        }
        console.error("[KbArticlesContent] Unable to load source article", err);
        setEditError(err instanceof Error && err.message ? err.message : "Unable to load this article right now.");
      } finally {
        setEditLoading(false);
      }
    },
    [kbKeyName, kbKeyValue, sourceArticleEndpoint],
  );

  const handleOpenEdit = useCallback(
    (id: string) => {
      if (!id) return;
      setCreateSuccess(null);
      setEditError(null);
      setEditId(id);
      setEditTitle("");
      setEditContent("");
      setEditOpen(true);
      void loadEditArticle(id);
    },
    [loadEditArticle],
  );

  const handleCloseEdit = useCallback(() => {
    if (editSaving) return;
    editAbortRef.current?.abort();
    setEditOpen(false);
    setEditError(null);
    setEditId(null);
    setEditTitle("");
    setEditContent("");
  }, [editSaving]);

  const handleSaveEdit = useCallback(async () => {
    if (!sourceArticleEndpoint) {
      setEditError("Knowledge Base endpoint is not configured for this session.");
      return;
    }
    if (!editId) {
      setEditError("Missing source article ID.");
      return;
    }

    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title) {
      setEditError("Title is required.");
      return;
    }
    if (!content) {
      setEditError("Content is required.");
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (kbKeyValue) {
        headers[kbKeyName] = kbKeyValue;
      }

      const res = await fetch(sourceArticleEndpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: editId, title, content }),
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

      handleCloseEdit();
      void loadArticles(filters);
    } catch (err) {
      console.error("[KbArticlesContent] Save article failed", err);
      setEditError(err instanceof Error && err.message ? err.message : "Unable to save this article right now.");
    } finally {
      setEditSaving(false);
    }
  }, [
    editContent,
    editId,
    editTitle,
    filters,
    handleCloseEdit,
    kbKeyName,
    kbKeyValue,
    loadArticles,
    sourceArticleEndpoint,
  ]);

  const handleCreate = useCallback(async () => {
    if (!sourceArticleEndpoint) {
      setCreateError("Knowledge Base endpoint is not configured for this session.");
      return;
    }

    const title = createTitle.trim();
    const content = createContent.trim();
    if (!title) {
      setCreateError("Title is required.");
      return;
    }
    if (!content) {
      setCreateError("Content is required.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (kbKeyValue) {
        headers[kbKeyName] = kbKeyValue;
      }

      const res = await fetch(sourceArticleEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, content }),
      });
      const payload = await res.json().catch(() => null as any);

      if (!res.ok) {
        const message =
          (payload && typeof payload === "object" && (payload.message || payload.error)) ||
          `Failed to create source article (status ${res.status})`;
        throw new Error(String(message));
      }

      const createdId = extractCreatedId(payload);
      setCreateOpen(false);
      setCreateSuccess({ id: createdId });
      void loadArticles(filters);
    } catch (err) {
      console.error("[KbArticlesContent] Create article failed", err);
      setCreateError(err instanceof Error && err.message ? err.message : "Unable to create article right now.");
    } finally {
      setCreateSaving(false);
    }
  }, [
    createContent,
    createTitle,
    filters,
    kbKeyName,
    kbKeyValue,
    loadArticles,
    sourceArticleEndpoint,
  ]);

  if (sessionLoading || userLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-dark-5 dark:text-dark-6">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        Loading session settings...
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        {sessionError}
      </div>
    );
  }

  if (!kbEndpoint) {
    return (
      <div className="rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Articles</h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Agent KB endpoint is not configured for this session.
            </p>
          </div>
          <Link
            href={sessionEditHref}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Configure Session
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Articles</h2>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            Session:{" "}
            <Link href={sessionLinkHref} className="font-semibold text-primary hover:underline">
              {session?.name ?? resolvedSessionId}
            </Link>
          </div>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            {loading ? "Loading..." : `Total: ${totalCount ?? articles.length}`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={sessionLinkHref}
            className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
          >
            Back to Session
          </Link>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Add New
          </button>
        </div>
      </div>

      {createSuccess ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200">
          <div>
            Article created successfully.
          </div>
          <button
            type="button"
            className="rounded-lg border border-green-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-800 transition hover:bg-green-50 dark:border-green-900/60 dark:bg-transparent dark:text-green-200 dark:hover:bg-green-950/30"
            onClick={() => setCreateSuccess(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        <label className="sr-only" htmlFor="kb-search">
          Search
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            id="kb-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white sm:max-w-xl"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              {filtersOpen ? "Hide Filters" : "Show Filters"}
              {hasActiveFilters ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  Active
                </span>
              ) : null}
            </button>
            {hasActiveFilters ? (
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                onClick={resetFilters}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={intranetStatus}
              onChange={(event) => setIntranetStatus(event.target.value)}
              placeholder="IntranetStatus (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={whatsAppStatus}
              onChange={(event) => setWhatsAppStatus(event.target.value)}
              placeholder="WhatsAppStatus (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={zendeskStatus}
              onChange={(event) => setZendeskStatus(event.target.value)}
              placeholder="ZendeskStatus (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={accessLevel}
              onChange={(event) => setAccessLevel(event.target.value)}
              placeholder="AccessLevel (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              placeholder="Channel (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={ids}
              onChange={(event) => setIds(event.target.value)}
              placeholder="IDs (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-2 text-left text-sm dark:divide-dark-3">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-dark-5 dark:text-dark-6">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">IntranetStatus</th>
              <th className="px-4 py-3">WhatsAppStatus</th>
              <th className="px-4 py-3">ZendeskStatus</th>
              <th className="px-4 py-3">AccessLevel</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Last Modified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-2 dark:divide-dark-3">
            {articles.map((article, index) => {
              const title = getFirstString(article, ["Title", "title", "source_title", "name"]) || "(Untitled)";
              const id =
                getFirstString(article, ["id", "UniqueID", "source_id", "record_id", "recordId"]) || "";
              const intranet = getFirstString(article, ["IntranetStatus", "intranet_status", "intranetStatus"]) || "—";
              const whatsapp = getFirstString(article, ["WhatsAppStatus", "whatsapp_status", "whatsAppStatus"]) || "—";
              const zendesk = getFirstString(article, ["ZendeskStatus", "zendesk_status", "zendeskStatus"]) || "—";
              const access = getFirstString(article, ["AccessLevel", "access_level", "accessLevel"]) || "—";
              const channelValue = getFirstString(article, ["Channel", "channel"]) || "—";
              const updated = formatUpdatedAt(article);

              return (
                <tr key={`${id || "article"}-${index}`}>
                  <td className="px-4 py-3 font-medium text-dark dark:text-white">
                    {id ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(id)}
                          className="text-left text-primary underline-offset-2 hover:underline"
                        >
                          {title}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(id)}
                          className="rounded-md border border-stroke px-3 py-1 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      title
                    )}
                  </td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{intranet}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{whatsapp}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{zendesk}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{access}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{channelValue}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{updated}</td>
                </tr>
              );
            })}

            {!loading && articles.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-sm text-dark-5 dark:text-dark-6" colSpan={7}>
                  No knowledgebase articles found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseCreate}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl dark:bg-dark-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-dark dark:text-white">Add Knowledge Base Article</div>
                <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  Create a new source article for this session&apos;s knowledge base.
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                disabled={createSaving}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Title
              </label>
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder="Article title"
                disabled={createSaving}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Content
              </label>
              <textarea
                value={createContent}
                onChange={(e) => setCreateContent(e.target.value)}
                className="custom-scrollbar h-80 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder="Write the article content (Markdown is supported)."
                disabled={createSaving}
              />
            </div>

            {createError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                {createError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseCreate}
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                disabled={createSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createSaving}
              >
                {createSaving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseEdit}
        >
          <div
            className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl dark:bg-dark-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-dark dark:text-white">Edit Knowledge Base Article</div>
                <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">Update the article and save to publish.</div>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                disabled={editSaving}
              >
                Close
              </button>
            </div>

            {editLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-dark-5 dark:text-dark-6">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
                Loading article...
              </div>
            ) : null}

            {editError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                {editError}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Title
              </label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder="Article title"
                disabled={editLoading || editSaving}
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Content
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="custom-scrollbar h-96 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder="Write the article content (Markdown is supported)."
                disabled={editLoading || editSaving}
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={editLoading || editSaving}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
