"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionConfig } from "@/services/sessions";
import {
  fetchSourceArticles,
  parseCsvFilter,
  type SourceArticleRecord,
  type SourceArticlesFilters,
} from "@/services/kb-source-articles";

type Props = {
  sessionId: string;
  sessionConfig: SessionConfig;
};

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

export function KnowledgebaseArticles({ sessionId, sessionConfig }: Props) {
  const kbEndpoint = useMemo(() => String(sessionConfig.agent_kb_endpoint ?? "").trim(), [sessionConfig]);
  const kbKeyName = useMemo(() => String(sessionConfig.agent_kb_key_name ?? "x-api-key").trim() || "x-api-key", [
    sessionConfig,
  ]);
  const kbKeyValue = useMemo(() => String(sessionConfig.agent_kb_key ?? "").trim(), [sessionConfig]);

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
        console.error("[KnowledgebaseArticles] Unable to load source articles", err);
        setError(err instanceof Error && err.message ? err.message : "Unable to load source articles right now.");
        setArticles([]);
        setTotalCount(null);
      } finally {
        setLoading(false);
      }
    },
    [kbEndpoint, kbKeyName, kbKeyValue],
  );

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
      loadArticles(filters);
    } else {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        loadArticles(filters);
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

  if (!kbEndpoint) {
    return (
      <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Articles</h3>
            <p className="mt-1 text-sm text-dark-5 dark:text-dark-6">
              Agent KB endpoint is not configured for this session.
            </p>
          </div>
          <Link
            href={`/session/edit?id=${encodeURIComponent(sessionId)}`}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Configure Session
          </Link>
        </div>
      </div>
    );
  }

  const hasActiveFilters = Boolean(
    query.trim() ||
      intranetStatus.trim() ||
      whatsAppStatus.trim() ||
      zendeskStatus.trim() ||
      accessLevel.trim() ||
      channel.trim() ||
      ids.trim(),
  );

  return (
    <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-dark dark:text-white">Knowledgebase Articles</h3>
          <div className="mt-1 text-sm text-dark-5 dark:text-dark-6">
            {loading ? "Loading..." : `Total: ${totalCount ?? articles.length}`}
          </div>
        </div>

        <div className="w-full max-w-xl">
          <label className="sr-only" htmlFor="kb-search">
            Search
          </label>
          <input
            id="kb-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          />
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            {filtersOpen ? "Hide Filters" : "Show Filters"}
            {hasActiveFilters ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Active
              </span>
            ) : null}
          </button>

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
              const id = getFirstString(article, ["id", "UniqueID", "source_id", "record_id", "recordId"]) || "";
              const intranet = getFirstString(article, ["IntranetStatus", "intranet_status", "intranetStatus"]) || "-";
              const whatsapp = getFirstString(article, ["WhatsAppStatus", "whatsapp_status", "whatsAppStatus"]) || "-";
              const zendesk = getFirstString(article, ["ZendeskStatus", "zendesk_status", "zendeskStatus"]) || "-";
              const access = getFirstString(article, ["AccessLevel", "access_level", "accessLevel"]) || "-";
              const channelValue = getFirstString(article, ["Channel", "channel"]) || "-";
              const updated = formatUpdatedAt(article);
              const href = id
                ? `/kb?session_id=${encodeURIComponent(sessionId)}&id=${encodeURIComponent(id)}`
                : undefined;

              return (
                <tr key={`${id || "article"}-${index}`}>
                  <td className="px-4 py-3 font-medium text-dark dark:text-white">
                    {href ? (
                      <Link href={href} className="text-primary underline-offset-2 hover:underline">
                        {title}
                      </Link>
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
    </div>
  );
}
