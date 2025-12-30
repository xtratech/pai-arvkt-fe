"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSessionDetail, type SessionRecord } from "@/services/sessions";
import { useUser } from "@/contexts/user-context";
import { buildBearerTokenFromTokens } from "@/lib/auth-headers";

type Props = {
  sessionId: string;
  initialSession?: SessionRecord | null;
};

type ModelOption = {
  key: string;
  name?: string;
  thinking_level?: string[];
  default?: boolean;
};

type AgentConfig = {
  available_models?: ModelOption[];
  model?: string;
  system_prompt?: string;
  suggestions_prompt?: string;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  thinking_level?: string;
  max_output_tokens?: number;
  candidate_count?: number;
  stop_sequences?: string[];
  response_mime_type?: string;
  kb_expert_model?: string;
  kb_expert_system_prompt?: string;
  kb_expert_suggestions_prompt?: string;
  kb_expert_temperature?: number;
  kb_expert_top_k?: number;
  kb_expert_top_p?: number;
  kb_expert_thinking_level?: string;
  kb_expert_max_output_tokens?: number;
  kb_expert_candidate_count?: number;
  kb_expert_stop_sequences?: string[];
  kb_expert_response_mime_type?: string;
  kb_analyzer_model?: string;
  kb_analyzer_system_prompt?: string;
  kb_analyzer_suggestions_prompt?: string;
  kb_analyzer_temperature?: number;
  kb_analyzer_top_k?: number;
  kb_analyzer_top_p?: number;
  kb_analyzer_thinking_level?: string;
  kb_analyzer_max_output_tokens?: number;
  kb_analyzer_candidate_count?: number;
  kb_analyzer_stop_sequences?: string[];
  kb_analyzer_response_mime_type?: string;
  kb_creator_model?: string;
  kb_creator_system_prompt?: string;
  kb_creator_suggestions_prompt?: string;
  kb_creator_temperature?: number;
  kb_creator_top_k?: number;
  kb_creator_top_p?: number;
  kb_creator_thinking_level?: string;
  kb_creator_thinking_leve?: string;
  kb_creator_max_output_tokens?: number;
  kb_creator_candidate_count?: number;
  kb_creator_stop_sequences?: string[];
  kb_creator_response_mime_type?: string;
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

type ProfileId = "default" | "kb_expert" | "kb_analyzer" | "kb_creator";

function normalizeModelOptions(input: unknown): ModelOption[] {
  if (!Array.isArray(input)) return [];
  const results: ModelOption[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    if (!key) continue;

    const option: ModelOption = { key };
    if (typeof raw.name === "string" && raw.name.trim()) {
      option.name = raw.name;
    }
    if (typeof raw.default === "boolean") {
      option.default = raw.default;
    }
    if (Array.isArray(raw.thinking_level)) {
      option.thinking_level = raw.thinking_level.map((lvl) => String(lvl)).filter(Boolean);
    }

    results.push(option);
  }

  return results;
}

function getDefaultModelKey(models: ModelOption[]) {
  const preferred = models.find((m) => m.default) ?? models[0];
  return preferred?.key ? String(preferred.key) : "";
}

function resolveModelKeyFromOptions(value: unknown, models: ModelOption[], fallback?: string) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) return fallback ?? "";

  const direct = models.find((m) => m.key === rawValue);
  if (direct) return direct.key;

  const byName = models.find((m) => m.name && m.name.trim() === rawValue);
  if (byName) return byName.key;

  return rawValue;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center" title={text}>
      <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-stroke text-[10px] font-bold text-dark-5 dark:border-dark-3 dark:text-dark-6">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-stroke bg-white px-3 py-2 text-xs text-dark shadow-lg opacity-0 transition group-hover:opacity-100 dark:border-dark-3 dark:bg-dark-2 dark:text-white">
        {text}
      </span>
    </span>
  );
}

export function SystemPromptContent({
  sessionId,
  initialSession,
}: Props) {
  const { attributes, user, tokens, isLoading: userLoading } = useUser();
  const [content, setContent] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelKey, setModelKey] = useState<string>("");
  const [suggestionsPrompt, setSuggestionsPrompt] = useState<string>("");
  const [kbExpertSystemPrompt, setKbExpertSystemPrompt] = useState<string>("");
  const [kbExpertModelKey, setKbExpertModelKey] = useState<string>("");
  const [kbExpertSuggestionsPrompt, setKbExpertSuggestionsPrompt] = useState<string>("");
  const [kbAnalyzerSystemPrompt, setKbAnalyzerSystemPrompt] = useState<string>("");
  const [kbAnalyzerModelKey, setKbAnalyzerModelKey] = useState<string>("");
  const [kbAnalyzerSuggestionsPrompt, setKbAnalyzerSuggestionsPrompt] = useState<string>("");
  const [kbCreatorSystemPrompt, setKbCreatorSystemPrompt] = useState<string>("");
  const [kbCreatorModelKey, setKbCreatorModelKey] = useState<string>("");
  const [kbCreatorSuggestionsPrompt, setKbCreatorSuggestionsPrompt] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [thinkingLevel, setThinkingLevel] = useState<string>("");
  const [topK, setTopK] = useState<string>("");
  const [topP, setTopP] = useState<string>("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [candidateCount, setCandidateCount] = useState<string>("");
  const [stopSequences, setStopSequences] = useState<string>("");
  const [responseMimeType, setResponseMimeType] = useState<string>("");
  const [kbExpertTemperature, setKbExpertTemperature] = useState<string>("");
  const [kbExpertThinkingLevel, setKbExpertThinkingLevel] = useState<string>("");
  const [kbExpertTopK, setKbExpertTopK] = useState<string>("");
  const [kbExpertTopP, setKbExpertTopP] = useState<string>("");
  const [kbExpertMaxOutputTokens, setKbExpertMaxOutputTokens] = useState<string>("");
  const [kbExpertCandidateCount, setKbExpertCandidateCount] = useState<string>("");
  const [kbExpertStopSequences, setKbExpertStopSequences] = useState<string>("");
  const [kbExpertResponseMimeType, setKbExpertResponseMimeType] = useState<string>("");
  const [kbAnalyzerTemperature, setKbAnalyzerTemperature] = useState<string>("");
  const [kbAnalyzerThinkingLevel, setKbAnalyzerThinkingLevel] = useState<string>("");
  const [kbAnalyzerTopK, setKbAnalyzerTopK] = useState<string>("");
  const [kbAnalyzerTopP, setKbAnalyzerTopP] = useState<string>("");
  const [kbAnalyzerMaxOutputTokens, setKbAnalyzerMaxOutputTokens] = useState<string>("");
  const [kbAnalyzerCandidateCount, setKbAnalyzerCandidateCount] = useState<string>("");
  const [kbAnalyzerStopSequences, setKbAnalyzerStopSequences] = useState<string>("");
  const [kbAnalyzerResponseMimeType, setKbAnalyzerResponseMimeType] = useState<string>("");
  const [kbCreatorTemperature, setKbCreatorTemperature] = useState<string>("");
  const [kbCreatorThinkingLevel, setKbCreatorThinkingLevel] = useState<string>("");
  const [kbCreatorTopK, setKbCreatorTopK] = useState<string>("");
  const [kbCreatorTopP, setKbCreatorTopP] = useState<string>("");
  const [kbCreatorMaxOutputTokens, setKbCreatorMaxOutputTokens] = useState<string>("");
  const [kbCreatorCandidateCount, setKbCreatorCandidateCount] = useState<string>("");
  const [kbCreatorStopSequences, setKbCreatorStopSequences] = useState<string>("");
  const [kbCreatorResponseMimeType, setKbCreatorResponseMimeType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [hydratingSession, setHydratingSession] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const dirtyRef = useRef(false);
  const [session, setSession] = useState<SessionRecord | null>(initialSession ?? null);
  const sessionConfig = useMemo(() => session?.config ?? {}, [session]);
  const [activeProfile, setActiveProfile] = useState<ProfileId>("default");
  const [lastLoadedConfig, setLastLoadedConfig] = useState<AgentConfig | null>(null);
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
    () => buildBearerTokenFromTokens(tokens),
    [tokens?.accessToken, tokens?.idToken],
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
      const rawModels = resolved.available_models;
      const models = normalizeModelOptions(rawModels);
      if (Array.isArray(rawModels)) {
        setAvailableModels(models);
      }
      const fallbackModelKey = models.length ? getDefaultModelKey(models) : "";
      setModelKey(resolveModelKeyFromOptions(resolved.model, models, fallbackModelKey));
      setContent(typeof resolved.system_prompt === "string" ? resolved.system_prompt : "");
      setSuggestionsPrompt(typeof resolved.suggestions_prompt === "string" ? resolved.suggestions_prompt : "");
      setKbExpertModelKey(
        resolveModelKeyFromOptions(
          resolved.kb_expert_model,
          models,
          resolveModelKeyFromOptions(resolved.model, models, fallbackModelKey),
        ),
      );
      setKbExpertSystemPrompt(
        typeof resolved.kb_expert_system_prompt === "string" ? resolved.kb_expert_system_prompt : "",
      );
      setKbExpertSuggestionsPrompt(
        typeof resolved.kb_expert_suggestions_prompt === "string" ? resolved.kb_expert_suggestions_prompt : "",
      );
      setKbAnalyzerModelKey(
        resolveModelKeyFromOptions(
          resolved.kb_analyzer_model,
          models,
          resolveModelKeyFromOptions(resolved.model, models, fallbackModelKey),
        ),
      );
      setKbAnalyzerSystemPrompt(
        typeof resolved.kb_analyzer_system_prompt === "string" ? resolved.kb_analyzer_system_prompt : "",
      );
      setKbAnalyzerSuggestionsPrompt(
        typeof resolved.kb_analyzer_suggestions_prompt === "string" ? resolved.kb_analyzer_suggestions_prompt : "",
      );
      setKbCreatorModelKey(
        resolveModelKeyFromOptions(
          resolved.kb_creator_model,
          models,
          resolveModelKeyFromOptions(resolved.model, models, fallbackModelKey),
        ),
      );
      setKbCreatorSystemPrompt(
        typeof resolved.kb_creator_system_prompt === "string" ? resolved.kb_creator_system_prompt : "",
      );
      setKbCreatorSuggestionsPrompt(
        typeof resolved.kb_creator_suggestions_prompt === "string" ? resolved.kb_creator_suggestions_prompt : "",
      );
      setTemperature(
        typeof resolved.temperature === "number"
          ? String(resolved.temperature)
          : resolved.temperature
            ? String(resolved.temperature)
            : "",
      );
      setThinkingLevel(typeof resolved.thinking_level === "string" ? resolved.thinking_level : "");
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
      setKbExpertTemperature(
        typeof resolved.kb_expert_temperature === "number"
          ? String(resolved.kb_expert_temperature)
          : resolved.kb_expert_temperature
            ? String(resolved.kb_expert_temperature)
            : "",
      );
      setKbExpertThinkingLevel(typeof resolved.kb_expert_thinking_level === "string" ? resolved.kb_expert_thinking_level : "");
      setKbExpertTopK(
        typeof resolved.kb_expert_top_k === "number"
          ? String(resolved.kb_expert_top_k)
          : resolved.kb_expert_top_k
            ? String(resolved.kb_expert_top_k)
            : "",
      );
      setKbExpertTopP(
        typeof resolved.kb_expert_top_p === "number"
          ? String(resolved.kb_expert_top_p)
          : resolved.kb_expert_top_p
            ? String(resolved.kb_expert_top_p)
            : "",
      );
      setKbExpertMaxOutputTokens(
        typeof resolved.kb_expert_max_output_tokens === "number"
          ? String(resolved.kb_expert_max_output_tokens)
          : resolved.kb_expert_max_output_tokens
            ? String(resolved.kb_expert_max_output_tokens)
            : "",
      );
      setKbExpertCandidateCount(
        typeof resolved.kb_expert_candidate_count === "number"
          ? String(resolved.kb_expert_candidate_count)
          : resolved.kb_expert_candidate_count
            ? String(resolved.kb_expert_candidate_count)
            : "",
      );
      setKbExpertStopSequences(
        Array.isArray(resolved.kb_expert_stop_sequences) ? resolved.kb_expert_stop_sequences.join("\n") : "",
      );
      setKbExpertResponseMimeType(
        resolved.kb_expert_response_mime_type ? String(resolved.kb_expert_response_mime_type) : "",
      );
      setKbAnalyzerTemperature(
        typeof resolved.kb_analyzer_temperature === "number"
          ? String(resolved.kb_analyzer_temperature)
          : resolved.kb_analyzer_temperature
            ? String(resolved.kb_analyzer_temperature)
            : "",
      );
      setKbAnalyzerThinkingLevel(typeof resolved.kb_analyzer_thinking_level === "string" ? resolved.kb_analyzer_thinking_level : "");
      setKbAnalyzerTopK(
        typeof resolved.kb_analyzer_top_k === "number"
          ? String(resolved.kb_analyzer_top_k)
          : resolved.kb_analyzer_top_k
            ? String(resolved.kb_analyzer_top_k)
            : "",
      );
      setKbAnalyzerTopP(
        typeof resolved.kb_analyzer_top_p === "number"
          ? String(resolved.kb_analyzer_top_p)
          : resolved.kb_analyzer_top_p
            ? String(resolved.kb_analyzer_top_p)
            : "",
      );
      setKbAnalyzerMaxOutputTokens(
        typeof resolved.kb_analyzer_max_output_tokens === "number"
          ? String(resolved.kb_analyzer_max_output_tokens)
          : resolved.kb_analyzer_max_output_tokens
            ? String(resolved.kb_analyzer_max_output_tokens)
            : "",
      );
      setKbAnalyzerCandidateCount(
        typeof resolved.kb_analyzer_candidate_count === "number"
          ? String(resolved.kb_analyzer_candidate_count)
          : resolved.kb_analyzer_candidate_count
            ? String(resolved.kb_analyzer_candidate_count)
            : "",
      );
      setKbAnalyzerStopSequences(
        Array.isArray(resolved.kb_analyzer_stop_sequences) ? resolved.kb_analyzer_stop_sequences.join("\n") : "",
      );
      setKbAnalyzerResponseMimeType(
        resolved.kb_analyzer_response_mime_type ? String(resolved.kb_analyzer_response_mime_type) : "",
      );
      setKbCreatorTemperature(
        typeof resolved.kb_creator_temperature === "number"
          ? String(resolved.kb_creator_temperature)
          : resolved.kb_creator_temperature
            ? String(resolved.kb_creator_temperature)
            : "",
      );
      const creatorThinking =
        typeof resolved.kb_creator_thinking_level === "string"
          ? resolved.kb_creator_thinking_level
          : typeof resolved.kb_creator_thinking_leve === "string"
            ? resolved.kb_creator_thinking_leve
            : "";
      setKbCreatorThinkingLevel(creatorThinking);
      setKbCreatorTopK(
        typeof resolved.kb_creator_top_k === "number"
          ? String(resolved.kb_creator_top_k)
          : resolved.kb_creator_top_k
            ? String(resolved.kb_creator_top_k)
            : "",
      );
      setKbCreatorTopP(
        typeof resolved.kb_creator_top_p === "number"
          ? String(resolved.kb_creator_top_p)
          : resolved.kb_creator_top_p
            ? String(resolved.kb_creator_top_p)
            : "",
      );
      setKbCreatorMaxOutputTokens(
        typeof resolved.kb_creator_max_output_tokens === "number"
          ? String(resolved.kb_creator_max_output_tokens)
          : resolved.kb_creator_max_output_tokens
            ? String(resolved.kb_creator_max_output_tokens)
            : "",
      );
      setKbCreatorCandidateCount(
        typeof resolved.kb_creator_candidate_count === "number"
          ? String(resolved.kb_creator_candidate_count)
          : resolved.kb_creator_candidate_count
            ? String(resolved.kb_creator_candidate_count)
            : "",
      );
      setKbCreatorStopSequences(
        Array.isArray(resolved.kb_creator_stop_sequences) ? resolved.kb_creator_stop_sequences.join("\n") : "",
      );
      setKbCreatorResponseMimeType(
        resolved.kb_creator_response_mime_type ? String(resolved.kb_creator_response_mime_type) : "",
      );
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
          setError("Unable to load agent configuration right now.");
          setContent("");
          setSuggestionsPrompt("");
          return;
        }

        setSession(resolvedSession);
        const resolvedConnection = resolveAgentConfigConnection(resolvedSession.config as any);
        if (!resolvedConnection.endpoint) {
          setError("Agent Config endpoint is not configured for this agent.");
          setContent("");
          setSuggestionsPrompt("");
        }
      } catch (err) {
        if (!active) return;
        console.error("[SystemPromptContent] Unable to hydrate session config", err);
        setError("Unable to load agent configuration right now.");
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
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const res = await fetch(agentConfigEndpoint, { method: "GET", headers, cache: "no-store" });
        if (!active) return;
        if (!res.ok) {
          throw new Error(`Failed to fetch config (status ${res.status})`);
        }
        const data = (await res.json()) as { config?: AgentConfig } | AgentConfig;
        const cfg: AgentConfig = data && typeof data === "object" && "config" in data ? (data as any).config ?? {} : (data as AgentConfig);
        setLastLoadedConfig(cfg);
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
    authHeader,
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
    const kbExpertStopSeqs = kbExpertStopSequences
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const kbAnalyzerStopSeqs = kbAnalyzerStopSequences
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const kbCreatorStopSeqs = kbCreatorStopSequences
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const { available_models: _availableModels, ...baseConfig } = (lastLoadedConfig ?? {}) as AgentConfig;

    const cfg: AgentConfig = {
      ...baseConfig,
      system_prompt: content ?? "",
      suggestions_prompt: suggestionsPrompt ?? "",
      response_mime_type: responseMimeType.trim() || undefined,
      kb_expert_system_prompt: kbExpertSystemPrompt ?? "",
      kb_expert_suggestions_prompt: kbExpertSuggestionsPrompt ?? "",
      kb_expert_response_mime_type: kbExpertResponseMimeType.trim() || undefined,
      kb_analyzer_system_prompt: kbAnalyzerSystemPrompt ?? "",
      kb_analyzer_suggestions_prompt: kbAnalyzerSuggestionsPrompt ?? "",
      kb_analyzer_response_mime_type: kbAnalyzerResponseMimeType.trim() || undefined,
      kb_creator_system_prompt: kbCreatorSystemPrompt ?? "",
      kb_creator_suggestions_prompt: kbCreatorSuggestionsPrompt ?? "",
      kb_creator_response_mime_type: kbCreatorResponseMimeType.trim() || undefined,
    };

    const modelVal = modelKey.trim();
    if (modelVal) cfg.model = modelVal;
    const kbExpertModelVal = kbExpertModelKey.trim();
    if (kbExpertModelVal) cfg.kb_expert_model = kbExpertModelVal;
    const kbAnalyzerModelVal = kbAnalyzerModelKey.trim();
    if (kbAnalyzerModelVal) cfg.kb_analyzer_model = kbAnalyzerModelVal;
    const kbCreatorModelVal = kbCreatorModelKey.trim();
    if (kbCreatorModelVal) cfg.kb_creator_model = kbCreatorModelVal;

    const supportsThinkingLevel = (selectedModel: string) =>
      availableModels.some(
        (model) => model.key === selectedModel && (model.thinking_level?.length ?? 0) > 0,
      );

    const normalizeThinkingLevel = (value: string, selectedModel: string) => {
      if (!selectedModel || !supportsThinkingLevel(selectedModel)) {
        return "NONE";
      }
      return value.trim();
    };

    const resolvedDefaultModel = modelVal || (typeof baseConfig.model === "string" ? baseConfig.model : "");
    const resolvedKbExpertModel =
      kbExpertModelVal || (typeof baseConfig.kb_expert_model === "string" ? baseConfig.kb_expert_model : "");
    const resolvedKbAnalyzerModel =
      kbAnalyzerModelVal || (typeof baseConfig.kb_analyzer_model === "string" ? baseConfig.kb_analyzer_model : "");
    const resolvedKbCreatorModel =
      kbCreatorModelVal || (typeof baseConfig.kb_creator_model === "string" ? baseConfig.kb_creator_model : "");

    cfg.thinking_level = normalizeThinkingLevel(thinkingLevel, resolvedDefaultModel);
    cfg.kb_expert_thinking_level = normalizeThinkingLevel(kbExpertThinkingLevel, resolvedKbExpertModel);
    cfg.kb_analyzer_thinking_level = normalizeThinkingLevel(kbAnalyzerThinkingLevel, resolvedKbAnalyzerModel);
    cfg.kb_creator_thinking_level = normalizeThinkingLevel(kbCreatorThinkingLevel, resolvedKbCreatorModel);
    delete (cfg as any).kb_creator_thinking_leve;

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
    cfg.stop_sequences = stopSeqs;

    const kbTemp = parseNumber(kbExpertTemperature);
    if (typeof kbTemp !== "undefined") cfg.kb_expert_temperature = kbTemp;
    const kbK = parseNumber(kbExpertTopK);
    if (typeof kbK !== "undefined") cfg.kb_expert_top_k = kbK;
    const kbP = parseNumber(kbExpertTopP);
    if (typeof kbP !== "undefined") cfg.kb_expert_top_p = kbP;
    const kbMax = parseNumber(kbExpertMaxOutputTokens);
    if (typeof kbMax !== "undefined") cfg.kb_expert_max_output_tokens = kbMax;
    const kbCc = parseNumber(kbExpertCandidateCount);
    if (typeof kbCc !== "undefined") cfg.kb_expert_candidate_count = kbCc;
    cfg.kb_expert_stop_sequences = kbExpertStopSeqs;

    const analyzerTemp = parseNumber(kbAnalyzerTemperature);
    if (typeof analyzerTemp !== "undefined") cfg.kb_analyzer_temperature = analyzerTemp;
    const analyzerK = parseNumber(kbAnalyzerTopK);
    if (typeof analyzerK !== "undefined") cfg.kb_analyzer_top_k = analyzerK;
    const analyzerP = parseNumber(kbAnalyzerTopP);
    if (typeof analyzerP !== "undefined") cfg.kb_analyzer_top_p = analyzerP;
    const analyzerMax = parseNumber(kbAnalyzerMaxOutputTokens);
    if (typeof analyzerMax !== "undefined") cfg.kb_analyzer_max_output_tokens = analyzerMax;
    const analyzerCc = parseNumber(kbAnalyzerCandidateCount);
    if (typeof analyzerCc !== "undefined") cfg.kb_analyzer_candidate_count = analyzerCc;
    cfg.kb_analyzer_stop_sequences = kbAnalyzerStopSeqs;

    const creatorTemp = parseNumber(kbCreatorTemperature);
    if (typeof creatorTemp !== "undefined") cfg.kb_creator_temperature = creatorTemp;
    const creatorK = parseNumber(kbCreatorTopK);
    if (typeof creatorK !== "undefined") cfg.kb_creator_top_k = creatorK;
    const creatorP = parseNumber(kbCreatorTopP);
    if (typeof creatorP !== "undefined") cfg.kb_creator_top_p = creatorP;
    const creatorMax = parseNumber(kbCreatorMaxOutputTokens);
    if (typeof creatorMax !== "undefined") cfg.kb_creator_max_output_tokens = creatorMax;
    const creatorCc = parseNumber(kbCreatorCandidateCount);
    if (typeof creatorCc !== "undefined") cfg.kb_creator_candidate_count = creatorCc;
    cfg.kb_creator_stop_sequences = kbCreatorStopSeqs;
    return cfg;
  };

  const handleSave = async () => {
    if (!agentConfigEndpoint) {
      setError("Agent Config endpoint is not configured for this agent.");
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
      if (authHeader) {
        headers.Authorization = authHeader;
      }
      const res = await fetch(agentConfigEndpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ config: updatedConfig }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save config (status ${res.status})`);
      }

      setLastLoadedConfig(updatedConfig);
      applyConfigToForm(updatedConfig);
    } catch (err) {
      console.error("[SystemPromptContent] Save failed", err);
      setError("Unable to save settings right now.");
    } finally {
      setSaving(false);
    }
  };

  if (error && content === null) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        <div className="font-semibold text-dark dark:text-white">Unable to load system prompt settings</div>
        <div className="mt-1">{error}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/session/edit?id=${encodeURIComponent(sessionId)}`}
            className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          >
            Edit Agent Settings
          </Link>
          <Link
            href={`/session?id=${encodeURIComponent(sessionId)}`}
            className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-dark shadow-sm transition hover:bg-gray-2 dark:border-red-900/40 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
          >
            View Agent
          </Link>
        </div>
      </div>
    );
  }

  const disableForm = loading || saving || userLoading || hydratingSession;
  const saveDisabled = disableForm || !dirty;
  const activeSystemPrompt =
    activeProfile === "kb_expert"
      ? kbExpertSystemPrompt
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerSystemPrompt
        : activeProfile === "kb_creator"
          ? kbCreatorSystemPrompt
          : (content ?? "");
  const activeSuggestionsPrompt =
    activeProfile === "kb_expert"
      ? kbExpertSuggestionsPrompt
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerSuggestionsPrompt
        : activeProfile === "kb_creator"
          ? kbCreatorSuggestionsPrompt
          : suggestionsPrompt;
  const activeModelKey =
    activeProfile === "kb_expert"
      ? kbExpertModelKey
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerModelKey
        : activeProfile === "kb_creator"
          ? kbCreatorModelKey
          : modelKey;
  const activeTemperature =
    activeProfile === "kb_expert"
      ? kbExpertTemperature
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerTemperature
        : activeProfile === "kb_creator"
          ? kbCreatorTemperature
          : temperature;
  const activeThinkingLevel =
    activeProfile === "kb_expert"
      ? kbExpertThinkingLevel
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerThinkingLevel
        : activeProfile === "kb_creator"
          ? kbCreatorThinkingLevel
          : thinkingLevel;
  const activeTopK =
    activeProfile === "kb_expert"
      ? kbExpertTopK
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerTopK
        : activeProfile === "kb_creator"
          ? kbCreatorTopK
          : topK;
  const activeTopP =
    activeProfile === "kb_expert"
      ? kbExpertTopP
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerTopP
        : activeProfile === "kb_creator"
          ? kbCreatorTopP
          : topP;
  const activeMaxOutputTokens =
    activeProfile === "kb_expert"
      ? kbExpertMaxOutputTokens
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerMaxOutputTokens
        : activeProfile === "kb_creator"
          ? kbCreatorMaxOutputTokens
          : maxOutputTokens;
  const activeCandidateCount =
    activeProfile === "kb_expert"
      ? kbExpertCandidateCount
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerCandidateCount
        : activeProfile === "kb_creator"
          ? kbCreatorCandidateCount
          : candidateCount;
  const activeStopSequences =
    activeProfile === "kb_expert"
      ? kbExpertStopSequences
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerStopSequences
        : activeProfile === "kb_creator"
          ? kbCreatorStopSequences
          : stopSequences;
  const activeResponseMimeType =
    activeProfile === "kb_expert"
      ? kbExpertResponseMimeType
      : activeProfile === "kb_analyzer"
        ? kbAnalyzerResponseMimeType
        : activeProfile === "kb_creator"
          ? kbCreatorResponseMimeType
          : responseMimeType;
  const selectedModelOption =
    availableModels.find((m) => m.key === activeModelKey) ??
    availableModels.find((m) => (m.name ?? "").trim() === activeModelKey.trim()) ??
    null;

  const handleDiscardChanges = () => {
    if (!lastLoadedConfig) return;
    applyConfigToForm(lastLoadedConfig);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full overflow-hidden rounded-lg border border-stroke bg-white shadow-sm dark:border-dark-3 dark:bg-dark-2 sm:w-auto">
            {[
              { id: "default" as const, label: "Default Assistant" },
              { id: "kb_expert" as const, label: "KB Expert" },
              { id: "kb_analyzer" as const, label: "KB Analyzer" },
              { id: "kb_creator" as const, label: "KB Creator" },
            ].map((option) => {
              const selected = activeProfile === option.id;
              return (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveProfile(option.id)}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:flex-none ${
                  selected
                    ? "bg-primary text-white"
                    : "text-dark hover:bg-gray-2 dark:text-white dark:hover:bg-dark-3"
                }`}
                disabled={disableForm && selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!loading && !userLoading && !hydratingSession ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                dirty ? "bg-orange-light/20 text-orange-light" : "bg-green-light-7 text-green-dark"
              }`}
            >
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          ) : null}
          {dirty ? (
            <button
              type="button"
              className="rounded-lg border border-stroke bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark shadow-sm transition hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
              onClick={handleDiscardChanges}
              disabled={disableForm || !lastLoadedConfig}
            >
              Discard
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {userLoading || hydratingSession ? (
        <div className="text-sm text-dark-5 dark:text-dark-6">Loading agent settings...</div>
      ) : null}
      {loading ? <div className="text-sm text-dark-5 dark:text-dark-6">Loading current settings...</div> : null}

      {agentConfigEndpoint ? (
        <div className="rounded-lg border border-stroke bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
          Endpoint: <span className="font-mono break-all text-dark dark:text-white">{agentConfigEndpoint}</span>
        </div>
      ) : null}

      {activeProfile === "kb_expert" ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-dark dark:border-primary/25 dark:bg-primary/10 dark:text-white">
          Tip: In Chat Editor, prefix a message with{" "}
          <span className="rounded bg-gray-2 px-1 py-0.5 font-mono text-xs text-dark dark:bg-dark-3 dark:text-white">
            kbexpert:
          </span>{" "}
          to route it to the KB Expert configuration.
        </div>
      ) : activeProfile === "kb_analyzer" ? (
        <div className="rounded-lg border border-stroke bg-gray-1 px-4 py-3 text-sm text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-white">
          Used for attributing agent responses to knowledge base source articles (Edit Sources in Chat Editor).
        </div>
      ) : activeProfile === "kb_creator" ? (
        <div className="rounded-lg border border-stroke bg-gray-1 px-4 py-3 text-sm text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-white">
          Used for drafting new knowledge base articles (Smart Draft Wizard).
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-dark-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-dark dark:text-white">System prompt</div>
                <div className="mt-0.5 text-xs text-dark-5 dark:text-dark-6">
                  Defines the assistant’s behavior and rules.
                </div>
              </div>
              <div className="text-xs text-dark-5 dark:text-dark-6">
                Characters:{" "}
                <span className="font-semibold text-dark dark:text-white">
                  {activeSystemPrompt.length.toLocaleString()}
                </span>
              </div>
            </div>
            <textarea
              value={activeSystemPrompt}
              onChange={(e) => {
                const value = e.target.value;
                if (activeProfile === "kb_expert") {
                  setKbExpertSystemPrompt(value);
                } else if (activeProfile === "kb_analyzer") {
                  setKbAnalyzerSystemPrompt(value);
                } else if (activeProfile === "kb_creator") {
                  setKbCreatorSystemPrompt(value);
                } else {
                  setContent(value);
                }
                markDirty();
              }}
              placeholder="Write the system prompt…"
              className="mt-3 h-64 w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              disabled={disableForm}
            />
          </div>

          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-dark-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-dark dark:text-white">Suggestions prompt</div>
                <div className="mt-0.5 text-xs text-dark-5 dark:text-dark-6">
                  Used to generate follow‑up questions or suggestions.
                </div>
              </div>
              <div className="text-xs text-dark-5 dark:text-dark-6">
                Characters:{" "}
                <span className="font-semibold text-dark dark:text-white">
                  {activeSuggestionsPrompt.length.toLocaleString()}
                </span>
              </div>
            </div>
            <textarea
              value={activeSuggestionsPrompt}
              onChange={(e) => {
                const value = e.target.value;
                if (activeProfile === "kb_expert") {
                  setKbExpertSuggestionsPrompt(value);
                } else if (activeProfile === "kb_analyzer") {
                  setKbAnalyzerSuggestionsPrompt(value);
                } else if (activeProfile === "kb_creator") {
                  setKbCreatorSuggestionsPrompt(value);
                } else {
                  setSuggestionsPrompt(value);
                }
                markDirty();
              }}
              placeholder="Optional…"
              className="mt-3 h-32 w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              disabled={disableForm}
            />
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-stroke bg-white p-4 shadow-sm dark:border-dark-3 dark:bg-dark-2">
            <div className="text-sm font-semibold text-dark dark:text-white">Model settings</div>
            <div className="mt-0.5 text-xs text-dark-5 dark:text-dark-6">Tuning parameters for generation.</div>

            <div className="mt-4 space-y-2">
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                htmlFor="model_key"
              >
                <span className="inline-flex items-center gap-1">
                  Model
                  <InfoTip text="Select which language model powers this profile. Different models vary in speed, cost, and reasoning quality." />
                </span>
              </label>

              {availableModels.length ? (
                <select
                  id="model_key"
                  name="model_key"
                  value={activeModelKey}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (activeProfile === "kb_expert") {
                      setKbExpertModelKey(value);
                      const supportsThinking = availableModels.some(
                        (model) => model.key === value && (model.thinking_level?.length ?? 0) > 0,
                      );
                      if (!supportsThinking) {
                        setKbExpertThinkingLevel("NONE");
                      }
                    } else if (activeProfile === "kb_analyzer") {
                      setKbAnalyzerModelKey(value);
                      const supportsThinking = availableModels.some(
                        (model) => model.key === value && (model.thinking_level?.length ?? 0) > 0,
                      );
                      if (!supportsThinking) {
                        setKbAnalyzerThinkingLevel("NONE");
                      }
                    } else if (activeProfile === "kb_creator") {
                      setKbCreatorModelKey(value);
                      const supportsThinking = availableModels.some(
                        (model) => model.key === value && (model.thinking_level?.length ?? 0) > 0,
                      );
                      if (!supportsThinking) {
                        setKbCreatorThinkingLevel("NONE");
                      }
                    } else {
                      setModelKey(value);
                      const supportsThinking = availableModels.some(
                        (model) => model.key === value && (model.thinking_level?.length ?? 0) > 0,
                      );
                      if (!supportsThinking) {
                        setThinkingLevel("NONE");
                      }
                    }
                    markDirty();
                  }}
                  className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={disableForm}
                >
                  {availableModels.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.name ? `${model.name}${model.default ? " (default)" : ""}` : model.key}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="model_key"
                  name="model_key"
                  type="text"
                  value={activeModelKey}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (activeProfile === "kb_expert") {
                      setKbExpertModelKey(value);
                    } else if (activeProfile === "kb_analyzer") {
                      setKbAnalyzerModelKey(value);
                    } else if (activeProfile === "kb_creator") {
                      setKbCreatorModelKey(value);
                    } else {
                      setModelKey(value);
                    }
                    markDirty();
                  }}
                  className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="e.g. gemini-3-flash-preview"
                  disabled={disableForm}
                />
              )}

              {selectedModelOption?.thinking_level?.length ? (
                <div className="text-xs text-dark-5 dark:text-dark-6">
                  Thinking levels available:{" "}
                  <span className="font-medium text-dark dark:text-white">
                    {selectedModelOption.thinking_level.join(", ")}
                  </span>
                </div>
              ) : null}
            </div>

            <details className="mt-4 rounded-lg border border-stroke bg-gray-1 px-3 py-2 dark:border-dark-3 dark:bg-dark-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-dark dark:text-white">
                Advanced parameters
              </summary>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="temperature"
                  >
                    <span className="inline-flex items-center gap-1">
                      Temperature
                      <InfoTip text="Controls how 'creative' the model is. Lower values are more consistent and factual; higher values are more varied (and can be less predictable)." />
                    </span>
                  </label>
                  <input
                    id="temperature"
                    name="temperature"
                    type="number"
                    step="0.01"
                    value={activeTemperature}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertTemperature(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerTemperature(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorTemperature(value);
                      } else {
                        setTemperature(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="e.g. 0.3"
                    disabled={disableForm}
                  />
                </div>

                {selectedModelOption?.thinking_level?.length ? (
                  <div>
                    <label
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                      htmlFor="thinking_level"
                    >
                      <span className="inline-flex items-center gap-1">
                        Thinking level
                        <InfoTip text="Controls how deeply the model 'thinks' before answering. Higher levels can improve reasoning but may be slower and consume more tokens." />
                      </span>
                    </label>
                    <select
                      id="thinking_level"
                      name="thinking_level"
                      value={activeThinkingLevel}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (activeProfile === "kb_expert") {
                          setKbExpertThinkingLevel(value);
                        } else if (activeProfile === "kb_analyzer") {
                          setKbAnalyzerThinkingLevel(value);
                        } else if (activeProfile === "kb_creator") {
                          setKbCreatorThinkingLevel(value);
                        } else {
                          setThinkingLevel(value);
                        }
                        markDirty();
                      }}
                      className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                      disabled={disableForm}
                    >
                      <option value="">Default</option>
                      {selectedModelOption.thinking_level.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="top_k"
                  >
                    <span className="inline-flex items-center gap-1">
                      Top K
                      <InfoTip text="Limits the model to choosing from the top K most likely next words at each step. Lower values can make output more focused; higher values allow more variety." />
                    </span>
                  </label>
                  <input
                    id="top_k"
                    name="top_k"
                    type="number"
                    step="1"
                    value={activeTopK}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertTopK(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerTopK(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorTopK(value);
                      } else {
                        setTopK(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="e.g. 40"
                    disabled={disableForm}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="top_p"
                  >
                    <span className="inline-flex items-center gap-1">
                      Top P
                      <InfoTip text="Keeps only the most likely words whose combined probability reaches this value (nucleus sampling). Lower values make answers more focused; higher values allow more variety." />
                    </span>
                  </label>
                  <input
                    id="top_p"
                    name="top_p"
                    type="number"
                    step="0.01"
                    value={activeTopP}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertTopP(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerTopP(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorTopP(value);
                      } else {
                        setTopP(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="e.g. 0.95"
                    disabled={disableForm}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="max_output_tokens"
                  >
                    <span className="inline-flex items-center gap-1">
                      Max output tokens
                      <InfoTip text="Sets the maximum length of the model's reply. Higher values allow longer answers but consume more tokens (cost)." />
                    </span>
                  </label>
                  <input
                    id="max_output_tokens"
                    name="max_output_tokens"
                    type="number"
                    step="1"
                    value={activeMaxOutputTokens}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertMaxOutputTokens(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerMaxOutputTokens(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorMaxOutputTokens(value);
                      } else {
                        setMaxOutputTokens(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="e.g. 2024"
                    disabled={disableForm}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="candidate_count"
                  >
                    <span className="inline-flex items-center gap-1">
                      Candidate count
                      <InfoTip text="How many alternative responses the model should generate. In most cases keep this at 1 for predictable output and lower cost." />
                    </span>
                  </label>
                  <input
                    id="candidate_count"
                    name="candidate_count"
                    type="number"
                    step="1"
                    value={activeCandidateCount}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertCandidateCount(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerCandidateCount(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorCandidateCount(value);
                      } else {
                        setCandidateCount(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="e.g. 1"
                    disabled={disableForm}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="response_mime_type"
                  >
                    <span className="inline-flex items-center gap-1">
                      Response MIME type
                      <InfoTip text="Controls the output format. Use text/plain for normal responses, or application/json when you need the model to return strict JSON." />
                    </span>
                  </label>
                  <input
                    id="response_mime_type"
                    name="response_mime_type"
                    type="text"
                    list="mimeTypeOptions"
                    value={activeResponseMimeType}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertResponseMimeType(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerResponseMimeType(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorResponseMimeType(value);
                      } else {
                        setResponseMimeType(value);
                      }
                      markDirty();
                    }}
                    className="block w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="text/plain"
                    disabled={disableForm}
                  />
                  <datalist id="mimeTypeOptions">
                    <option value="text/plain" />
                    <option value="application/json" />
                  </datalist>
                </div>

                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6"
                    htmlFor="stop_sequences"
                  >
                    <span className="inline-flex items-center gap-1">
                      Stop sequences (one per line)
                      <InfoTip text="If the model outputs any of these phrases, it will stop generating immediately. Useful to prevent extra sections or enforce a clean ending." />
                    </span>
                  </label>
                  <textarea
                    id="stop_sequences"
                    name="stop_sequences"
                    value={activeStopSequences}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (activeProfile === "kb_expert") {
                        setKbExpertStopSequences(value);
                      } else if (activeProfile === "kb_analyzer") {
                        setKbAnalyzerStopSequences(value);
                      } else if (activeProfile === "kb_creator") {
                        setKbCreatorStopSequences(value);
                      } else {
                        setStopSequences(value);
                      }
                      markDirty();
                    }}
                    rows={3}
                    className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                    placeholder="###\nEND"
                    disabled={disableForm}
                  />
                </div>
              </div>
            </details>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
