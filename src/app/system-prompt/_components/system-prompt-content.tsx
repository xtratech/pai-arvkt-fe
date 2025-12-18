"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSessionDetail, type SessionRecord } from "@/services/sessions";
import { useUser } from "@/contexts/user-context";

type Props = {
  sessionId: string;
  initialSession?: SessionRecord | null;
};

type AgentConfig = {
  system_prompt?: string;
  suggestions_prompt?: string;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  max_output_tokens?: number;
  candidate_count?: number;
  stop_sequences?: string[];
  response_mime_type?: string;
  [key: string]: unknown;
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

function resolveAgentConfigConnection(sessionConfig: Record<string, unknown> | null | undefined) {
  const cfg = (sessionConfig ?? {}) as any;
  const endpoint = String(
    cfg.agent_config_endpoint ??
      cfg.agent_config_url ??
      cfg.agent_config_endpoint_url ??
      cfg.agent_kb_endpoint ??
      cfg.agent_kb_url ??
      cfg.agent_kb_endpoint_url ??
      "",
  ).trim();

  const keyName = String(
    cfg.agent_config_key_name ??
      cfg.agent_config_api_key_name ??
      cfg.agent_kb_key_name ??
      cfg.agent_kb_api_key_name ??
      "x-api-key",
  ).trim();

  const keyValue = String(
    cfg.agent_config_key ??
      cfg.agent_config_api_key ??
      cfg.agent_config_token ??
      cfg.agent_kb_key ??
      cfg.agent_kb_api_key ??
      cfg.agent_kb_token ??
      "",
  ).trim();

  return {
    endpoint,
    keyName: keyName || "x-api-key",
    keyValue,
  };
}

export function SystemPromptContent({
  sessionId,
  initialSession,
}: Props) {
  const { attributes, user, tokens, isLoading: userLoading } = useUser();
  const [content, setContent] = useState<string | null>(null);
  const [suggestionsPrompt, setSuggestionsPrompt] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [topK, setTopK] = useState<string>("");
  const [topP, setTopP] = useState<string>("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [candidateCount, setCandidateCount] = useState<string>("");
  const [stopSequences, setStopSequences] = useState<string>("");
  const [responseMimeType, setResponseMimeType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [hydratingSession, setHydratingSession] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const dirtyRef = useRef(false);
  const [session, setSession] = useState<SessionRecord | null>(initialSession ?? null);
  const sessionConfig = useMemo(() => session?.config ?? {}, [session]);
  const derivedUserId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const { endpoint: agentConfigEndpoint, keyName: agentConfigKeyName, keyValue: agentConfigKeyValue } =
    useMemo(() => resolveAgentConfigConnection(sessionConfig as Record<string, unknown>), [sessionConfig]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  const applyConfigToForm = useCallback(
    (cfg: AgentConfig | null | undefined) => {
      const resolved = cfg ?? {};
      setContent(typeof resolved.system_prompt === "string" ? resolved.system_prompt : "");
      setSuggestionsPrompt(typeof resolved.suggestions_prompt === "string" ? resolved.suggestions_prompt : "");
      setTemperature(
        typeof resolved.temperature === "number"
          ? String(resolved.temperature)
          : resolved.temperature
            ? String(resolved.temperature)
            : "",
      );
      setTopK(
        typeof resolved.top_k === "number" ? String(resolved.top_k) : resolved.top_k ? String(resolved.top_k) : "",
      );
      setTopP(
        typeof resolved.top_p === "number" ? String(resolved.top_p) : resolved.top_p ? String(resolved.top_p) : "",
      );
      setMaxOutputTokens(
        typeof resolved.max_output_tokens === "number"
          ? String(resolved.max_output_tokens)
          : resolved.max_output_tokens
            ? String(resolved.max_output_tokens)
            : "",
      );
      setCandidateCount(
        typeof resolved.candidate_count === "number"
          ? String(resolved.candidate_count)
          : resolved.candidate_count
            ? String(resolved.candidate_count)
            : "",
      );
      setStopSequences(Array.isArray(resolved.stop_sequences) ? resolved.stop_sequences.join("\n") : "");
      setResponseMimeType(resolved.response_mime_type ? String(resolved.response_mime_type) : "");
      clearDirty();
    },
    [clearDirty],
  );

  useEffect(() => {
    let active = true;

    async function hydrateSessionConfig() {
      if (agentConfigEndpoint) {
        return;
      }

      if (userLoading) {
        return;
      }

      if (!derivedUserId) {
        setError("Sign in to edit LLM system settings.");
        setContent("");
        setSuggestionsPrompt("");
        return;
      }

      setHydratingSession(true);
      setError(null);

      try {
        const { session: resolvedSession } = await fetchSessionDetail(sessionId, derivedUserId);
        if (!active) return;
        if (!resolvedSession) {
          setError("Unable to load session configuration right now.");
          setContent("");
          setSuggestionsPrompt("");
          return;
        }

        setSession(resolvedSession);
        const resolvedConnection = resolveAgentConfigConnection(resolvedSession.config as any);
        if (!resolvedConnection.endpoint) {
          setError("Agent Config endpoint is not configured for this session.");
          setContent("");
          setSuggestionsPrompt("");
        }
      } catch (err) {
        if (!active) return;
        console.error("[SystemPromptContent] Unable to hydrate session config", err);
        setError("Unable to load session configuration right now.");
        setContent("");
        setSuggestionsPrompt("");
      } finally {
        if (active) {
          setHydratingSession(false);
        }
      }
    }

    hydrateSessionConfig();
    return () => {
      active = false;
    };
  }, [agentConfigEndpoint, derivedUserId, sessionId, userLoading]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!agentConfigEndpoint) {
          return;
        }

        setLoading(true);
        setError(null);
        const headers: Record<string, string> = {
          accept: "application/json",
        };
        if (agentConfigKeyValue) {
          headers[agentConfigKeyName] = agentConfigKeyValue;
        }
        const res = await fetch(agentConfigEndpoint, { method: "GET", headers, cache: "no-store" });
        if (!active) return;
        if (!res.ok) {
          throw new Error(`Failed to fetch config (status ${res.status})`);
        }
        const data = (await res.json()) as { config?: AgentConfig } | AgentConfig;
        const cfg: AgentConfig = data && typeof data === "object" && "config" in data ? (data as any).config ?? {} : (data as AgentConfig);
        if (!dirtyRef.current) {
          applyConfigToForm(cfg);
        }
      } catch (err) {
        if (!active) return;
        console.error("[SystemPromptContent] Unable to fetch agent config", err);
        setError("Unable to load agent configuration right now.");
        if (!dirtyRef.current) {
          setContent("");
          setSuggestionsPrompt("");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [
    agentConfigEndpoint,
    agentConfigKeyName,
    agentConfigKeyValue,
    applyConfigToForm,
  ]);
  const parseNumber = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : undefined;
  };

  const buildUpdatedConfig = (): AgentConfig => {
    const stopSeqs = stopSequences
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const cfg: AgentConfig = {
      system_prompt: content ?? "",
      suggestions_prompt: suggestionsPrompt ?? "",
      response_mime_type: responseMimeType.trim() || undefined,
    };
    const temp = parseNumber(temperature);
    if (typeof temp !== "undefined") cfg.temperature = temp;
    const k = parseNumber(topK);
    if (typeof k !== "undefined") cfg.top_k = k;
    const p = parseNumber(topP);
    if (typeof p !== "undefined") cfg.top_p = p;
    const max = parseNumber(maxOutputTokens);
    if (typeof max !== "undefined") cfg.max_output_tokens = max;
    const cc = parseNumber(candidateCount);
    if (typeof cc !== "undefined") cfg.candidate_count = cc;
    if (stopSeqs.length) cfg.stop_sequences = stopSeqs;
    return cfg;
  };

  const handleSave = async () => {
    if (!agentConfigEndpoint) {
      setError("Agent Config endpoint is not configured for this session.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updatedConfig = buildUpdatedConfig();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (agentConfigKeyValue) {
        headers[agentConfigKeyName] = agentConfigKeyValue;
      }
      const res = await fetch(agentConfigEndpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ config: updatedConfig }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save config (status ${res.status})`);
      }

      applyConfigToForm(updatedConfig);
    } catch (err) {
      console.error("[SystemPromptContent] Save failed", err);
      setError("Unable to save settings right now.");
    } finally {
      setSaving(false);
    }
  };

  if (error && content === null) {
    return <div className="text-sm text-red-600 dark:text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {userLoading || hydratingSession ? (
        <div className="text-sm text-dark-5 dark:text-dark-6">Loading session settings...</div>
      ) : null}
      {loading ? (
        <div className="text-sm text-dark-5 dark:text-dark-6">Loading current settings...</div>
      ) : null}
      {!loading && !userLoading && !hydratingSession && dirty ? (
        <div className="text-sm text-amber-700 dark:text-amber-300">You have unsaved changes.</div>
      ) : null}
      {agentConfigEndpoint ? (
        <div className="text-xs text-dark-5 dark:text-dark-6 break-all">
          Endpoint: <span className="font-mono">{agentConfigEndpoint}</span>
        </div>
      ) : null}

      <div>
        <div className="mb-2 text-sm font-medium text-dark dark:text-white">System Prompt</div>
        <textarea
          value={content ?? ""}
          onChange={(e) => {
            setContent(e.target.value);
            markDirty();
          }}
          placeholder="No system prompt set for this session."
          className="h-64 w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          disabled={loading || saving || userLoading || hydratingSession}
        />
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-dark dark:text-white">Suggestions Prompt</div>
        <textarea
          value={suggestionsPrompt}
          onChange={(e) => {
            setSuggestionsPrompt(e.target.value);
            markDirty();
          }}
          placeholder="Optional suggestions prompt."
          className="h-32 w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          disabled={loading || saving || userLoading || hydratingSession}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="temperature">
            Temperature
          </label>
          <input
            id="temperature"
            name="temperature"
            type="number"
            step="0.01"
            value={temperature}
            onChange={(e) => {
              setTemperature(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="e.g. 0.3"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="top_k">
            Top K
          </label>
          <input
            id="top_k"
            name="top_k"
            type="number"
            step="1"
            value={topK}
            onChange={(e) => {
              setTopK(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="e.g. 40"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="top_p">
            Top P
          </label>
          <input
            id="top_p"
            name="top_p"
            type="number"
            step="0.01"
            value={topP}
            onChange={(e) => {
              setTopP(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="e.g. 0.95"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="max_output_tokens">
            Max Output Tokens
          </label>
          <input
            id="max_output_tokens"
            name="max_output_tokens"
            type="number"
            step="1"
            value={maxOutputTokens}
            onChange={(e) => {
              setMaxOutputTokens(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="e.g. 1024"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="candidate_count">
            Candidate Count
          </label>
          <input
            id="candidate_count"
            name="candidate_count"
            type="number"
            step="1"
            value={candidateCount}
            onChange={(e) => {
              setCandidateCount(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="e.g. 1"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="response_mime_type">
            Response MIME Type
          </label>
          <input
            id="response_mime_type"
            name="response_mime_type"
            type="text"
            value={responseMimeType}
            onChange={(e) => {
              setResponseMimeType(e.target.value);
              markDirty();
            }}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="text/plain"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="stop_sequences">
            Stop Sequences (one per line)
          </label>
          <textarea
            id="stop_sequences"
            name="stop_sequences"
            value={stopSequences}
            onChange={(e) => {
              setStopSequences(e.target.value);
              markDirty();
            }}
            rows={3}
            className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            placeholder="###\nEND"
            disabled={loading || saving || userLoading || hydratingSession}
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSave}
          disabled={saving || loading || userLoading || hydratingSession}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
