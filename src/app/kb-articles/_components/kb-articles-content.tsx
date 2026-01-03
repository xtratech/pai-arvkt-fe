"use client";

import Link from "next/link";
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@/contexts/user-context";
import {
  fetchSessionDetail,
  type SessionConfig,
  type SessionRecord,
} from "@/services/sessions";
import {
  isAsyncJobResponse,
  pollChatJob,
  startChat,
  type AsyncJobResponse,
  type ChatSyncResponse,
} from "@/services/chat-async-jobs";
import {
  fetchSourceArticles,
  parseCsvFilter,
  type SourceArticleRecord,
  type SourceArticlesFilters,
} from "@/services/kb-source-articles";
import { buildBearerTokenFromTokens } from "@/lib/auth-headers";

type Props = {
  sessionId: string;
};

type DraftWizardStep = "idea" | "processing" | "decision" | "editor";

type AnalyzerSegment = {
  segment_text: string;
  source_id: string | null;
  source_title?: string | null;
  supporting_quote?: string | null;
  confidence?: number;
};

type DraftDuplicateMatch = {
  id: string;
  title: string;
  confidence: number;
  segments: AnalyzerSegment[];
};

type CreatorDraftPayload = {
  title: string;
  content: string;
  source_ids_and_titles_used?: string[];
  assumptions?: string[];
  open_questions?: string[];
};

const ANALYZER_CONFIDENCE_THRESHOLD = 0.8;
const ARTICLE_DETAIL_FIELDS = [
  { key: "IntranetStatus", label: "Intranet Status" },
  { key: "WhatsAppStatus", label: "WhatsApp Status" },
  { key: "VoiceCallStatus", label: "Voice Call Status" },
  { key: "WebStatus", label: "Web Status" },
  { key: "AccessLevel", label: "Access Level" },
  { key: "Channel", label: "Channel" },
] as const;
const CREATE_DETAIL_FIELDS = [
  { key: "IntranetStatus", label: "Intranet Status" },
  { key: "WhatsAppStatus", label: "WhatsApp Status" },
  { key: "VoiceCallStatus", label: "Voice Call Status" },
  { key: "WebStatus", label: "Web Status" },
  { key: "AccessLevel", label: "Access Level" },
] as const;
const ARTICLE_DETAIL_FIELD_KEYS = new Set<string>(ARTICLE_DETAIL_FIELDS.map((field) => field.key));
const MULTI_VALUE_FIELDS = new Set(["Channel"]);
const READ_ONLY_FIELDS = new Set(["LastModifiedTime", "Created", "UniqueID"]);
const HIDDEN_FIELDS = new Set(["IntranetGPTFileID", "Category"]);

const DRAFT_MARKDOWN_COMPONENTS: MarkdownComponents = {
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li className="mb-1 last:mb-0">{children}</li>;
  },
  a({ href, children }) {
    if (!href) {
      return <span className="underline">{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:opacity-90"
      >
        {children}
      </a>
    );
  },
  code({ children, className }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-gray-2 px-1 py-0.5 font-mono text-[12px] text-dark dark:bg-dark-3 dark:text-white">
          {children}
        </code>
      );
    }
    return (
      <code className="block whitespace-pre font-mono text-[12px] text-dark dark:text-white">
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="custom-scrollbar mb-2 overflow-x-auto rounded-lg bg-gray-2 p-3 dark:bg-dark-3">
        {children}
      </pre>
    );
  },
};

function createUuidV4() {
  const cryptoObj = (globalThis as Record<string, unknown>).crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  let timestamp = Date.now();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (timestamp + Math.random() * 16) % 16 | 0;
    timestamp = Math.floor(timestamp / 16);
    if (c === "x") return r.toString(16);
    return ((r & 0x3) | 0x8).toString(16);
  });
}

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

function parseSchemaInput(schema: unknown) {
  if (!schema) return null;
  if (typeof schema === "string") {
    const trimmed = schema.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof schema === "object") {
    return schema;
  }
  return null;
}

function buildRequestFromSchema(schema: unknown, message: string, userIdentifier: string): Record<string, unknown> {
  const parsed = parseSchemaInput(schema);
  let placedMessage = false;
  let placedUser = false;

  const fillTemplate = (template: any): any => {
    if (Array.isArray(template)) {
      return template.map((item) => fillTemplate(item));
    }
    if (!template || typeof template !== "object") {
      return template;
    }

    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const lower = key.toLowerCase();
      if (typeof value === "string") {
        if (lower.includes("prompt") || lower.includes("message") || lower.includes("query") || lower.includes("input")) {
          placedMessage = true;
          copy[key] = message;
          continue;
        }
        if (lower.includes("user")) {
          placedUser = true;
          copy[key] = userIdentifier;
          continue;
        }
      }
      copy[key] = fillTemplate(value);
    }
    return copy;
  };

  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? fillTemplate(parsed) : {};

  if (!placedMessage) {
    (payload as Record<string, unknown>).message = message;
  }
  if (!placedUser) {
    (payload as Record<string, unknown>).userId = userIdentifier;
  }

  return payload;
}

function safeParseJsonFromText(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const codeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (codeFence ? codeFence[1] : trimmed).trim();
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractChatText(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const candidate = (payload as Record<string, unknown>).text;
    if (typeof candidate === "string") return candidate;
  }
  return "";
}

function normalizeConfidence(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function computeSimilarArticles(segments: AnalyzerSegment[]): DraftDuplicateMatch[] {
  const grouped = new Map<string, DraftDuplicateMatch>();

  for (const segment of segments) {
    const id = typeof segment.source_id === "string" ? segment.source_id.trim() : "";
    if (!id) continue;

    const confidence = normalizeConfidence(segment.confidence);
    const title = typeof segment.source_title === "string" && segment.source_title.trim() ? segment.source_title : id;

    const existing = grouped.get(id);
    if (!existing) {
      grouped.set(id, { id, title, confidence, segments: [segment] });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, confidence);
    if ((!existing.title || existing.title === id) && title !== id) {
      existing.title = title;
    }
    if (existing.segments.length < 3) {
      existing.segments.push(segment);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.confidence - a.confidence);
}

function normalizeAnalyzerSegments(input: unknown): AnalyzerSegment[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const list = (record.segments ?? record.segment ?? record.items) as unknown;
  if (!Array.isArray(list)) return [];

  return list
    .map<AnalyzerSegment | null>((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const segmentTextRaw = item.segment_text ?? item.text ?? item.segmentText ?? item.segment;
      const segment_text = typeof segmentTextRaw === "string" ? segmentTextRaw : String(segmentTextRaw ?? "");

      const sourceRaw = item.source_id ?? item.sourceId ?? item.source;
      const source_id = typeof sourceRaw === "string" ? sourceRaw.trim() : null;

      const titleRaw = item.source_title ?? item.sourceTitle ?? item.title;
      const source_title =
        titleRaw === null ? null : typeof titleRaw === "string" ? titleRaw : titleRaw ? String(titleRaw) : null;

      const quoteRaw = item.supporting_quote ?? item.supportingQuote ?? item.quote;
      const supporting_quote =
        quoteRaw === null ? null : typeof quoteRaw === "string" ? quoteRaw : quoteRaw ? String(quoteRaw) : null;

      const confidence = normalizeConfidence(item.confidence);

      return {
        segment_text,
        source_id: source_id && source_id.length ? source_id : null,
        source_title,
        supporting_quote,
        confidence,
      };
    })
    .filter((entry): entry is AnalyzerSegment => entry !== null);
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
    articleObj?.Title,
    articleObj?.title,
    articleObj?.source_title,
    articleObj?.sourceTitle,
    articleObj?.name,
    articleObj?.Name,
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
    articleObj?.Content,
    articleObj?.content_markdown,
    articleObj?.contentMarkdown,
    articleObj?.markdown,
    articleObj?.Markdown,
    articleObj?.body,
    articleObj?.Body,
    articleObj?.article_body,
    articleObj?.articleBody,
    articleObj?.text,
    articleObj?.Text,
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

function normalizeFieldOptions(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const normalized: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;
    const options = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry)))
      .filter(Boolean);
    if (options.length) {
      normalized[key] = options;
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

function formatUpdatedAt(record: SourceArticleRecord) {
  const candidates = [
    "LastModifiedTime",
    "LastUpdated",
    "updated_at",
    "updatedAt",
    "last_modified",
    "lastModified",
    "modified_at",
    "modifiedAt",
    "created_time",
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

function stripReservedArticleKeys(record: Record<string, unknown>) {
  const reserved = new Set([
    "id",
    "ID",
    "source_id",
    "sourceId",
    "title",
    "Title",
    "source_title",
    "sourceTitle",
    "content",
    "Content",
    "body",
    "Body",
    "article_body",
    "articleBody",
    "content_markdown",
    "contentMarkdown",
    "markdown",
    "Markdown",
    "text",
    "Text",
  ]);

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (reserved.has(key)) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

function resolveArticleFields(record: Record<string, unknown>) {
  const candidate = record.fields;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return record;
}

type EditableFieldValue = string | string[];

function getDefaultCreateFieldValues() {
  const defaults: Record<string, EditableFieldValue> = {};
  for (const field of CREATE_DETAIL_FIELDS) {
    if (field.key.endsWith("Status")) {
      defaults[field.key] = "Draft";
      continue;
    }
    if (field.key === "AccessLevel") {
      defaults[field.key] = "Private";
      continue;
    }
    defaults[field.key] = "";
  }
  return defaults;
}

function normalizeEditableFieldValue(value: unknown): EditableFieldValue {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry.trim() : String(entry))).filter(Boolean);
  }
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeEditableFields(record: Record<string, unknown>) {
  const stripped = stripReservedArticleKeys(record);
  const normalized: Record<string, EditableFieldValue> = {};
  for (const [key, value] of Object.entries(stripped)) {
    if (HIDDEN_FIELDS.has(key)) {
      continue;
    }
    normalized[key] = normalizeEditableFieldValue(value);
  }
  return normalized;
}

function hasEditableFieldValue(value: EditableFieldValue) {
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

function parseCommaList(input: string) {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeStringArray(value: EditableFieldValue) {
  if (Array.isArray(value)) return value;
  return parseCommaList(value);
}

export function KbArticlesContent({ sessionId }: Props) {
  const { tokens, attributes, user, isLoading: userLoading, isAuthenticated } = useUser();
  const [portalMounted, setPortalMounted] = useState(false);
  const surprisePrompt =
    "Based on the content of our current knowledge base, identify a gap or a high-value topic we haven't covered yet. valid suggestion for a new article. Provide ONLY the title and a 1-sentence summary. Do not include conversational filler.";

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
  const authHeader = useMemo(
    () => buildBearerTokenFromTokens(tokens) ?? undefined,
    [tokens?.accessToken, tokens?.idToken],
  );

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      if (!resolvedSessionId) {
        setSession(null);
        setSessionError("No agent ID provided.");
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
          setSessionError("Agent not found.");
          return;
        }
        setSession(loaded);
      } catch (err) {
        if (!active) return;
        console.error("[KbArticlesContent] Unable to load session", err);
        setSession(null);
        setSessionError("Unable to load agent configuration right now.");
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
  const chatEndpoint = String((session?.config as any)?.chat_api_endpoint ?? "").trim();
  const chatKeyName = String((session?.config as any)?.chat_api_key_name ?? "x-api-key").trim() || "x-api-key";
  const chatKeyValue = String((session?.config as any)?.chat_api_key ?? "").trim();

  const sessionLinkHref = resolvedSessionId ? `/session?id=${encodeURIComponent(resolvedSessionId)}` : "/";
  const sessionEditHref = resolvedSessionId ? `/session/edit?id=${encodeURIComponent(resolvedSessionId)}` : "/";

  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [intranetStatus, setIntranetStatus] = useState("");
  const [whatsAppStatus, setWhatsAppStatus] = useState("");
  const [voiceCallStatus, setVoiceCallStatus] = useState("");
  const [webStatus, setWebStatus] = useState("");
  const [accessLevel, setAccessLevel] = useState("");
  const [channel, setChannel] = useState("");
  const [ids, setIds] = useState("");

  const [articles, setArticles] = useState<SourceArticleRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [fieldOptions, setFieldOptions] = useState<Record<string, string[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const filters = useMemo<SourceArticlesFilters>(
    () => ({
      query,
      IntranetStatus: parseCsvFilter(intranetStatus),
      WhatsAppStatus: parseCsvFilter(whatsAppStatus),
      VoiceCallStatus: parseCsvFilter(voiceCallStatus),
      WebStatus: parseCsvFilter(webStatus),
      AccessLevel: parseCsvFilter(accessLevel),
      Channel: parseCsvFilter(channel),
      ids: parseCsvFilter(ids),
    }),
    [accessLevel, channel, ids, intranetStatus, query, voiceCallStatus, webStatus, whatsAppStatus],
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
        const { articles: fetched, count, raw } = await fetchSourceArticles({
          kbEndpoint,
          apiKeyName: kbKeyName,
          apiKeyValue: kbKeyValue,
          authHeader,
          filters: resolvedFilters,
          signal: controller.signal,
        });
        setArticles(fetched);
        setTotalCount(count ?? fetched.length);
        const options = normalizeFieldOptions((raw as any)?.field_options);
        setFieldOptions(options);
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
    [authHeader, kbEndpoint, kbKeyName, kbKeyValue],
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
      createAbortRef.current?.abort();
      editAbortRef.current?.abort();
    };
  }, []);

  const hasActiveFilters = Boolean(
    query.trim() ||
      intranetStatus.trim() ||
      whatsAppStatus.trim() ||
      voiceCallStatus.trim() ||
      webStatus.trim() ||
      accessLevel.trim() ||
      channel.trim() ||
      ids.trim(),
  );

  const resetFilters = useCallback(() => {
    setQuery("");
    setIntranetStatus("");
    setWhatsAppStatus("");
    setVoiceCallStatus("");
    setWebStatus("");
    setAccessLevel("");
    setChannel("");
    setIds("");
    setFiltersOpen(false);
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<DraftWizardStep>("idea");
  const [createIdea, setCreateIdea] = useState("");
  const [createProcessingLabel, setCreateProcessingLabel] = useState<string>("");
  const [createAnalyzerSegments, setCreateAnalyzerSegments] = useState<AnalyzerSegment[] | null>(null);
  const [createMatches, setCreateMatches] = useState<DraftDuplicateMatch[]>([]);
  const [createDraftMeta, setCreateDraftMeta] = useState<{
    source_ids_and_titles_used: string[];
    assumptions: string[];
    open_questions: string[];
  } | null>(null);
  const [createDraftAnalysis, setCreateDraftAnalysis] = useState<{
    segments: AnalyzerSegment[];
    unsupported: AnalyzerSegment[];
    flagged: boolean;
  } | null>(null);
  const [createDraftReviewConfirmed, setCreateDraftReviewConfirmed] = useState(false);
  const [createDraftAnalyzing, setCreateDraftAnalyzing] = useState(false);
  const [createAnalyzerFailed, setCreateAnalyzerFailed] = useState(false);
  const [createSurpriseLoading, setCreateSurpriseLoading] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createFieldValues, setCreateFieldValues] = useState<Record<string, EditableFieldValue>>(
    () => getDefaultCreateFieldValues(),
  );
  const [createDetailsOpen, setCreateDetailsOpen] = useState(false);
  const [createPreviewMarkdown, setCreatePreviewMarkdown] = useState(false);
  const [createAnalyzing, setCreateAnalyzing] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<{ id: string | null } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFieldValues, setEditFieldValues] = useState<Record<string, EditableFieldValue>>({});
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFieldOriginalKeys = useRef<Set<string>>(new Set());

  const handleEditFieldChange = useCallback((key: string, value: EditableFieldValue) => {
    setEditFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateFieldChange = useCallback((key: string, value: EditableFieldValue) => {
    setCreateFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const sourceArticleEndpoint = useMemo(() => resolveSourceArticleEndpoint(kbEndpoint), [kbEndpoint]);

  const resetCreateState = useCallback((step: DraftWizardStep) => {
    setCreateError(null);
    setCreateSuccess(null);
    setCreateStep(step);
    setCreateIdea("");
    setCreateProcessingLabel("");
    setCreateAnalyzerSegments(null);
    setCreateMatches([]);
    setCreateDraftMeta(null);
    setCreateDraftAnalysis(null);
    setCreateDraftReviewConfirmed(false);
    setCreateDraftAnalyzing(false);
    setCreateAnalyzerFailed(false);
    setCreateSurpriseLoading(false);
    setCreateTitle("");
    setCreateContent("");
    setCreateFieldValues(getDefaultCreateFieldValues());
    setCreateDetailsOpen(false);
    setCreatePreviewMarkdown(false);
    setCreateAnalyzing(false);
    analyzerJobRef.current = null;
    draftSupportJobRef.current = null;
    setCreateOpen(true);
  }, []);

  const handleOpenCreate = useCallback(() => {
    resetCreateState("idea");
  }, [resetCreateState]);

  const handleOpenManualCreate = useCallback(() => {
    resetCreateState("editor");
  }, [resetCreateState]);

  const createAbortRef = useRef<AbortController | null>(null);
  const analyzerJobRef = useRef<{ payloadKey: string; asyncJobId: string } | null>(null);
  const draftSupportJobRef = useRef<{ payloadKey: string; asyncJobId: string } | null>(null);

  const handleCloseCreate = useCallback(() => {
    if (createAnalyzing || createSaving) return;
    createAbortRef.current?.abort();
    setCreateOpen(false);
    setCreateError(null);
    setCreateStep("idea");
    setCreateIdea("");
    setCreateProcessingLabel("");
    setCreateAnalyzerSegments(null);
    setCreateMatches([]);
    setCreateDraftMeta(null);
    setCreateDraftAnalysis(null);
    setCreateDraftReviewConfirmed(false);
    setCreateDraftAnalyzing(false);
    setCreateAnalyzerFailed(false);
    setCreateSurpriseLoading(false);
    setCreateTitle("");
    setCreateContent("");
    setCreateFieldValues(getDefaultCreateFieldValues());
    setCreateDetailsOpen(false);
    setCreatePreviewMarkdown(false);
    analyzerJobRef.current = null;
    draftSupportJobRef.current = null;
  }, [createAnalyzing, createSaving]);

  const editAbortRef = useRef<AbortController | null>(null);

  const loadEditArticle = useCallback(
    async (id: string) => {
      if (!sourceArticleEndpoint) {
        setEditError("Knowledge Base endpoint is not configured for this agent.");
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
        if (authHeader) {
          headers.Authorization = authHeader;
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

        const normalizedArticle =
          articleObj && typeof articleObj === "object" ? (articleObj as Record<string, unknown>) : {};
        const articleFields = resolveArticleFields(normalizedArticle);
        setEditTitle(deriveArticleTitle(articleFields));
        setEditContent(deriveArticleContent(articleFields));

        const normalizedFields = normalizeEditableFields(articleFields);
        for (const field of ARTICLE_DETAIL_FIELDS) {
          if (!(field.key in normalizedFields)) {
            normalizedFields[field.key] = MULTI_VALUE_FIELDS.has(field.key) ? [] : "";
          }
        }

        setEditFieldValues(normalizedFields);
        editFieldOriginalKeys.current = new Set(
          Object.entries(normalizedFields)
            .filter(([, value]) => hasEditableFieldValue(value))
            .map(([key]) => key),
        );
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
    [authHeader, kbKeyName, kbKeyValue, sourceArticleEndpoint],
  );

  const handleOpenEdit = useCallback(
    (id: string) => {
      if (!id) return;
      setCreateSuccess(null);
      setEditError(null);
      setEditDetailsOpen(false);
      setEditId(id);
      setEditTitle("");
      setEditContent("");
      setEditFieldValues({});
      editFieldOriginalKeys.current = new Set();
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
    setEditFieldValues({});
    setEditDetailsOpen(false);
    editFieldOriginalKeys.current = new Set();
  }, [editSaving]);

  const handleSaveEdit = useCallback(async () => {
    if (!sourceArticleEndpoint) {
      setEditError("Knowledge Base endpoint is not configured for this agent.");
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

    const extraPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editFieldValues)) {
      if (READ_ONLY_FIELDS.has(key)) {
        continue;
      }
      const wasOriginal = editFieldOriginalKeys.current.has(key);
      if (Array.isArray(value)) {
        const cleaned = value.map((entry) => entry.trim()).filter(Boolean);
        if (cleaned.length || wasOriginal) {
          extraPayload[key] = cleaned;
        }
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.length || wasOriginal) {
        extraPayload[key] = trimmed;
      }
    }
    const fieldsPayload = {
      ...extraPayload,
      Title: title,
      Content: content,
    };

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
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const res = await fetch(sourceArticleEndpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ id: editId, fields: fieldsPayload }),
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
    authHeader,
    editContent,
    editFieldValues,
    editId,
    editTitle,
    filters,
    handleCloseEdit,
    kbKeyName,
    kbKeyValue,
    loadArticles,
    sourceArticleEndpoint,
  ]);

  const chatRequestSchema = (session?.config as any)?.chat_api_request_schema;
  const chatUserId = derivedUserId || session?.user_id;

  const sendChatAgentRequest = useCallback(
    async ({
      agent,
      message,
      signal,
      asyncJobId,
      onJobUpdate,
    }: {
      agent: string;
      message: string;
      signal: AbortSignal;
      asyncJobId?: string;
      onJobUpdate?: (job: AsyncJobResponse) => void;
    }) => {
      const endpoint = String(chatEndpoint ?? "").trim();
      if (!endpoint) {
        throw new Error("Chat API endpoint is not configured for this agent.");
      }
      const userIdentifier = String(chatUserId ?? "").trim();
      if (!userIdentifier) {
        throw new Error("Unable to resolve user identity.");
      }

      const headers: Record<string, string> = {
        accept: "application/json",
        "Content-Type": "application/json",
      };
      if (chatKeyValue) {
        headers[chatKeyName] = chatKeyValue;
      }
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const requestPayload = buildRequestFromSchema(chatRequestSchema, message, userIdentifier);
      (requestPayload as Record<string, unknown>).llm = "gemini";
      (requestPayload as Record<string, unknown>).agent = agent;
      (requestPayload as Record<string, unknown>).user_id = userIdentifier;
      if (!("userId" in requestPayload)) {
        (requestPayload as Record<string, unknown>).userId = userIdentifier;
      }
      if (!("message" in requestPayload)) {
        (requestPayload as Record<string, unknown>).message = message;
      }

      if (agent === "kb-analyzer") {
        const resolvedJobId = String(asyncJobId ?? "").trim() || createUuidV4();
        (requestPayload as Record<string, unknown>).async_job_id = resolvedJobId;
      }

      const started = await startChat({
        endpoint,
        headers,
        body: requestPayload,
        signal,
      });

      if (isAsyncJobResponse(started)) {
        const completed = await pollChatJob({
          chatEndpoint: endpoint,
          initial: started,
          headers,
          signal,
          onUpdate: onJobUpdate,
        });

        if (completed.result && typeof completed.result === "object") {
          return completed.result as ChatSyncResponse;
        }

        throw new Error("Async analyzer job completed without a result payload.");
      }

      return started as ChatSyncResponse;
    },
    [authHeader, chatEndpoint, chatKeyName, chatKeyValue, chatRequestSchema, chatUserId],
  );

  const runCreatorDraft = useCallback(
    async (idea: string, signal: AbortSignal) => {
      const creatorMessage = [
        "Create a new KB article.",
        "",
        "ARTICLE IDEA:",
        idea,
        "",
        "If there are overlapping articles, make this draft clearly non-duplicative and non-conflicting (narrow scope, add references, or clarify what's different). Output JSON only.",
      ].join("\n");

      const payload = await sendChatAgentRequest({
        agent: "kb-creator",
        message: creatorMessage,
        signal,
      });

      const rawText = extractChatText(payload);
      const parsed = safeParseJsonFromText(rawText);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("The KB creator did not return valid JSON.");
      }

      const record = parsed as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const content = typeof record.content === "string" ? record.content : "";
      if (!title && !content) {
        throw new Error("The KB creator response is missing title/content.");
      }

      const normalizeList = (value: unknown) => {
        if (!Array.isArray(value)) return [];
        return value
          .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry)))
          .filter(Boolean);
      };

      return {
        title,
        content,
        meta: {
          source_ids_and_titles_used: normalizeList(record.source_ids_and_titles_used),
          assumptions: normalizeList(record.assumptions),
          open_questions: normalizeList(record.open_questions),
        },
      };
    },
    [sendChatAgentRequest],
  );

  const handleSurpriseMe = useCallback(async () => {
    handleOpenCreate();
    if (!chatEndpoint) {
      setCreateError("Chat API endpoint is not configured for this agent.");
      return;
    }

    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;

    setCreateError(null);
    setCreateSurpriseLoading(true);
    try {
      const payload = await sendChatAgentRequest({
        agent: "kb-expert",
        message: surprisePrompt,
        signal: controller.signal,
      });

      const suggestion = extractChatText(payload).trim();
      if (!suggestion) {
        throw new Error("No suggestion returned. Please try again.");
      }
      setCreateIdea(suggestion);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("[KbArticlesContent] Surprise Me failed", err);
      setCreateError(err instanceof Error && err.message ? err.message : "Unable to fetch a suggestion right now.");
    } finally {
      setCreateSurpriseLoading(false);
    }
  }, [chatEndpoint, handleOpenCreate, sendChatAgentRequest, surprisePrompt]);

  const handleAnalyzeAndDraft = useCallback(async () => {
    const idea = createIdea.trim();
    if (!idea) {
      setCreateError("Please describe the article idea first.");
      setCreateStep("idea");
      return;
    }
    if (!chatEndpoint) {
      setCreateError("Chat API endpoint is not configured for this agent.");
      setCreateStep("idea");
      return;
    }

    const analyzerMessage = [
      "ARTICLE IDEA:",
      idea,
      "",
      "(Write the idea in multiple sentences or bullet points so each claim can be matched.)",
    ].join("\n");
    const payloadKey = analyzerMessage;
    const reuseJob = !createAnalyzerFailed && analyzerJobRef.current?.payloadKey === payloadKey;
    const asyncJobId = reuseJob ? analyzerJobRef.current!.asyncJobId : createUuidV4();
    analyzerJobRef.current = { payloadKey, asyncJobId };

    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;

    setCreateError(null);
    setCreateAnalyzerFailed(false);
    setCreateMatches([]);
    setCreateTitle("");
    setCreateContent("");
    setCreateDraftMeta(null);
    setCreateDraftAnalysis(null);
    setCreateDraftReviewConfirmed(false);
    setCreateAnalyzerSegments(null);
    setCreateAnalyzing(true);
    setCreateProcessingLabel("Thinking about duplicates & conflicts...");
    setCreateStep("processing");

    try {
      const analyzerPayload = await sendChatAgentRequest({
        agent: "kb-analyzer",
        message: analyzerMessage,
        signal: controller.signal,
        asyncJobId,
        onJobUpdate: (job) => {
          const status = String(job.status ?? "").toUpperCase();
          if (status === "FAILED") {
            setCreateAnalyzerFailed(true);
          }
          if (status === "RETRY") {
            setCreateProcessingLabel("Still thinking...");
            return;
          }
          if (status === "PENDING") {
            setCreateProcessingLabel("Queued... thinking...");
            return;
          }
          setCreateProcessingLabel("Thinking...");
        },
      });

      const analyzerText = extractChatText(analyzerPayload);
      const analyzerJson = safeParseJsonFromText(analyzerText);
      if (!analyzerJson) {
        throw new Error("The analyzer response was not valid JSON.");
      }

      const segments = normalizeAnalyzerSegments(analyzerJson);
      setCreateAnalyzerSegments(segments);
      const matches = computeSimilarArticles(segments).filter(
        (match) => match.confidence >= ANALYZER_CONFIDENCE_THRESHOLD,
      );

      if (matches.length > 0) {
        setCreateMatches(matches);
        setCreateStep("decision");
        return;
      }

      setCreateProcessingLabel("Drafting a new knowledge base article...");
      const drafted = await runCreatorDraft(idea, controller.signal);
      setCreateTitle(drafted.title);
      setCreateContent(drafted.content);
      setCreateDraftMeta(drafted.meta);
      setCreateStep("editor");
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("[KbArticlesContent] Smart draft wizard failed", err);
      setCreateError(err instanceof Error && err.message ? err.message : "Unable to draft an article right now.");
      setCreateStep("idea");
    } finally {
      setCreateAnalyzing(false);
      setCreateProcessingLabel("");
    }
  }, [
    chatEndpoint,
    createAnalyzerFailed,
    createIdea,
    runCreatorDraft,
    sendChatAgentRequest,
  ]);

  const handleIgnoreDuplicates = useCallback(async () => {
    const idea = createIdea.trim();
    if (!idea) {
      setCreateError("Please describe the article idea first.");
      setCreateStep("idea");
      return;
    }

    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;

    setCreateError(null);
    setCreateDraftMeta(null);
    setCreateDraftAnalysis(null);
    setCreateDraftReviewConfirmed(false);
    setCreateAnalyzing(true);
    setCreateProcessingLabel("Drafting a new knowledge base article...");
    setCreateStep("processing");

    try {
      const drafted = await runCreatorDraft(idea, controller.signal);
      setCreateTitle(drafted.title);
      setCreateContent(drafted.content);
      setCreateDraftMeta(drafted.meta);
      setCreateStep("editor");
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("[KbArticlesContent] kb-creator failed", err);
      setCreateError(err instanceof Error && err.message ? err.message : "Unable to draft an article right now.");
      setCreateStep("decision");
    } finally {
      setCreateAnalyzing(false);
      setCreateProcessingLabel("");
    }
  }, [createIdea, runCreatorDraft]);

  const handleEditDuplicate = useCallback(
    (matchId: string) => {
      const resolvedId = String(matchId ?? "").trim();
      if (!resolvedId) return;
      createAbortRef.current?.abort();
      setCreateOpen(false);
      setCreateError(null);
      setCreateStep("idea");
      setCreateIdea("");
      setCreateMatches([]);
      setCreateAnalyzerSegments(null);
      setCreateDraftMeta(null);
      setCreateDraftAnalysis(null);
      setCreateDraftReviewConfirmed(false);
      setCreateTitle("");
      setCreateContent("");
      handleOpenEdit(resolvedId);
    },
    [handleOpenEdit],
  );

  const handleCreate = useCallback(async () => {
    if (!sourceArticleEndpoint) {
      setCreateError("Knowledge Base endpoint is not configured for this agent.");
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
    if (createDraftAnalysis?.flagged && !createDraftReviewConfirmed) {
      setCreateError("Please review the unsupported segments and confirm before saving.");
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
      if (authHeader) {
        headers.Authorization = authHeader;
      }

      const fieldsPayload: Record<string, unknown> = { Title: title, Content: content };
      for (const [key, value] of Object.entries(createFieldValues)) {
        if (READ_ONLY_FIELDS.has(key) || HIDDEN_FIELDS.has(key)) {
          continue;
        }
        if (Array.isArray(value)) {
          const cleaned = value.map((entry) => entry.trim()).filter(Boolean);
          if (cleaned.length) {
            fieldsPayload[key] = cleaned;
          }
          continue;
        }
        const trimmed = value.trim();
        if (trimmed) {
          fieldsPayload[key] = trimmed;
        }
      }

      const res = await fetch(sourceArticleEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields: fieldsPayload }),
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
    authHeader,
    createContent,
    createFieldValues,
    createDraftAnalysis,
    createDraftReviewConfirmed,
    createTitle,
    filters,
    kbKeyName,
    kbKeyValue,
    loadArticles,
    sourceArticleEndpoint,
  ]);

  const handleAnalyzeDraftSupport = useCallback(async () => {
    const draftContent = createContent.trim();
    if (!draftContent) {
      setCreateError("Draft content is required to run the support check.");
      return;
    }
    if (!chatEndpoint) {
      setCreateError("Chat API endpoint is not configured for this agent.");
      return;
    }

    const payloadKey = draftContent;
    const reuseJob = draftSupportJobRef.current?.payloadKey === payloadKey;
    const asyncJobId = reuseJob ? draftSupportJobRef.current!.asyncJobId : createUuidV4();
    draftSupportJobRef.current = { payloadKey, asyncJobId };

    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;

    setCreateError(null);
    setCreateDraftAnalyzing(true);
    try {
      const payload = await sendChatAgentRequest({
        agent: "kb-analyzer",
        message: draftContent,
        signal: controller.signal,
        asyncJobId,
      });

      const analyzerText = extractChatText(payload);
      const analyzerJson = safeParseJsonFromText(analyzerText);
      if (!analyzerJson) {
        throw new Error("The analyzer response was not valid JSON.");
      }

      const segments = normalizeAnalyzerSegments(analyzerJson);
      const unsupported = segments.filter(
        (segment) =>
          !segment.source_id ||
          normalizeConfidence(segment.confidence) < ANALYZER_CONFIDENCE_THRESHOLD,
      );

      const totalSegments = segments.length;
      const unsupportedCount = unsupported.length;
      const ratio = totalSegments ? unsupportedCount / totalSegments : 0;
      const minUnsupported = totalSegments <= 1 ? 1 : 2;
      const flagged = totalSegments > 0 && ratio >= 0.25 && unsupportedCount >= minUnsupported;

      setCreateDraftAnalysis({ segments, unsupported, flagged });
      setCreateDraftReviewConfirmed(false);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("[KbArticlesContent] Draft support check failed", err);
      setCreateError(
        err instanceof Error && err.message ? err.message : "Unable to analyze this draft right now.",
      );
    } finally {
      setCreateDraftAnalyzing(false);
    }
  }, [chatEndpoint, createContent, sendChatAgentRequest]);

  if (sessionLoading || userLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-dark-5 dark:text-dark-6">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        Loading agent settings...
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
              Agent KB endpoint is not configured for this agent.
            </p>
          </div>
          <Link
            href={sessionEditHref}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Configure Agent
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
            Agent:{" "}
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
            Back to Agent
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
            Add With AI
          </button>
          <button
            type="button"
            onClick={handleOpenManualCreate}
            className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => void handleSurpriseMe()}
            className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary/20 dark:border-primary/40 dark:bg-primary/10 dark:text-primary"
          >
            Surprise Me
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
              value={voiceCallStatus}
              onChange={(event) => setVoiceCallStatus(event.target.value)}
              placeholder="VoiceCallStatus (comma-separated)"
              className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-xs text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            />
            <input
              type="text"
              value={webStatus}
              onChange={(event) => setWebStatus(event.target.value)}
              placeholder="WebStatus (comma-separated)"
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
              <th className="px-4 py-3">VoiceCallStatus</th>
              <th className="px-4 py-3">WebStatus</th>
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
              const intranet = getFirstString(article, ["IntranetStatus", "intranet_status", "intranetStatus"]) || "--";
              const whatsapp = getFirstString(article, ["WhatsAppStatus", "whatsapp_status", "whatsAppStatus"]) || "--";
              const voiceCall = getFirstString(article, ["VoiceCallStatus", "voice_call_status", "voiceCallStatus"]) || "--";
              const web = getFirstString(article, ["WebStatus", "web_status", "webStatus"]) || "--";
              const access = getFirstString(article, ["AccessLevel", "access_level", "accessLevel"]) || "--";
              const channelValue = getFirstString(article, ["Channel", "channel"]) || "--";
              const updated = formatUpdatedAt(article);

              return (
                <tr key={`${id || "article"}-${index}`}>
                  <td className="px-4 py-3 font-medium text-dark dark:text-white">
                    {id ? (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(id)}
                        className="text-left text-primary underline-offset-2 hover:underline"
                      >
                        {title}
                      </button>
                    ) : (
                      title
                    )}
                  </td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{intranet}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{whatsapp}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{voiceCall}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{web}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{access}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{channelValue}</td>
                  <td className="px-4 py-3 text-dark-5 dark:text-dark-6">{updated}</td>
                </tr>
              );
            })}

            {!loading && articles.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-sm text-dark-5 dark:text-dark-6" colSpan={8}>
                  No knowledgebase articles found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        portalMounted ? (
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-dark/70 p-4"
              role="dialog"
              aria-modal="true"
              onClick={handleCloseCreate}
            >
              <div
                className="w-full max-w-[58rem] rounded-xl bg-white p-5 shadow-2xl dark:bg-dark-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-dark dark:text-white">Smart Draft Wizard</div>
                    <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                      Draft a new knowledge base article, check for duplicates, then save.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseCreate}
                    className="rounded-lg border border-stroke px-3 py-1 text-xs font-semibold text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                    disabled={createAnalyzing || createSaving}
                  >
                    Close
                  </button>
                </div>

                {createStep === "idea" ? (
                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                      Article Idea
                    </label>
                    {createSurpriseLoading ? (
                      <div className="mb-2 flex items-center gap-2 text-xs text-dark-5 dark:text-dark-6">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
                        Finding a high-value topic to draft...
                      </div>
                    ) : null}
                    <textarea
                      value={createIdea}
                      onChange={(e) => {
                        setCreateIdea(e.target.value);
                        setCreateError(null);
                        setCreateAnalyzerFailed(false);
                        analyzerJobRef.current = null;
                      }}
                      className="custom-scrollbar h-40 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                      placeholder='Describe what this article should cover... (e.g., "How to replace the CO2 cylinder for Quooker CUBE in UAE")'
                      disabled={createSurpriseLoading || createAnalyzing || createSaving}
                    />

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
                        disabled={createAnalyzing || createSaving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAnalyzeAndDraft()}
                        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={createSurpriseLoading || createAnalyzing || createSaving || !createIdea.trim()}
                      >
                        {createAnalyzerFailed ? "Try Again" : "Draft"}
                      </button>
                    </div>
                  </div>
                ) : null}

            {createStep === "processing" ? (
              <div className="mt-6 flex flex-col items-center gap-4 text-center">
                <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
                <div className="text-sm font-semibold text-dark dark:text-white">
                  {createProcessingLabel || "Working on it..."}
                </div>
                <div className="text-xs text-dark-5 dark:text-dark-6">This may take up to a minute.</div>
                <button
                  type="button"
                  onClick={() => {
                    createAbortRef.current?.abort();
                    setCreateAnalyzing(false);
                    setCreateError(null);
                    setCreateProcessingLabel("");
                    setCreateStep("idea");
                  }}
                  className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {createStep === "decision" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/20 dark:text-yellow-100">
                  Similar articles found:
                </div>

                <div className="space-y-2">
                  {createMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-stroke bg-white px-3 py-3 text-sm shadow-sm dark:border-dark-3 dark:bg-dark-2"
                    >
                      <div className="min-w-[220px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-dark dark:text-white">{match.title}</div>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {(match.confidence * 10).toFixed(1)}/10
                          </span>
                        </div>
                        {match.segments.length ? (
                          <div className="mt-2 space-y-2 text-xs text-dark-5 dark:text-dark-6">
                            {match.segments.map((segment, idx) => (
                              <div
                                key={`${match.id}-${idx}`}
                                className="rounded-md bg-gray-2 px-2 py-2 dark:bg-dark-3"
                              >
                                <div className="whitespace-pre-wrap">{segment.segment_text}</div>
                                {segment.supporting_quote ? (
                                  <div className="mt-1 border-l-2 border-primary/40 pl-2 text-[11px] text-dark-6 dark:text-dark-7">
                                    {segment.supporting_quote}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditDuplicate(match.id)}
                        className="rounded-lg border border-stroke px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>

                {createError ? (
                  <div className="rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                    {createError}
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateStep("idea")}
                    className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                    disabled={createAnalyzing || createSaving}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleIgnoreDuplicates}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={createAnalyzing || createSaving}
                  >
                    Ignore &amp; Create New
                  </button>
                </div>
              </div>
            ) : null}

            {createStep === "editor" ? (
              <div className="mt-4">
                <div>
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

                <div className="mt-4 rounded-lg border border-stroke bg-gray-1/40 p-4 dark:border-dark-3 dark:bg-dark-3/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                        Article Settings
                      </div>
                      <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                        Set status and access level values for this article.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateDetailsOpen((prev) => !prev)}
                      className="rounded-full border border-stroke px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                      disabled={createSaving}
                    >
                      {createDetailsOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                  {createDetailsOpen ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {CREATE_DETAIL_FIELDS.map((field) => {
                        const value = createFieldValues[field.key] ?? "";
                        const stringValue = Array.isArray(value) ? value.join(", ") : value;
                        const options = fieldOptions?.[field.key] ?? [];

                        if (options.length) {
                          const uniqueOptions = Array.from(
                            new Set(stringValue ? [stringValue, ...options] : options),
                          );
                          return (
                            <div key={field.key} className="space-y-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                                {field.label}
                              </label>
                              <select
                                value={stringValue}
                                onChange={(event) => handleCreateFieldChange(field.key, event.target.value)}
                                className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                                disabled={createSaving}
                              >
                                <option value="">Not set</option>
                                {uniqueOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }

                        return (
                          <div key={field.key} className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                              {field.label}
                            </label>
                            <input
                              type="text"
                              value={stringValue}
                              onChange={(event) => handleCreateFieldChange(field.key, event.target.value)}
                              className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                              disabled={createSaving}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                      Content
                    </label>
                    <button
                      type="button"
                      onClick={() => setCreatePreviewMarkdown((prev) => !prev)}
                      className="rounded-full border border-stroke px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                      disabled={createSaving}
                    >
                      {createPreviewMarkdown ? "Edit Markdown" : "Preview Markdown"}
                    </button>
                  </div>
                  {createPreviewMarkdown ? (
                    <div className="custom-scrollbar h-40 w-full overflow-auto rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark transition dark:border-dark-3 dark:bg-dark-2 dark:text-white">
                      {createContent.trim() ? (
                        <ReactMarkdown components={DRAFT_MARKDOWN_COMPONENTS}>
                          {createContent}
                        </ReactMarkdown>
                      ) : (
                        <div className="text-sm text-dark-5 dark:text-dark-6">
                          No content to preview yet.
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={createContent}
                      onChange={(e) => {
                        setCreateContent(e.target.value);
                        if (createDraftAnalysis) {
                          setCreateDraftAnalysis(null);
                          setCreateDraftReviewConfirmed(false);
                        }
                      }}
                      className="custom-scrollbar h-40 w-full resize-none rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                      placeholder="Review and refine the draft (Markdown is supported)."
                      disabled={createSaving}
                    />
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-stroke bg-gray-2/40 p-4 dark:border-dark-3 dark:bg-dark-3/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                        Draft Insights
                      </div>
                      <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                        Review sources, assumptions, open questions, and run a support check before saving.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAnalyzeDraftSupport()}
                      className="rounded-lg border border-stroke bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
                      disabled={createSaving || createDraftAnalyzing || !createContent.trim()}
                    >
                      {createDraftAnalyzing
                        ? "Checking..."
                        : createDraftAnalysis
                          ? "Re-check Support"
                          : "Check Support"}
                    </button>
                  </div>

                  {createDraftAnalysis ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Segments
                        </div>
                        <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
                          {createDraftAnalysis.segments.length}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Supported
                        </div>
                        <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
                          {Math.max(0, createDraftAnalysis.segments.length - createDraftAnalysis.unsupported.length)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Unsupported
                        </div>
                        <div className="mt-1 text-lg font-semibold text-dark dark:text-white">
                          {createDraftAnalysis.unsupported.length}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-dark-5 dark:text-dark-6">
                      Support check not run yet. Click “Check Support” to see which claims map back to existing KB
                      articles.
                    </div>
                  )}

                  {createDraftAnalysis && createDraftAnalysis.unsupported.length ? (
                    <div className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                        Unsupported / low-confidence segments
                      </div>
                      <div className="custom-scrollbar mt-2 max-h-44 space-y-2 overflow-auto pr-1">
                        {createDraftAnalysis.unsupported.map((segment, idx) => (
                          <div
                            key={`unsupported-${idx}`}
                            className="rounded-md border border-stroke bg-white px-3 py-2 text-xs text-dark shadow-sm dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                          >
                            <div className="whitespace-pre-wrap">{segment.segment_text}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-dark-5 dark:text-dark-6">
                              <span>Confidence: {(normalizeConfidence(segment.confidence) * 10).toFixed(1)}/10</span>
                              {segment.source_title ? <span>Source: {segment.source_title}</span> : <span>No match</span>}
                            </div>
                            {segment.supporting_quote ? (
                              <div className="mt-2 border-l-2 border-primary/40 pl-2 text-[11px] text-dark-6 dark:text-dark-7">
                                {segment.supporting_quote}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {createDraftAnalysis?.flagged ? (
                    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/20 dark:text-yellow-100">
                      Several segments could not be confidently matched to existing KB articles. Review carefully before
                      saving.
                    </div>
                  ) : null}

                  {createDraftAnalysis?.flagged ? (
                    <label className="mt-3 flex items-start gap-2 text-xs text-dark-5 dark:text-dark-6">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-stroke text-primary focus:ring-primary dark:border-dark-3"
                        checked={createDraftReviewConfirmed}
                        onChange={(e) => setCreateDraftReviewConfirmed(e.target.checked)}
                      />
                      <span>I reviewed the unsupported segments and want to save this draft anyway.</span>
                    </label>
                  ) : null}

                  {createDraftMeta ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="flex h-28 flex-col rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Sources Used
                        </div>
                        <div className="custom-scrollbar mt-2 flex-1 overflow-auto pr-1">
                          {createDraftMeta.source_ids_and_titles_used.length ? (
                            <ul className="space-y-1 text-xs text-dark dark:text-white">
                              {createDraftMeta.source_ids_and_titles_used.map((entry, idx) => (
                                <li key={`src-${idx}`} className="break-words">
                                  {entry}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-dark-5 dark:text-dark-6">No sources returned.</div>
                          )}
                        </div>
                      </div>
                      <div className="flex h-28 flex-col rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Assumptions
                        </div>
                        <div className="custom-scrollbar mt-2 flex-1 overflow-auto pr-1">
                          {createDraftMeta.assumptions.length ? (
                            <ul className="space-y-1 text-xs text-dark dark:text-white">
                              {createDraftMeta.assumptions.map((entry, idx) => (
                                <li key={`asm-${idx}`} className="break-words">
                                  {entry}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-dark-5 dark:text-dark-6">No assumptions returned.</div>
                          )}
                        </div>
                      </div>
                      <div className="flex h-28 flex-col rounded-lg bg-white px-3 py-3 shadow-sm dark:bg-dark-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                          Open Questions
                        </div>
                        <div className="custom-scrollbar mt-2 flex-1 overflow-auto pr-1">
                          {createDraftMeta.open_questions.length ? (
                            <ul className="space-y-1 text-xs text-dark dark:text-white">
                              {createDraftMeta.open_questions.map((entry, idx) => (
                                <li key={`oq-${idx}`} className="break-words">
                                  {entry}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-dark-5 dark:text-dark-6">No open questions returned.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {createError ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-light-5 px-3 py-2 text-sm text-red shadow-sm">
                    {createError}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateStep(createMatches.length ? "decision" : "idea")}
                    className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                    disabled={createSaving}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      createSaving ||
                      createDraftAnalyzing ||
                      (createDraftAnalysis?.flagged && !createDraftReviewConfirmed)
                    }
                  >
                    {createSaving
                      ? "Saving..."
                      : createDraftAnalysis?.flagged && !createDraftReviewConfirmed
                        ? "Review to Save"
                        : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
              </div>
            </div>,
            document.body,
          )
        ) : null
      ) : null}

      {editOpen ? (
        portalMounted ? (
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-dark/70 p-4"
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
                    <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                      Update the article and save to publish.
                    </div>
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

            <div className="mt-4 rounded-lg border border-stroke bg-gray-1/40 p-4 dark:border-dark-3 dark:bg-dark-3/30">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                    Details
                  </div>
                  <div className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                    Edit status, access, and channel fields.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDetailsOpen((prev) => !prev)}
                  className="rounded-full border border-stroke px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-dark transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                  disabled={editLoading || editSaving}
                >
                  {editDetailsOpen ? "Hide" : "Show"}
                </button>
              </div>
              {editDetailsOpen ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ARTICLE_DETAIL_FIELDS.map((field) => {
                      const value = editFieldValues[field.key] ?? (MULTI_VALUE_FIELDS.has(field.key) ? [] : "");
                      const options = fieldOptions?.[field.key] ?? [];

                      if (MULTI_VALUE_FIELDS.has(field.key)) {
                        const selected = normalizeStringArray(value);
                        if (options.length) {
                          return (
                            <div key={field.key} className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                                {field.label}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {options.map((option) => {
                                  const checked = selected.includes(option);
                                  return (
                                    <label
                                      key={option}
                                      className="flex items-center gap-2 rounded-full border border-stroke px-3 py-1 text-xs text-dark transition hover:bg-gray-2 dark:border-dark-3 dark:text-white dark:hover:bg-dark-3"
                                    >
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-stroke text-primary focus:ring-primary dark:border-dark-3"
                                        checked={checked}
                                        onChange={() => {
                                          const next = checked
                                            ? selected.filter((item) => item !== option)
                                            : [...selected, option];
                                          handleEditFieldChange(field.key, next);
                                        }}
                                        disabled={editLoading || editSaving}
                                      />
                                      <span>{option}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={field.key} className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                              {field.label}
                            </label>
                            <input
                              type="text"
                              value={selected.join(", ")}
                              onChange={(event) =>
                                handleEditFieldChange(field.key, parseCommaList(event.target.value))
                              }
                              placeholder="Channel (comma-separated)"
                              className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                              disabled={editLoading || editSaving}
                            />
                          </div>
                        );
                      }

                      const stringValue = Array.isArray(value) ? value.join(", ") : value;
                      if (options.length) {
                        return (
                          <div key={field.key} className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                              {field.label}
                            </label>
                            <select
                              value={stringValue}
                              onChange={(event) => handleEditFieldChange(field.key, event.target.value)}
                              className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                              disabled={editLoading || editSaving}
                            >
                              <option value="">Not set</option>
                              {options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      return (
                        <div key={field.key} className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                            {field.label}
                          </label>
                          <input
                            type="text"
                            value={stringValue}
                            onChange={(event) => handleEditFieldChange(field.key, event.target.value)}
                            className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                            disabled={editLoading || editSaving}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {Object.keys(editFieldValues).filter((key) => !ARTICLE_DETAIL_FIELD_KEYS.has(key)).length ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                        Other Fields
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.keys(editFieldValues)
                          .filter((key) => !ARTICLE_DETAIL_FIELD_KEYS.has(key))
                          .map((key) => {
                            const value = editFieldValues[key];
                            const stringValue = Array.isArray(value) ? value.join(", ") : value;
                            const isReadOnly = READ_ONLY_FIELDS.has(key);
                            return (
                              <div key={key} className="space-y-2">
                                <label className="text-[11px] font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                                  {key}
                                </label>
                                <input
                                  type="text"
                                  value={stringValue}
                                  onChange={(event) => handleEditFieldChange(key, event.target.value)}
                                  className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                                  readOnly={isReadOnly}
                                  disabled={editLoading || editSaving}
                                />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
            </div>,
            document.body,
          )
        ) : null
      ) : null}
    </>
  );
}
