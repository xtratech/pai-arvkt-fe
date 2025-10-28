"use client";

import { apiGet, ApiClientError } from "./api-client";

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

export type SessionRecord = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  overall_score?: number;
  user_id?: string;
  notes?: string;
  knowledgebase?: Record<string, string>;
  system_prompt?: string;
  test_queries?: Array<{
    query: string;
    expected_answer?: string;
    tags?: string[];
  }>;
  config?: Record<string, unknown>;
  runs?: string[];
};

type ProfilePayload = {
  sessions?: SessionRecord[];
  session_runs?: SessionRun[];
  [key: string]: unknown;
};

const SESSIONS_PATH = process.env.NEXT_PUBLIC_SESSIONS_PATH ?? "/";

function extractSessions(payload: ProfilePayload | unknown): SessionRecord[] {
  if (!payload || typeof payload !== "object") {
    return Array.isArray(payload) ? (payload as SessionRecord[]) : [];
  }

  const candidate = payload as ProfilePayload;

  if (Array.isArray(candidate.sessions)) {
    return candidate.sessions;
  }

  if (candidate && typeof candidate === "object") {
    const nestedProfile = (candidate as any).profile;
    if (nestedProfile && Array.isArray(nestedProfile.sessions)) {
      return nestedProfile.sessions as SessionRecord[];
    }

    const nestedData = (candidate as any).data;
    if (nestedData && Array.isArray(nestedData.sessions)) {
      return nestedData.sessions as SessionRecord[];
    }
  }

  return [];
}

function extractSessionRuns(payload: ProfilePayload | unknown): SessionRun[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as ProfilePayload;

  if (Array.isArray(candidate.session_runs)) {
    return candidate.session_runs;
  }

  if ((candidate as any).profile?.session_runs) {
    const profileRuns = (candidate as any).profile.session_runs;
    if (Array.isArray(profileRuns)) {
      return profileRuns as SessionRun[];
    }
  }

  if ((candidate as any).data?.session_runs) {
    const dataRuns = (candidate as any).data.session_runs;
    if (Array.isArray(dataRuns)) {
      return dataRuns as SessionRun[];
    }
  }

  return [];
}

async function fetchProfilePayload(): Promise<ProfilePayload> {
  const data = await apiGet<ProfilePayload>(SESSIONS_PATH);
  return (data ?? {}) as ProfilePayload;
}

export async function fetchSessions(): Promise<SessionRecord[]> {
  try {
    const payload = await fetchProfilePayload();
    return extractSessions(payload);
  } catch (error) {
    handleApiError(error, "fetchSessions");
    return [];
  }
}

export async function fetchSessionDetail(sessionId: string): Promise<{
  session: SessionRecord | undefined;
  runs: SessionRun[];
}> {
  try {
    const payload = await fetchProfilePayload();
    const sessions = extractSessions(payload);
    const runs = extractSessionRuns(payload);
    return {
      session: sessions.find((item) => item.id === sessionId),
      runs: runs.filter((run) => run.session_id === sessionId),
    };
  } catch (error) {
    handleApiError(error, "fetchSessionDetail");
    return { session: undefined, runs: [] };
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
