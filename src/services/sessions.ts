"use client";

import { apiDelete, apiGet, apiPut, ApiClientError } from "./api-client";
import {
  buildKnowledgeBaseFilePath,
  buildSessionFilePath,
  buildSessionsIndexPath,
  buildSystemPromptFilePath,
} from "./storage-paths";

export type SessionRun = {
  id: string;
  session_id: string;
  timestamp?: string;
  status?: string;
  iteration_number?: number;
  validation_score?: number;
  metrics?: Record<string, unknown>;
  generated_responses?: Array<{ query_id: string; response: string }>;
  discrepancies?: Array<Record<string, unknown>>;
  suggestions?: Record<string, unknown>;
  applied_changes?: Record<string, unknown>;
  logs?: string[];
  user_feedback?: string;
};

export type SessionConfig = {
  mode?: string;
  max_iterations?: number;
  chat_api_endpoint?: string;
  chat_api_key?: string;
  chat_api_key_name?: string;
  chat_api_request_schema?: unknown;
  chat_api_response_schema?: unknown;
  train_chatbot_command?: string;
  agent_config_endpoint?: string;
  agent_config_key?: string;
  agent_config_key_name?: string;
  agent_kb_endpoint?: string;
  agent_kb_key?: string;
  agent_kb_key_name?: string;
  [key: string]: unknown;
};

export type SessionRecord = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  overall_score?: number;
  user_id?: string;
  system_prompt_file_name?: string;
  knowledgebase_file_name?: string;
  user_prompt_file_name?: string;
  system_prompt_files?: Array<{
    file_name: string;
    created_at?: string;
    updated_at?: string;
    active?: boolean;
  }>;
  knowledgebase_files?: Array<{
    file_name: string;
    created_at?: string;
    updated_at?: string;
    active?: boolean;
  }>;
  user_prompt_files?: Array<{
    file_name: string;
    created_at?: string;
    updated_at?: string;
    active?: boolean;
  }>;
  notes?: string;
  knowledgebase?: Record<string, string>;
  system_prompt?: string;
  test_queries?: Array<{
    query: string;
    expected_answer?: string;
    tags?: string[];
  }>;
  config?: SessionConfig;
  runs?: string[];
};

type ProfilePayload = {
  sessions?: SessionRecord[];
  session_runs?: SessionRun[];
  [key: string]: unknown;
};

type NewSessionInput = {
  name: string;
  status?: string;
  notes?: string;
  system_prompt_file_name?: string;
  knowledgebase_file_name?: string;
  config?: SessionConfig;
};

const SESSION_CONFIG_DEFAULTS: SessionConfig = {
  chat_api_key_name: "x-api-key",
  agent_config_key_name: "x-api-key",
  agent_kb_key_name: "x-api-key",
};

function withConfigDefaults(session: SessionRecord): SessionRecord {
  return {
    ...session,
    config: { ...SESSION_CONFIG_DEFAULTS, ...(session.config ?? {}) },
  };
}

const LEGACY_API_ENDPOINT = (process.env.NEXT_PUBLIC_USERDATA_API_ENDPOINT ?? "").trim();

function deriveLegacyBasePath(): string {
  if (!LEGACY_API_ENDPOINT) {
    return "/user-data/:userId";
  }

  try {
    const parsed = new URL(LEGACY_API_ENDPOINT);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.at(-1) === "user-data") {
      return ":userId";
    }
  } catch {
    // ignore parsing failures and fall back
  }

  return "/user-data/:userId";
}

const LEGACY_BASE_PATH = deriveLegacyBasePath();

function buildLegacyUserDataPath(userId: string) {
  const encodedUserId = encodeURIComponent(userId);
  let template = LEGACY_BASE_PATH.length > 0 ? LEGACY_BASE_PATH : ":userId";

  if (template.includes(":userId")) {
    template = template.replace(/:userId/g, encodedUserId);
  } else {
    template = template.endsWith("/")
      ? `${template}${encodedUserId}`
      : `${template}/${encodedUserId}`;
  }

  let path = template;

  // Normalise leading slashes
  path = path.replace(/^\/+/, path.startsWith("/") ? "/" : "");

  const endpointEndsWithSlash = LEGACY_API_ENDPOINT.endsWith("/");

  if (endpointEndsWithSlash && path.startsWith("/")) {
    path = path.slice(1);
  } else if (!endpointEndsWithSlash && !path.startsWith("/")) {
    path = `/${path}`;
  }

  return path.length > 0 ? path : "/";
}

function generateSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess-${Math.random().toString(36).slice(2, 10)}`;
}

function extractSessions(payload: ProfilePayload | unknown): SessionRecord[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload as SessionRecord[];
  }

  if (typeof payload !== "object") {
    return [];
  }

  const candidate = payload as ProfilePayload;

  if (Array.isArray(candidate.sessions)) {
    return candidate.sessions;
  }

  const profileSessions = (candidate as any)?.profile?.sessions;
  if (Array.isArray(profileSessions)) {
    return profileSessions as SessionRecord[];
  }

  const dataSessions = (candidate as any)?.data?.sessions;
  if (Array.isArray(dataSessions)) {
    return dataSessions as SessionRecord[];
  }

  return [];
}

function extractSessionRuns(payload: ProfilePayload | unknown): SessionRun[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as ProfilePayload;

  const directRuns = (candidate as any)?.runs;
  if (Array.isArray(directRuns)) {
    return directRuns as SessionRun[];
  }

  if (Array.isArray(candidate.session_runs)) {
    return candidate.session_runs;
  }

  const profileRuns = (candidate as any)?.profile?.session_runs;
  if (Array.isArray(profileRuns)) {
    return profileRuns as SessionRun[];
  }

  const dataRuns = (candidate as any)?.data?.session_runs;
  if (Array.isArray(dataRuns)) {
    return dataRuns as SessionRun[];
  }

  return [];
}

async function fetchLegacyProfilePayload(userId: string): Promise<ProfilePayload> {
  const path = buildLegacyUserDataPath(userId);
  const data = await apiGet<ProfilePayload>(path);
  return (data ?? {}) as ProfilePayload;
}

async function saveLegacyProfilePayload(userId: string, payload: ProfilePayload) {
  const path = buildLegacyUserDataPath(userId);
  const sanitized = sanitizePayload(payload);
  await apiPut(path, {
    headers: {
      "Content-Type": "application/json",
    },
    body: sanitized as Record<string, unknown>,
  });
}

function clonePayload(payload: ProfilePayload) {
  const base = payload as Record<string, any>;
  const cloned: Record<string, any> = { ...base };

  if (base.profile && typeof base.profile === "object") {
    cloned.profile = { ...base.profile };
  }

  if (base.data && typeof base.data === "object") {
    cloned.data = { ...base.data };
  }

  return cloned as ProfilePayload;
}

function assignSessions(payload: ProfilePayload, sessions: SessionRecord[]) {
  const base = payload as Record<string, any>;

  if (Array.isArray(base.sessions)) {
    base.sessions = sessions;
    return;
  }

  if (base.profile && Array.isArray(base.profile.sessions)) {
    base.profile = { ...base.profile, sessions };
    return;
  }

  if (base.data && Array.isArray(base.data.sessions)) {
    base.data = { ...base.data, sessions };
    return;
  }

  base.sessions = sessions;
}

function assignSessionRuns(payload: ProfilePayload, runs: SessionRun[]) {
  const base = payload as Record<string, any>;

  if (Array.isArray(base.session_runs)) {
    base.session_runs = runs;
    return;
  }

  if (base.profile && Array.isArray(base.profile.session_runs)) {
    base.profile = { ...base.profile, session_runs: runs };
    return;
  }

  if (base.data && Array.isArray(base.data.session_runs)) {
    base.data = { ...base.data, session_runs: runs };
    return;
  }

  base.session_runs = runs;
}

function sanitizePayload(payload: ProfilePayload): ProfilePayload {
  const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  const forbiddenKeys = new Set([
    "UserId",
    "userid",
    "createdAt",
    "created_at",
    "lastUpdated",
    "last_updated",
    "email",
    "username",
  ]);

  for (const key of forbiddenKeys) {
    if (key in copy) {
      delete copy[key];
    }
  }

  return copy as ProfilePayload;
}

async function fetchSessionsFromBucket(userId: string): Promise<SessionRecord[] | null> {
  const path = buildSessionsIndexPath(userId);
  try {
    const payload = await apiGet<ProfilePayload | SessionRecord[]>(path);
    const sessions = extractSessions(payload);
    return sessions.map(withConfigDefaults);
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return null;
    }

    handleApiError(error, "fetchSessionsFromBucket");
    return null;
  }
}

async function saveSessionsToBucket(userId: string, sessions: SessionRecord[]) {
  const path = buildSessionsIndexPath(userId);
  try {
    await apiPut(path, {
      headers: { "Content-Type": "application/json" },
      body: sessions as unknown as Record<string, unknown>,
    });
    return true;
  } catch (error) {
    handleApiError(error, "saveSessionsToBucket");
    return false;
  }
}

async function safeDeleteResource(path: string) {
  try {
    await apiDelete(path);
    return true;
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      (error.statusCode === 404 || error.statusCode === 403)
    ) {
      return true;
    }
    handleApiError(error, "deleteResource");
    return false;
  }
}

export async function fetchSessions(userId: string): Promise<SessionRecord[]> {
  const bucketSessions = await fetchSessionsFromBucket(userId);
  if (bucketSessions !== null) {
    return bucketSessions;
  }

  try {
    const payload = await fetchLegacyProfilePayload(userId);
    return extractSessions(payload).map(withConfigDefaults);
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return [];
    }
    handleApiError(error, "fetchSessions");
    return [];
  }
}

export async function fetchSessionDetail(
  sessionId: string,
  userId: string,
): Promise<{ session: SessionRecord | undefined; runs: SessionRun[] }> {
  try {
    const bucketSessions = await fetchSessionsFromBucket(userId);
    if (bucketSessions && bucketSessions.length) {
      const matched = bucketSessions.find((item) => item.id === sessionId);
        if (matched) {
          const normalized = withConfigDefaults(matched);
          return {
            session: {
              ...normalized,
            },
            runs: [],
          };
        }
    }
  } catch {
    // ignore and continue to legacy
  }

  try {
    const payload = await fetchLegacyProfilePayload(userId);
    const sessions = extractSessions(payload).map(withConfigDefaults);
    const runs = extractSessionRuns(payload);

    return {
      session: sessions.find((item) => item.id === sessionId),
      runs: runs.filter((run) => run.session_id === sessionId),
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return { session: undefined, runs: [] };
    }
    handleApiError(error, "fetchSessionDetail");
    return { session: undefined, runs: [] };
  }
}

export async function updateSession(
  userId: string,
  sessionId: string,
  patch: Partial<SessionRecord>,
): Promise<SessionRecord> {
  const applyPatch = (session: SessionRecord) => {
    const mergedConfig =
      patch.config || session.config
        ? { ...(session.config ?? {}), ...(patch.config ?? {}) }
        : undefined;
    const updated: SessionRecord = {
      ...session,
      ...patch,
      ...(mergedConfig ? { config: mergedConfig } : {}),
      updated_at: patch.updated_at ?? new Date().toISOString(),
    };
    return withConfigDefaults(updated);
  };

  // Try bucket first
  try {
    const sessions = await fetchSessionsFromBucket(userId);
    if (sessions && sessions.length) {
      const exists = sessions.some((s) => s.id === sessionId);
      if (!exists) {
        throw new Error("Session not found");
      }
      const updatedList = sessions.map((s) => (s.id === sessionId ? applyPatch(s) : s));
      const saved = await saveSessionsToBucket(userId, updatedList);
      if (saved) {
        const updated = updatedList.find((s) => s.id === sessionId);
        if (updated) return updated;
      }
    }
  } catch (error) {
    if (!(error instanceof ApiClientError && error.statusCode === 404)) {
      handleApiError(error, "updateSession (bucket)");
    }
    // fall through to legacy
  }

  // Legacy path
  const payload = await fetchLegacyProfilePayload(userId);
  const sessions = extractSessions(payload);
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) {
    throw new Error("Session not found");
  }
  const updatedSessions = sessions.map((s) => (s.id === sessionId ? applyPatch(s) : s));
  const updatedPayload = clonePayload(payload);
  assignSessions(updatedPayload, updatedSessions);
  await saveLegacyProfilePayload(userId, updatedPayload);
  const updated = updatedSessions.find((s) => s.id === sessionId);
  if (!updated) {
    throw new Error("Session not found after update");
  }
  return updated;
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  await Promise.all([
    safeDeleteResource(buildSessionFilePath(userId, sessionId)),
    safeDeleteResource(buildKnowledgeBaseFilePath(userId, sessionId)),
    safeDeleteResource(buildSystemPromptFilePath(userId, sessionId)),
  ]);

  // Try to update the bucket index first
  try {
    const sessions = await fetchSessionsFromBucket(userId);
    if (sessions && sessions.length) {
      const remaining = sessions.filter((session) => session.id !== sessionId);
      if (remaining.length !== sessions.length) {
        const saved = await saveSessionsToBucket(userId, remaining);
        if (saved) {
          return;
        }
      }
    }
  } catch {
    // ignore and fall back to legacy path
  }

  try {
    const payload = await fetchLegacyProfilePayload(userId);
    const sessions = extractSessions(payload);
    const runs = extractSessionRuns(payload);

    const remainingSessions = sessions.filter((session) => session.id !== sessionId);

    if (sessions.length === remainingSessions.length) {
      throw new Error("Session not found or already deleted.");
    }

    const remainingRuns = runs.filter((run) => run.session_id !== sessionId);

    const updatedPayload = clonePayload(payload);
    assignSessions(updatedPayload, remainingSessions);
    assignSessionRuns(updatedPayload, remainingRuns);

    await saveLegacyProfilePayload(userId, updatedPayload);
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) {
      return;
    }
    handleApiError(error, "deleteSession");
    throw error;
  }
}

export async function createSession(userId: string, input: NewSessionInput): Promise<SessionRecord> {
  const now = new Date().toISOString();
  const newSession: SessionRecord = {
    id: generateSessionId(),
    name: input.name,
    status: input.status ?? "active",
    created_at: now,
    updated_at: now,
    user_id: userId,
    notes: input.notes,
    system_prompt_file_name: input.system_prompt_file_name,
    knowledgebase_file_name: input.knowledgebase_file_name,
    config: { ...SESSION_CONFIG_DEFAULTS, ...(input.config ?? {}) },
  };

  // Try bucket first
  try {
    const sessions = (await fetchSessionsFromBucket(userId)) ?? [];
    const updated = [...sessions, newSession];
    const saved = await saveSessionsToBucket(userId, updated);
    if (saved) {
      return newSession;
    }
  } catch {
    // ignore and fall back
  }

  // Fallback to legacy
  try {
    const payload = await fetchLegacyProfilePayload(userId);
    const sessions = extractSessions(payload);
    const updatedSessions = [...sessions, newSession];
    const updatedPayload = clonePayload(payload);
    assignSessions(updatedPayload, updatedSessions);
    await saveLegacyProfilePayload(userId, updatedPayload);
    return newSession;
  } catch (error) {
    handleApiError(error, "createSession");
    throw error;
  }
}

function handleApiError(error: unknown, context: string) {
  if (error instanceof ApiClientError) {
    console.error(`[sessions] ${context} failed`, {
      statusCode: error.statusCode,
      data: error.data,
      message: error.message,
    });
  } else {
    console.error(`[sessions] Unexpected error during ${context}`, error);
  }
}
