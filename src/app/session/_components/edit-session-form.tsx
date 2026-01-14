"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import {
  fetchSessionDetail,
  type SessionConfig,
  type SessionRecord,
  updateSession,
} from "@/services/sessions";

const DEFAULT_KEY_NAME = "x-api-key";
const WEB_WIDGET_TYPES = new Set(["WebWidgetChatbot", "WebChatbot"]);

type FormState = {
  name: string;
  notes: string;
  type: string;
  chat_api_endpoint: string;
  chat_api_key: string;
  chat_api_key_name: string;
  chat_api_request_schema: string;
  chat_api_response_schema: string;
  train_chatbot_command: string;
  agent_config_endpoint: string;
  agent_config_key: string;
  agent_config_key_name: string;
  agent_kb_endpoint: string;
  agent_kb_key: string;
  agent_kb_key_name: string;
  web_widget_api_endpoint: string;
  web_widget_api_key: string;
  web_widget_api_key_name: string;
  web_widget_loader_url: string;
  web_widget_title: string;
  web_widget_position: string;
  web_widget_primary_color: string;
  web_widget_secondary_color: string;
  web_widget_accent_color: string;
  web_widget_primary_font: string;
  web_widget_secondary_font: string;
  web_widget_border_color: string;
  web_widget_border_radius: string;
  web_widget_require_consent: string;
  web_widget_capture_fields: string;
  web_widget_escalation_enabled: string;
  web_widget_debug: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  notes: "",
  type: "",
  chat_api_endpoint: "",
  chat_api_key: "",
  chat_api_key_name: DEFAULT_KEY_NAME,
  chat_api_request_schema: "",
  chat_api_response_schema: "",
  train_chatbot_command: "",
  agent_config_endpoint: "",
  agent_config_key: "",
  agent_config_key_name: DEFAULT_KEY_NAME,
  agent_kb_endpoint: "",
  agent_kb_key: "",
  agent_kb_key_name: DEFAULT_KEY_NAME,
  web_widget_api_endpoint: "",
  web_widget_api_key: "",
  web_widget_api_key_name: DEFAULT_KEY_NAME,
  web_widget_loader_url: "",
  web_widget_title: "",
  web_widget_position: "",
  web_widget_primary_color: "",
  web_widget_secondary_color: "",
  web_widget_accent_color: "",
  web_widget_primary_font: "",
  web_widget_secondary_font: "",
  web_widget_border_color: "",
  web_widget_border_radius: "",
  web_widget_require_consent: "",
  web_widget_capture_fields: "",
  web_widget_escalation_enabled: "",
  web_widget_debug: "",
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

function toDisplayable(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "undefined") return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeString(value: string) {
  return value.trim() || undefined;
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseBooleanValue(value: string): boolean | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}

export function EditSessionForm({ sessionId }: { sessionId: string }) {
  const { attributes, user, tokens } = useUser();
  const router = useRouter();

  const userId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isWebWidgetType = WEB_WIDGET_TYPES.has(form.type);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!userId) {
        setError("Missing user identity. Please sign in again.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { session: fetchedSession } = await fetchSessionDetail(sessionId, userId);
        if (!active) return;
        if (!fetchedSession) {
          setError("Agent not found.");
          setSession(null);
          return;
        }

        const cfg: SessionConfig = fetchedSession.config ?? {};
        setSession(fetchedSession);
        setForm({
          name: fetchedSession.name ?? "",
          notes: fetchedSession.notes ?? "",
          type: toDisplayable(cfg.type),
          chat_api_endpoint: toDisplayable(cfg.chat_api_endpoint),
          chat_api_key: toDisplayable(cfg.chat_api_key),
          chat_api_key_name: toDisplayable(cfg.chat_api_key_name) || DEFAULT_KEY_NAME,
          chat_api_request_schema: toDisplayable(cfg.chat_api_request_schema),
          chat_api_response_schema: toDisplayable(cfg.chat_api_response_schema),
          train_chatbot_command: toDisplayable(cfg.train_chatbot_command),
          agent_config_endpoint: toDisplayable(cfg.agent_config_endpoint),
          agent_config_key: toDisplayable(cfg.agent_config_key),
          agent_config_key_name: toDisplayable(cfg.agent_config_key_name) || DEFAULT_KEY_NAME,
          agent_kb_endpoint: toDisplayable(cfg.agent_kb_endpoint),
          agent_kb_key: toDisplayable(cfg.agent_kb_key),
          agent_kb_key_name: toDisplayable(cfg.agent_kb_key_name) || DEFAULT_KEY_NAME,
          web_widget_api_endpoint: toDisplayable(cfg.web_widget_api_endpoint),
          web_widget_api_key: toDisplayable(cfg.web_widget_api_key),
          web_widget_api_key_name: toDisplayable(cfg.web_widget_api_key_name) || DEFAULT_KEY_NAME,
          web_widget_loader_url: toDisplayable(cfg.web_widget_loader_url),
          web_widget_title: toDisplayable(cfg.web_widget_title),
          web_widget_position: toDisplayable(cfg.web_widget_position),
          web_widget_primary_color: toDisplayable(cfg.web_widget_primary_color),
          web_widget_secondary_color: toDisplayable(cfg.web_widget_secondary_color),
          web_widget_accent_color: toDisplayable(cfg.web_widget_accent_color),
          web_widget_primary_font: toDisplayable(cfg.web_widget_primary_font),
          web_widget_secondary_font: toDisplayable(cfg.web_widget_secondary_font),
          web_widget_border_color: toDisplayable(cfg.web_widget_border_color),
          web_widget_border_radius: toDisplayable(cfg.web_widget_border_radius),
          web_widget_require_consent: toDisplayable(cfg.web_widget_require_consent),
          web_widget_capture_fields: toDisplayable(cfg.web_widget_capture_fields),
          web_widget_escalation_enabled: toDisplayable(cfg.web_widget_escalation_enabled),
          web_widget_debug: toDisplayable(cfg.web_widget_debug),
        });
      } catch (err) {
        if (!active) return;
        console.error("[EditSessionForm] Unable to load session", err);
        setError("Unable to load this agent right now.");
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
  }, [sessionId, userId]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!userId) {
        setError("Missing user identity. Please sign in again.");
        return;
      }
      if (!session) {
        setError("Agent data is not loaded yet.");
        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
        const patchConfig: SessionConfig = {
          type: normalizeString(form.type),
          chat_api_endpoint: normalizeString(form.chat_api_endpoint),
          chat_api_key: normalizeString(form.chat_api_key),
          chat_api_key_name: normalizeString(form.chat_api_key_name) || DEFAULT_KEY_NAME,
          chat_api_request_schema: parseMaybeJson(form.chat_api_request_schema),
          chat_api_response_schema: parseMaybeJson(form.chat_api_response_schema),
          train_chatbot_command: normalizeString(form.train_chatbot_command),
          agent_config_endpoint: normalizeString(form.agent_config_endpoint),
          agent_config_key: normalizeString(form.agent_config_key),
          agent_config_key_name: normalizeString(form.agent_config_key_name) || DEFAULT_KEY_NAME,
          agent_kb_endpoint: normalizeString(form.agent_kb_endpoint),
          agent_kb_key: normalizeString(form.agent_kb_key),
          agent_kb_key_name: normalizeString(form.agent_kb_key_name) || DEFAULT_KEY_NAME,
          web_widget_api_endpoint: normalizeString(form.web_widget_api_endpoint),
          web_widget_api_key: normalizeString(form.web_widget_api_key),
          web_widget_api_key_name:
            normalizeString(form.web_widget_api_key_name) || DEFAULT_KEY_NAME,
          web_widget_loader_url: normalizeString(form.web_widget_loader_url),
          web_widget_title: normalizeString(form.web_widget_title),
          web_widget_position: normalizeString(form.web_widget_position),
          web_widget_primary_color: normalizeString(form.web_widget_primary_color),
          web_widget_secondary_color: normalizeString(form.web_widget_secondary_color),
          web_widget_accent_color: normalizeString(form.web_widget_accent_color),
          web_widget_primary_font: normalizeString(form.web_widget_primary_font),
          web_widget_secondary_font: normalizeString(form.web_widget_secondary_font),
          web_widget_border_color: normalizeString(form.web_widget_border_color),
          web_widget_border_radius: normalizeString(form.web_widget_border_radius),
          web_widget_require_consent: parseBooleanValue(form.web_widget_require_consent),
          web_widget_capture_fields: normalizeString(form.web_widget_capture_fields),
          web_widget_escalation_enabled: parseBooleanValue(form.web_widget_escalation_enabled),
          web_widget_debug: parseBooleanValue(form.web_widget_debug),
        };

        const updated = await updateSession(userId, sessionId, {
          name: form.name.trim() || session.name,
          notes: form.notes.trim(),
          config: patchConfig,
        });

        setSession(updated);
        setSuccess("Agent updated.");
      } catch (err) {
        console.error("[EditSessionForm] Unable to update session", err);
        setError("Unable to update this agent. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [form, session, sessionId, userId],
  );

  if (loading) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[180px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-dark-5 dark:text-dark-6">{error}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card"
    >
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-dark dark:text-white">Agent settings</h2>
          <p className="text-sm text-dark-5 dark:text-dark-6">
            Update the public-facing details and delivery settings for this agent.
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
            {success}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-dark dark:text-white">Basics</h3>
          <p className="text-sm text-dark-5 dark:text-dark-6">
            Name and type help your team understand where this agent is used.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="name">
              Agent Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              placeholder="Agent name"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="type">
              Type
            </label>
            <select
              id="type"
              name="type"
              value={form.type}
              onChange={handleChange}
              className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              disabled={saving}
            >
              <option value="">Select a type</option>
              <option value="WebWidgetChatbot">WebWidgetChatbot</option>
              <option value="IntranetChatbot">IntranetChatbot</option>
              <option value="WhatsAppChatbot">WhatsAppChatbot</option>
              <option value="WebChatbot">WebChatbot</option>
              <option value="API">API</option>
            </select>
            <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
              Choose the primary channel for this agent. Web Widget settings appear when Type is
              WebWidgetChatbot or WebChatbot.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
              placeholder="Optional notes"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
              Optional internal notes for your team.
            </p>
          </div>
        </div>
      </div>

      {isWebWidgetType ? (
        <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-dark dark:text-white">Web Widget</h3>
          <p className="text-sm text-dark-5 dark:text-dark-6">
            Configure the embedded widget experience. Leave blank if this agent is not used on the web.
          </p>
        </div>
        <div className="mt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Experience</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Title, placement, and visual style for the widget.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_title">
                  Widget Title
                </label>
                <input
                  id="web_widget_title"
                  name="web_widget_title"
                  type="text"
                  value={form.web_widget_title}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="Support Assistant"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_position">
                  Position
                </label>
                <select
                  id="web_widget_position"
                  name="web_widget_position"
                  value={form.web_widget_position}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={saving}
                >
                  <option value="">Select a position</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_primary_color">
                  Primary Color
                </label>
                <input
                  id="web_widget_primary_color"
                  name="web_widget_primary_color"
                  type="text"
                  value={form.web_widget_primary_color}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="#0f172a"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_secondary_color">
                  Secondary Color
                </label>
                <input
                  id="web_widget_secondary_color"
                  name="web_widget_secondary_color"
                  type="text"
                  value={form.web_widget_secondary_color}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="#f8fafc"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_accent_color">
                  Accent Color
                </label>
                <input
                  id="web_widget_accent_color"
                  name="web_widget_accent_color"
                  type="text"
                  value={form.web_widget_accent_color}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="#ca0538"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_primary_font">
                  Primary Font
                </label>
                <input
                  id="web_widget_primary_font"
                  name="web_widget_primary_font"
                  type="text"
                  value={form.web_widget_primary_font}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder='"Basis Grotesque Pro", sans-serif'
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_secondary_font">
                  Secondary Font
                </label>
                <input
                  id="web_widget_secondary_font"
                  name="web_widget_secondary_font"
                  type="text"
                  value={form.web_widget_secondary_font}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder='"Basis Grotesque Pro", sans-serif'
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_border_color">
                  Border Color
                </label>
                <input
                  id="web_widget_border_color"
                  name="web_widget_border_color"
                  type="text"
                  value={form.web_widget_border_color}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="#27303e"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_border_radius">
                  Border Radius
                </label>
                <input
                  id="web_widget_border_radius"
                  name="web_widget_border_radius"
                  type="text"
                  value={form.web_widget_border_radius}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="8"
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Behavior</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Consent and capture settings for user interactions.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_require_consent">
                  Require Consent
                </label>
                <select
                  id="web_widget_require_consent"
                  name="web_widget_require_consent"
                  value={form.web_widget_require_consent}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={saving}
                >
                  <option value="">Select</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_escalation_enabled">
                  Escalation Enabled
                </label>
                <select
                  id="web_widget_escalation_enabled"
                  name="web_widget_escalation_enabled"
                  value={form.web_widget_escalation_enabled}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={saving}
                >
                  <option value="">Select</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_debug">
                  Debug Mode
                </label>
                <select
                  id="web_widget_debug"
                  name="web_widget_debug"
                  value={form.web_widget_debug}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  disabled={saving}
                >
                  <option value="">Select</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_capture_fields">
                  Capture Fields (CSV)
                </label>
                <input
                  id="web_widget_capture_fields"
                  name="web_widget_capture_fields"
                  type="text"
                  value={form.web_widget_capture_fields}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="name,email,phone"
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  Comma-separated list of fields to collect before chat starts.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Integration</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Endpoints and keys used by the widget runtime.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_api_endpoint">
                  Widget API Endpoint
                </label>
                <input
                  id="web_widget_api_endpoint"
                  name="web_widget_api_endpoint"
                  type="text"
                  value={form.web_widget_api_endpoint}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/widget-api"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_api_key_name">
                  Widget API Key Name
                </label>
                <input
                  id="web_widget_api_key_name"
                  name="web_widget_api_key_name"
                  type="text"
                  value={form.web_widget_api_key_name}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_api_key">
                  Widget API Key
                </label>
                <input
                  id="web_widget_api_key"
                  name="web_widget_api_key"
                  type="text"
                  value={form.web_widget_api_key}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="API key"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="web_widget_loader_url">
                  Widget Loader URL
                </label>
                <input
                  id="web_widget_loader_url"
                  name="web_widget_loader_url"
                  type="text"
                  value={form.web_widget_loader_url}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/widget-loader.js"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>
        </div>
      ) : null}

      <details className="rounded-lg border border-stroke p-4 dark:border-dark-3 [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-dark dark:text-white">Advanced integrations</h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Optional settings for custom chat APIs, config endpoints, and knowledge base access.
            </p>
          </div>
          <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
            Optional
          </span>
        </summary>

        <div className="mt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Chat API</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Use when this agent connects to a custom chat backend.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="chat_api_endpoint">
                  Chat API Endpoint
                </label>
                <input
                  id="chat_api_endpoint"
                  name="chat_api_endpoint"
                  type="text"
                  value={form.chat_api_endpoint}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/chat"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="chat_api_key_name">
                  Chat API Key Name
                </label>
                <input
                  id="chat_api_key_name"
                  name="chat_api_key_name"
                  type="text"
                  value={form.chat_api_key_name}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="chat_api_key">
                  Chat API Key
                </label>
                <input
                  id="chat_api_key"
                  name="chat_api_key"
                  type="text"
                  value={form.chat_api_key}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="API key"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="train_chatbot_command">
                  Train Agent Command
                </label>
                <input
                  id="train_chatbot_command"
                  name="train_chatbot_command"
                  type="text"
                  value={form.train_chatbot_command}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="/train"
                  disabled={saving}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="chat_api_request_schema">
                  Request Schema (JSON)
                </label>
                <textarea
                  id="chat_api_request_schema"
                  name="chat_api_request_schema"
                  value={form.chat_api_request_schema}
                  onChange={handleChange}
                  rows={5}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder='{"prompt": "string"}'
                  disabled={saving}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="chat_api_response_schema">
                  Response Schema (JSON)
                </label>
                <textarea
                  id="chat_api_response_schema"
                  name="chat_api_response_schema"
                  value={form.chat_api_response_schema}
                  onChange={handleChange}
                  rows={5}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder='{"answer": "string"}'
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Agent Config</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Optional endpoint for live configuration updates.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_config_endpoint">
                  Agent Config Endpoint
                </label>
                <input
                  id="agent_config_endpoint"
                  name="agent_config_endpoint"
                  type="text"
                  value={form.agent_config_endpoint}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/config"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_config_key_name">
                  Agent Config Key Name
                </label>
                <input
                  id="agent_config_key_name"
                  name="agent_config_key_name"
                  type="text"
                  value={form.agent_config_key_name}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_config_key">
                  Agent Config Key
                </label>
                <input
                  id="agent_config_key"
                  name="agent_config_key"
                  type="text"
                  value={form.agent_config_key}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="API key"
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-dark dark:text-white">Agent KB</h4>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Optional knowledge base service integration.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_kb_endpoint">
                  Agent KB Endpoint
                </label>
                <input
                  id="agent_kb_endpoint"
                  name="agent_kb_endpoint"
                  type="text"
                  value={form.agent_kb_endpoint}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/kb"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_kb_key_name">
                  Agent KB Key Name
                </label>
                <input
                  id="agent_kb_key_name"
                  name="agent_kb_key_name"
                  type="text"
                  value={form.agent_kb_key_name}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="agent_kb_key">
                  Agent KB Key
                </label>
                <input
                  id="agent_kb_key"
                  name="agent_kb_key"
                  type="text"
                  value={form.agent_kb_key}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="API key"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-dark-5 dark:text-dark-6">
          Changes apply immediately after saving.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/session?id=${sessionId}`)}
            className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
            disabled={saving}
          >
            View Agent
          </button>
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
