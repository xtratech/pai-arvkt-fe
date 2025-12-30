export type ChatUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  [key: string]: unknown;
};

export type ChatSyncResponse = {
  text?: string;
  suggestions?: string[];
  usageMetadata?: ChatUsageMetadata;
  [key: string]: unknown;
};

export type AsyncJobStatus = "PENDING" | "IN_PROGRESS" | "RETRY" | "SUCCEEDED" | "FAILED" | string;

export type AsyncJobResponse = {
  async: true;
  job_id: string;
  status: AsyncJobStatus;
  poll_url?: string;
  attempts?: number;
  created_at?: number;
  updated_at?: number;
  result?: ChatSyncResponse;
  error?: unknown;
  [key: string]: unknown;
};

export type StartChatResponse = ChatSyncResponse | AsyncJobResponse;

export function isAsyncJobResponse(payload: unknown): payload is AsyncJobResponse {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (record.async !== true) return false;
  return typeof record.job_id === "string" && record.job_id.trim().length > 0;
}

export function normalizeFinalOutput(resp: StartChatResponse): {
  finalText: string;
  finalSuggestions: string[];
  finalUsage?: ChatUsageMetadata;
} {
  const record = resp as any;
  const finalText =
    (typeof record?.text === "string" ? record.text : "") ||
    (typeof record?.result?.text === "string" ? record.result.text : "");

  const suggestionsCandidate = record?.suggestions ?? record?.result?.suggestions;
  const finalSuggestions = Array.isArray(suggestionsCandidate)
    ? suggestionsCandidate.filter((item: unknown) => typeof item === "string")
    : [];

  const usage = record?.usageMetadata ?? record?.result?.usageMetadata;
  const finalUsage = usage && typeof usage === "object" ? (usage as ChatUsageMetadata) : undefined;

  return { finalText, finalSuggestions, finalUsage };
}

function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function deriveApiBaseFromChatEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const pathname = url.pathname || "";
    const lower = pathname.toLowerCase();
    const chatIndex = lower.indexOf("/chat/");
    if (chatIndex !== -1) {
      url.pathname = pathname.slice(0, chatIndex) || "/";
    } else {
      const parts = pathname.split("/").filter(Boolean);
      url.pathname = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
    }
    url.search = "";
    url.hash = "";
    return normalizeBase(url.toString());
  } catch {
    return "";
  }
}

export function resolvePollUrl(chatEndpoint: string, pollUrl: string | undefined | null, jobId: string) {
  const raw = String(pollUrl ?? "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw;

    const base = deriveApiBaseFromChatEndpoint(chatEndpoint) || normalizeBase(chatEndpoint);
    if (!base) return raw;

    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
  }

  const base = deriveApiBaseFromChatEndpoint(chatEndpoint) || normalizeBase(chatEndpoint);
  if (!base) return "";
  return `${base}/chat/job/${encodeURIComponent(jobId)}`;
}

async function readJsonOrText(res: Response) {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}

function extractErrorMessage(payload: unknown) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error ?? (record.result as any)?.error;
    if (typeof message === "string") return message;
  }
  return "";
}

export async function startChat(options: {
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
}): Promise<StartChatResponse> {
  const res = await fetch(options.endpoint, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  const payload = await readJsonOrText(res);
  if (res.status === 200 || res.status === 202) {
    return (payload ?? {}) as StartChatResponse;
  }

  const message = extractErrorMessage(payload) || `Chat request failed (status ${res.status})`;
  throw new Error(message);
}

export async function getChatJob(options: {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}): Promise<AsyncJobResponse> {
  const res = await fetch(options.url, {
    method: "GET",
    headers: options.headers,
    cache: "no-store",
    signal: options.signal,
  });

  const payload = await readJsonOrText(res);
  if (res.status === 200) {
    if (isAsyncJobResponse(payload)) return payload;
    const message =
      extractErrorMessage(payload) || "Invalid async job payload received from server.";
    throw new Error(message);
  }

  if (res.status === 404) {
    throw new Error("Async job expired or could not be found (404).");
  }

  const message = extractErrorMessage(payload) || `Failed to fetch async job (status ${res.status})`;
  throw new Error(message);
}

function jitterDelay(ms: number) {
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.max(250, Math.round(ms * jitter));
}

function sleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort);
  });
}

export async function pollChatJob(options: {
  chatEndpoint: string;
  initial: AsyncJobResponse;
  headers: Record<string, string>;
  signal: AbortSignal;
  onUpdate?: (job: AsyncJobResponse) => void;
  initialDelayMs?: number;
  timeoutMs?: number;
}): Promise<AsyncJobResponse> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? 4 * 60 * 1000;
  const initialDelayMs = options.initialDelayMs ?? 15_000;
  const schedule = [1000, 1500, 2500, 4000, 5000];

  let job = options.initial;
  options.onUpdate?.(job);
  if (String(job.status).toUpperCase() === "SUCCEEDED") {
    return job;
  }

  if (initialDelayMs > 0) {
    await sleep(initialDelayMs, options.signal);
  }

  let attempt = 0;
  while (!options.signal.aborted) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error("Async job timed out while waiting for results.");
    }

    const pollUrl = resolvePollUrl(options.chatEndpoint, job.poll_url, job.job_id);
    if (!pollUrl) {
      throw new Error("Missing poll URL for async job.");
    }

    job = await getChatJob({ url: pollUrl, headers: options.headers, signal: options.signal });
    options.onUpdate?.(job);

    const status = String(job.status ?? "").toUpperCase();
    if (status === "SUCCEEDED") {
      return job;
    }
    if (status === "FAILED") {
      const errorMessage = extractErrorMessage(job.error) || extractErrorMessage(job) || "Async job failed.";
      throw new Error(errorMessage);
    }

    const delay = schedule[Math.min(attempt, schedule.length - 1)];
    attempt += 1;
    await sleep(jitterDelay(delay), options.signal);
  }

  throw new DOMException("Aborted", "AbortError");
}
