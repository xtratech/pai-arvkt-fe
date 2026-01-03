"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useUser } from "@/contexts/user-context";
import { buildBearerTokenFromTokens, resolveAuthorizationHeaderValue } from "@/lib/auth-headers";
import { fetchSessions, type SessionConfig, type SessionRecord } from "@/services/sessions";
import {
  normalizeFinalOutput,
  startChat,
  type ChatUsageMetadata,
  type StartChatResponse,
} from "@/services/chat-async-jobs";
import { recordUserWalletUsage } from "@/services/user-wallet";

const STORAGE_PREFIX = "pluree:idle-resume";
const LAST_ACTIVE_KEY = `${STORAGE_PREFIX}:last-active-at`;
const LAST_CHECK_KEY = `${STORAGE_PREFIX}:last-check-at`;
const TRAINING_TRIGGER_PREFIX = `${STORAGE_PREFIX}:kb-training-trigger:`;

const IDLE_THRESHOLD_MS = 60 * 60 * 1000;
const CHECK_COOLDOWN_MS = 15 * 60 * 1000;
const TRAINING_STALE_THRESHOLD_MS = 500 * 60 * 1000;
const TRAINING_TRIGGER_COOLDOWN_MS = 60 * 60 * 1000;
const TRAINING_COMMAND = "update-kb-super-editor-knowledgE";
const TRAINING_TIMESTAMPS_PATH = "last-taining-timestamps";
const TRAINING_FALLBACK_TOKEN_COST = 50_000;

const TRAINING_KEYS = ["assistant", "kb_analyzer", "kb_creator", "kb_expert"] as const;

type TrainingTimestamps = Record<(typeof TRAINING_KEYS)[number], string | undefined>;

function readStoredTimestamp(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredTimestamp(key: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures
  }
}

function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string) {
  const left = normalizeBase(base);
  const right = String(path ?? "").trim().replace(/^\/+/, "");
  if (!left) return `/${right}`;
  if (!right) return left;
  return `${left}/${right}`;
}

function resolveTrainingEndpoint(kbEndpoint: string) {
  const normalized = normalizeBase(kbEndpoint);
  if (!normalized) return "";
  if (/\/kb$/i.test(normalized)) {
    return joinUrl(normalized, TRAINING_TIMESTAMPS_PATH);
  }
  return joinUrl(normalized, `kb/${TRAINING_TIMESTAMPS_PATH}`);
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

function resolveKbConfig(config: SessionConfig | Record<string, unknown> | null | undefined) {
  const cfg = (config ?? {}) as any;
  const kbEndpoint = String(
    cfg.agent_kb_endpoint ??
      cfg.agent_kb_url ??
      cfg.agent_kb_endpoint_url ??
      cfg.agent_kb_endpoint_base ??
      "",
  ).trim();
  const kbKeyName = String(cfg.agent_kb_key_name ?? cfg.agent_kb_api_key_name ?? "x-api-key").trim() || "x-api-key";
  const kbKeyValue = String(cfg.agent_kb_key ?? cfg.agent_kb_api_key ?? cfg.agent_kb_token ?? "").trim();
  return { kbEndpoint, kbKeyName, kbKeyValue };
}

function resolveChatConfig(config: SessionConfig | Record<string, unknown> | null | undefined) {
  const cfg = (config ?? {}) as any;
  const chatEndpoint = String(cfg.chat_api_endpoint ?? "").trim();
  const chatKeyName = String(cfg.chat_api_key_name ?? "x-api-key").trim() || "x-api-key";
  const chatKeyValue = String(cfg.chat_api_key ?? "").trim();
  const chatRequestSchema = cfg.chat_api_request_schema;
  return { chatEndpoint, chatKeyName, chatKeyValue, chatRequestSchema };
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrainingStale(payload: TrainingTimestamps, nowMs: number) {
  return TRAINING_KEYS.some((key) => {
    const timestamp = parseTimestamp(payload?.[key]);
    if (!timestamp) return true;
    return nowMs - timestamp > TRAINING_STALE_THRESHOLD_MS;
  });
}

function resolveTrainingTriggerKey(session: SessionRecord, chatEndpoint: string) {
  const seed = session.id || chatEndpoint || "unknown";
  return `${TRAINING_TRIGGER_PREFIX}${encodeURIComponent(seed)}`;
}

function deriveWalletUsage(usage: ChatUsageMetadata | undefined) {
  if (!usage || typeof usage !== "object") return null;
  const total = Number(usage.totalTokenCount);
  if (Number.isFinite(total) && total > 0) {
    return { ...usage, totalTokenCount: Math.round(total) };
  }
  const prompt = Number(usage.promptTokenCount);
  const candidates = Number(usage.candidatesTokenCount);
  const sum = (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(candidates) ? candidates : 0);
  if (sum > 0) {
    return { ...usage, totalTokenCount: Math.round(sum) };
  }
  return null;
}

async function fetchTrainingTimestamps(
  kbEndpoint: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) {
  const url = resolveTrainingEndpoint(kbEndpoint);
  if (!url) {
    throw new Error("Training timestamps endpoint is not configured.");
  }
  const res = await fetch(url, { method: "GET", headers, cache: "no-store", signal });
  if (!res.ok) {
    throw new Error(`Training timestamps request failed (status ${res.status}).`);
  }
  const payload = await res.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("Training timestamps response is invalid.");
  }
  return payload as TrainingTimestamps;
}

async function sendTrainingCommand(options: {
  endpoint: string;
  headers: Record<string, string>;
  schema: unknown;
  userId: string;
  signal: AbortSignal;
}) {
  const requestPayload = buildRequestFromSchema(options.schema, TRAINING_COMMAND, options.userId);
  (requestPayload as Record<string, unknown>).user_id = options.userId;
  if (!("userId" in requestPayload)) {
    (requestPayload as Record<string, unknown>).userId = options.userId;
  }
  if (!("message" in requestPayload)) {
    (requestPayload as Record<string, unknown>).message = TRAINING_COMMAND;
  }

  return startChat({
    endpoint: options.endpoint,
    headers: options.headers,
    body: requestPayload,
    signal: options.signal,
  });
}

export function useIdleResumeTrainingCheck() {
  const { user, attributes, tokens, isAuthenticated, isLoading } = useUser();

  const userId = useMemo(
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

  const runningRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (!userId) return;
    if (runningRef.current) return;

    runningRef.current = true;
    try {
      const resolvedAuthHeader = (await resolveAuthorizationHeaderValue().catch(() => null)) ?? authHeader;
      const sessions = await fetchSessions(userId);
      for (const session of sessions) {
        const { kbEndpoint, kbKeyName, kbKeyValue } = resolveKbConfig(session.config ?? {});
        const { chatEndpoint, chatKeyName, chatKeyValue, chatRequestSchema } = resolveChatConfig(
          session.config ?? {},
        );
        if (!kbEndpoint || !chatEndpoint) continue;

        const headers: Record<string, string> = {
          accept: "application/json",
        };
        if (kbKeyValue) {
          headers[kbKeyName] = kbKeyValue;
        }
        if (resolvedAuthHeader) {
          headers.Authorization = resolvedAuthHeader;
        }

        const controller = new AbortController();
        let timestamps: TrainingTimestamps;
        try {
          timestamps = await fetchTrainingTimestamps(kbEndpoint, headers, controller.signal);
        } catch (error) {
          console.warn("[idle-resume] Unable to fetch training timestamps", {
            sessionId: session.id,
            error,
          });
          continue;
        }

        if (!isTrainingStale(timestamps, Date.now())) {
          continue;
        }

        const trainingKey = resolveTrainingTriggerKey(session, chatEndpoint);
        const lastTriggeredAt = readStoredTimestamp(trainingKey);
        const now = Date.now();
        if (lastTriggeredAt && now - lastTriggeredAt < TRAINING_TRIGGER_COOLDOWN_MS) {
          continue;
        }

        const chatHeaders: Record<string, string> = {
          accept: "application/json",
          "Content-Type": "application/json",
        };
        if (chatKeyValue) {
          chatHeaders[chatKeyName] = chatKeyValue;
        }
        if (resolvedAuthHeader) {
          chatHeaders.Authorization = resolvedAuthHeader;
        }

        const chatController = new AbortController();
        let response: StartChatResponse;
        try {
          response = await sendTrainingCommand({
            endpoint: chatEndpoint,
            headers: chatHeaders,
            schema: chatRequestSchema,
            userId,
            signal: chatController.signal,
          });
        } catch (error) {
          console.warn("[idle-resume] Unable to send training command", {
            sessionId: session.id,
            error,
          });
          continue;
        }

        writeStoredTimestamp(trainingKey, now);

        const { finalUsage } = normalizeFinalOutput(response);
        const walletUsage =
          deriveWalletUsage(finalUsage) ?? { totalTokenCount: TRAINING_FALLBACK_TOKEN_COST };
        void recordUserWalletUsage(userId, walletUsage).catch((error) => {
          console.warn("[idle-resume] Unable to record wallet usage for training", error);
        });
      }
    } catch (error) {
      console.warn("[idle-resume] Failed to run training check", error);
    } finally {
      runningRef.current = false;
    }
  }, [authHeader, userId]);

  const maybeRunCheck = useCallback(() => {
    if (typeof window === "undefined") return;
    if (isLoading || !isAuthenticated || !userId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const now = Date.now();
    const lastActiveAt = readStoredTimestamp(LAST_ACTIVE_KEY);
    const lastCheckAt = readStoredTimestamp(LAST_CHECK_KEY);
    const idleLongEnough = !lastActiveAt || now - lastActiveAt >= IDLE_THRESHOLD_MS;
    const checkAllowed = !lastCheckAt || now - lastCheckAt >= CHECK_COOLDOWN_MS;

    writeStoredTimestamp(LAST_ACTIVE_KEY, now);

    if (!idleLongEnough || !checkAllowed) {
      return;
    }

    writeStoredTimestamp(LAST_CHECK_KEY, now);
    void runCheck();
  }, [isAuthenticated, isLoading, runCheck, userId]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    maybeRunCheck();
  }, [isAuthenticated, isLoading, maybeRunCheck]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        writeStoredTimestamp(LAST_ACTIVE_KEY, Date.now());
        return;
      }
      if (document.visibilityState === "visible") {
        maybeRunCheck();
      }
    };

    const handleFocus = () => maybeRunCheck();
    const handleOnline = () => maybeRunCheck();
    const handlePageHide = () => writeStoredTimestamp(LAST_ACTIVE_KEY, Date.now());

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [maybeRunCheck]);
}
