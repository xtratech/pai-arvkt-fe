export type SourceArticleRecord = Record<string, unknown>;

export type SourceArticlesFilters = {
  q?: string;
  IntranetStatus?: string[];
  WhatsAppStatus?: string[];
  ZendeskStatus?: string[];
  AccessLevel?: string[];
  Channel?: string[];
  id?: string;
  ids?: string[];
};

export type FetchSourceArticlesOptions = {
  kbEndpoint: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  authHeader?: string;
  filters?: SourceArticlesFilters;
  signal?: AbortSignal;
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

export function resolveSourceArticlesEndpoint(kbEndpoint: string) {
  const normalized = normalizeBase(kbEndpoint);
  if (!normalized) return "";
  if (/\/kb$/i.test(normalized)) {
    return joinUrl(normalized, "source-articles");
  }
  return joinUrl(normalized, "kb/source-articles");
}

function splitCsv(input?: string) {
  if (!input) return [];
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildQueryParams(filters?: SourceArticlesFilters) {
  if (!filters) return new URLSearchParams();
  const params = new URLSearchParams();

  const q = typeof filters.q === "string" ? filters.q.trim() : "";
  if (q) params.set("q", q);

  const setCsvParam = (key: string, values?: string[]) => {
    const resolved = (values ?? []).map((v) => v.trim()).filter(Boolean);
    if (resolved.length) {
      params.set(key, resolved.join(","));
    }
  };

  setCsvParam("IntranetStatus", filters.IntranetStatus);
  setCsvParam("WhatsAppStatus", filters.WhatsAppStatus);
  setCsvParam("ZendeskStatus", filters.ZendeskStatus);
  setCsvParam("AccessLevel", filters.AccessLevel);
  setCsvParam("Channel", filters.Channel);

  const resolvedId = typeof filters.id === "string" ? filters.id.trim() : "";
  const resolvedIds = (filters.ids ?? []).map((value) => value.trim()).filter(Boolean);
  if (resolvedId) {
    params.set("id", resolvedId);
  } else if (resolvedIds.length === 1) {
    params.set("id", resolvedIds[0]);
  } else if (resolvedIds.length > 1) {
    params.set("ids", resolvedIds.join(","));
  }

  return params;
}

function pickArrayField(payload: unknown): SourceArticleRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === "object") as SourceArticleRecord[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.articles,
    record.items,
    record.records,
    record.sources,
    record.source_articles,
    record.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => item && typeof item === "object") as SourceArticleRecord[];
    }
  }

  return [];
}

export async function fetchSourceArticles({
  kbEndpoint,
  apiKeyName = "x-api-key",
  apiKeyValue = "",
  authHeader,
  filters,
  signal,
}: FetchSourceArticlesOptions): Promise<{
  articles: SourceArticleRecord[];
  raw: unknown;
  count: number | null;
}> {
  const endpoint = resolveSourceArticlesEndpoint(kbEndpoint);
  if (!endpoint) {
    return { articles: [], raw: null, count: null };
  }

  const params = buildQueryParams(filters);
  const url = new URL(endpoint);
  params.forEach((value, key) => url.searchParams.set(key, value));

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  const resolvedKeyValue = apiKeyValue.trim();
  if (resolvedKeyValue) {
    headers[apiKeyName.trim() || "x-api-key"] = resolvedKeyValue;
  }
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
    signal,
  });

  const raw = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text || null;
  });

  if (!response.ok) {
    const message =
      raw && typeof raw === "object" && "error" in raw
        ? String((raw as any).error)
        : `Failed to fetch source articles (status ${response.status})`;
    throw new Error(message);
  }

  const count =
    raw && typeof raw === "object" && "count" in raw && typeof (raw as any).count === "number"
      ? ((raw as any).count as number)
      : null;

  return { articles: pickArrayField(raw), raw, count };
}

export function parseCsvFilter(value: string) {
  return splitCsv(value);
}
