"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/contexts/user-context";
import {
  fetchSessionDetail,
  updateSession,
  type SessionConfig,
  type SessionRecord,
} from "@/services/sessions";
import widgetConfigDefinition from "@/app/session/_components/widget-config-definition.json";
import { WidgetLoader } from "@/app/session/_components/widget-loader";

type WidgetOptionType = "string" | "enum" | "hex-color" | "number" | "boolean" | "url";

type WidgetOption = {
  attribute: string;
  description: string;
  type: WidgetOptionType;
  default?: string | number | boolean;
  values?: string[];
  min?: number | null;
  max?: number | null;
};

type WidgetCategory = {
  name: string;
  description?: string;
  options: WidgetOption[];
};

const DEFAULT_KEY_NAME = "x-api-key";
const WEB_WIDGET_TYPES = new Set(["WebWidgetChatbot", "WebChatbot"]);

const widgetSchema = (widgetConfigDefinition as {
  configurationSchema?: { categories?: WidgetCategory[] };
})?.configurationSchema;

const WIDGET_CATEGORIES: WidgetCategory[] = Array.isArray(widgetSchema?.categories)
  ? widgetSchema.categories
  : [];

const ALL_OPTIONS = WIDGET_CATEGORIES.flatMap((category) => category.options ?? []);
const ATTRIBUTE_ORDER = ALL_OPTIONS.map((option) => option.attribute);

const ATTRIBUTE_TO_CONFIG_KEY: Record<string, keyof SessionConfig> = {
  "data-title": "web_widget_title",
  "data-position": "web_widget_position",
  "data-primary-color": "web_widget_primary_color",
  "data-secondary-color": "web_widget_secondary_color",
  "data-accent-color": "web_widget_accent_color",
  "data-primary-font": "web_widget_primary_font",
  "data-secondary-font": "web_widget_secondary_font",
  "data-border-color": "web_widget_border_color",
  "data-border-radius": "web_widget_border_radius",
  "data-require-consent": "web_widget_require_consent",
  "data-capture-fields": "web_widget_capture_fields",
  "data-escalation-enabled": "web_widget_escalation_enabled",
  "data-debug": "web_widget_debug",
  "data-api-base": "web_widget_api_endpoint",
  "data-api-key": "web_widget_api_key",
};

const BOOLEAN_CONFIG_ATTRIBUTES = new Set([
  "data-require-consent",
  "data-escalation-enabled",
  "data-debug",
]);

const OMITTED_EMBED_ATTRIBUTES = new Set(["data-api-base", "data-api-key"]);

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

function normalizeString(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function parseBooleanValue(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}

function stringifyAttributeValue(value: unknown) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

function formatAttributeLabel(attribute: string) {
  return attribute
    .replace(/^data-/, "")
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getCustomAttributes(config?: SessionConfig) {
  const candidate = config?.web_widget_attributes;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}

function coerceCustomAttributeValue(option: WidgetOption, rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;

  switch (option.type) {
    case "boolean": {
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      return undefined;
    }
    case "number": {
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : undefined;
    }
    case "enum": {
      if (option.values?.length && !option.values.includes(trimmed)) {
        return undefined;
      }
      return trimmed;
    }
    default:
      return trimmed;
  }
}

function buildEmbedCode(loaderUrl: string, attributes: Record<string, string>) {
  const trimmedUrl = loaderUrl.trim();
  if (!trimmedUrl) return "";
  const lines = [`<script src='${escapeHtmlAttribute(trimmedUrl)}'`];
  lines.push("  async");
  for (const attribute of ATTRIBUTE_ORDER) {
    if (OMITTED_EMBED_ATTRIBUTES.has(attribute)) continue;
    const rawValue = attributes[attribute];
    if (typeof rawValue !== "string") continue;
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) continue;
    lines.push(`  ${attribute}='${escapeHtmlAttribute(trimmedValue)}'`);
  }
  lines.push("></script>");
  return lines.join("\n");
}

type WebWidgetEditorProps = {
  sessionId: string;
};

export function WebWidgetEditor({ sessionId }: WebWidgetEditorProps) {
  const { attributes, user, tokens } = useUser();
  const userId = useMemo(
    () =>
      deriveUserId({
        attributes,
        user,
        tokens,
      }),
    [attributes, user, tokens],
  );

  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaderUrl, setLoaderUrl] = useState("");
  const [apiKeyName, setApiKeyName] = useState(DEFAULT_KEY_NAME);
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const [previewEnabled, setPreviewEnabled] = useState(false);

  const isWebWidgetType = useMemo(() => {
    const sessionType = session?.config?.type;
    return typeof sessionType === "string" && WEB_WIDGET_TYPES.has(sessionType);
  }, [session]);

  const canPreview = Boolean(normalizeString(loaderUrl) ?? "");

  useEffect(() => {
    if (!canPreview && previewEnabled) {
      setPreviewEnabled(false);
    }
  }, [canPreview, previewEnabled]);

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
      setSuccess(null);

      try {
        const { session: fetchedSession } = await fetchSessionDetail(sessionId, userId);
        if (!active) return;
        if (!fetchedSession) {
          setSession(null);
          setError("Agent not found.");
          return;
        }

        const cfg = fetchedSession.config ?? {};
        const customAttributes = getCustomAttributes(cfg);
        const nextAttributes: Record<string, string> = {};

        for (const option of ALL_OPTIONS) {
          const mappedKey = ATTRIBUTE_TO_CONFIG_KEY[option.attribute];
          if (mappedKey) {
            const mappedValue = stringifyAttributeValue(cfg[mappedKey]);
            if (mappedValue !== "") {
              nextAttributes[option.attribute] = mappedValue;
            }
            continue;
          }

          if (customAttributes && option.attribute in customAttributes) {
            const customValue = stringifyAttributeValue(customAttributes[option.attribute]);
            if (customValue !== "") {
              nextAttributes[option.attribute] = customValue;
            }
          }
        }

        setSession(fetchedSession);
        setLoaderUrl(stringifyAttributeValue(cfg.web_widget_loader_url));
        setApiKeyName(
          stringifyAttributeValue(cfg.web_widget_api_key_name) || DEFAULT_KEY_NAME,
        );
        setAttributeValues(nextAttributes);
      } catch (err) {
        if (!active) return;
        console.error("[WebWidgetEditor] Unable to load session detail", err);
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

  const handleAttributeChange = useCallback((attribute: string, value: string) => {
    setAttributeValues((prev) => ({
      ...prev,
      [attribute]: value,
    }));
    setSuccess(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!userId) {
      setError("Missing user identity. Please sign in again.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const configPatch: SessionConfig = {
        web_widget_loader_url: normalizeString(loaderUrl),
        web_widget_api_key_name: normalizeString(apiKeyName) || DEFAULT_KEY_NAME,
      };

      for (const [attribute, configKey] of Object.entries(ATTRIBUTE_TO_CONFIG_KEY)) {
        const rawValue = attributeValues[attribute] ?? "";
        if (BOOLEAN_CONFIG_ATTRIBUTES.has(attribute)) {
          configPatch[configKey] = parseBooleanValue(rawValue);
        } else {
          configPatch[configKey] = normalizeString(rawValue);
        }
      }

      const existingCustomAttributes = getCustomAttributes(session?.config);
      const customAttributes: Record<string, unknown> = existingCustomAttributes
        ? { ...existingCustomAttributes }
        : {};
      for (const mappedAttribute of Object.keys(ATTRIBUTE_TO_CONFIG_KEY)) {
        if (mappedAttribute in customAttributes) {
          delete customAttributes[mappedAttribute];
        }
      }
      for (const option of ALL_OPTIONS) {
        if (ATTRIBUTE_TO_CONFIG_KEY[option.attribute]) {
          continue;
        }
        const rawValue = attributeValues[option.attribute] ?? "";
        const coerced = coerceCustomAttributeValue(option, rawValue);
        if (typeof coerced !== "undefined") {
          customAttributes[option.attribute] = coerced;
        } else if (option.attribute in customAttributes) {
          delete customAttributes[option.attribute];
        }
      }

      configPatch.web_widget_attributes = Object.keys(customAttributes).length
        ? customAttributes
        : undefined;

      const updated = await updateSession(userId, sessionId, { config: configPatch });
      setSession(updated);
      setSuccess("Web widget settings saved.");
    } catch (err) {
      console.error("[WebWidgetEditor] Unable to save web widget settings", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to save web widget settings.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [apiKeyName, attributeValues, loaderUrl, session, sessionId, userId]);

  const normalizedAttributes = useMemo(() => {
    const next: Record<string, string> = {};
    for (const attribute of ATTRIBUTE_ORDER) {
      const rawValue = attributeValues[attribute];
      if (typeof rawValue !== "string") continue;
      const trimmedValue = rawValue.trim();
      if (!trimmedValue) continue;
      next[attribute] = trimmedValue;
    }
    return next;
  }, [attributeValues]);

  const embedCode = useMemo(
    () => buildEmbedCode(loaderUrl, normalizedAttributes),
    [loaderUrl, normalizedAttributes],
  );

  const previewProps = useMemo(() => {
    const getValue = (attribute: string) =>
      normalizeString(attributeValues[attribute] ?? "");
    return {
      loaderUrl: normalizeString(loaderUrl),
      title: getValue("data-title"),
      position: getValue("data-position"),
      primaryColor: getValue("data-primary-color"),
      secondaryColor: getValue("data-secondary-color"),
      accentColor: getValue("data-accent-color"),
      primaryFont: getValue("data-primary-font"),
      secondaryFont: getValue("data-secondary-font"),
      borderColor: getValue("data-border-color"),
      borderRadius: getValue("data-border-radius"),
      requireConsent: parseBooleanValue(attributeValues["data-require-consent"] ?? ""),
      captureFields: getValue("data-capture-fields"),
      escalationEnabled: parseBooleanValue(attributeValues["data-escalation-enabled"] ?? ""),
      debug: parseBooleanValue(attributeValues["data-debug"] ?? ""),
    };
  }, [attributeValues, loaderUrl]);

  const renderOptionInput = (option: WidgetOption) => {
    const value = attributeValues[option.attribute] ?? "";
    const fieldId = `widget-${option.attribute}`;
    const isDisabled = saving || loading;
    const inputClassName =
      "block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white";
    const defaultText =
      typeof option.default === "string"
        ? option.default
        : typeof option.default === "number" || typeof option.default === "boolean"
          ? String(option.default)
          : "";

    if (option.type === "enum") {
      return (
        <select
          id={fieldId}
          name={option.attribute}
          value={value}
          onChange={(event) => handleAttributeChange(option.attribute, event.target.value)}
          className={inputClassName}
          disabled={isDisabled}
        >
          <option value="">Use default</option>
          {(option.values ?? []).map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      );
    }

    if (option.type === "boolean") {
      return (
        <select
          id={fieldId}
          name={option.attribute}
          value={value}
          onChange={(event) => handleAttributeChange(option.attribute, event.target.value)}
          className={inputClassName}
          disabled={isDisabled}
        >
          <option value="">Use default</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    if (option.type === "number") {
      return (
        <input
          id={fieldId}
          name={option.attribute}
          type="number"
          min={typeof option.min === "number" ? option.min : undefined}
          max={typeof option.max === "number" ? option.max : undefined}
          value={value}
          onChange={(event) => handleAttributeChange(option.attribute, event.target.value)}
          className={inputClassName}
          placeholder={defaultText || undefined}
          disabled={isDisabled}
        />
      );
    }

    const inputType = option.type === "url" ? "url" : "text";
    return (
      <input
        id={fieldId}
        name={option.attribute}
        type={inputType}
        value={value}
        onChange={(event) => handleAttributeChange(option.attribute, event.target.value)}
        className={inputClassName}
        placeholder={defaultText || undefined}
        disabled={isDisabled}
      />
    );
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[160px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="rounded-lg border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-dark-5 dark:text-dark-6">{error}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          {success}
        </div>
      ) : null}
      {!isWebWidgetType ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          This agent is not marked as a WebWidgetChatbot or WebChatbot. Update the
          type to enable all widget settings.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dark-5 dark:text-dark-6">
          Configure widget appearance, behavior, and embed attributes for this agent.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-dark dark:text-white">
                Widget Connection
              </h3>
              <p className="text-sm text-dark-5 dark:text-dark-6">
                The loader URL is required to preview and embed the widget.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  className="mb-2 block text-sm font-medium text-dark dark:text-white"
                  htmlFor="web_widget_loader_url"
                >
                  Widget Loader URL
                </label>
                <input
                  id="web_widget_loader_url"
                  name="web_widget_loader_url"
                  type="text"
                  value={loaderUrl}
                  onChange={(event) => {
                    setLoaderUrl(event.target.value);
                    setSuccess(null);
                  }}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder="https://example.com/widget-loader.js"
                  disabled={saving}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-dark dark:text-white"
                  htmlFor="web_widget_api_key_name"
                >
                  API Key Name
                </label>
                <input
                  id="web_widget_api_key_name"
                  name="web_widget_api_key_name"
                  type="text"
                  value={apiKeyName}
                  onChange={(event) => {
                    setApiKeyName(event.target.value);
                    setSuccess(null);
                  }}
                  className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  Header name used by your widget API. Defaults to {DEFAULT_KEY_NAME}.
                </p>
              </div>
            </div>
          </div>

          {WIDGET_CATEGORIES.map((category) => (
            <div
              key={category.name}
              className="rounded-lg border border-stroke p-4 dark:border-dark-3"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-dark dark:text-white">
                  {category.name}
                </h3>
                {category.description ? (
                  <p className="text-sm text-dark-5 dark:text-dark-6">
                    {category.description}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {category.options.map((option) => {
                  const defaultText =
                    typeof option.default === "string"
                      ? option.default
                      : typeof option.default === "number" || typeof option.default === "boolean"
                        ? String(option.default)
                        : "";
                  const hasRange =
                    typeof option.min === "number" || typeof option.max === "number";
                  return (
                    <div key={option.attribute}>
                      <label
                        className="mb-1 block text-sm font-medium text-dark dark:text-white"
                        htmlFor={`widget-${option.attribute}`}
                      >
                        {formatAttributeLabel(option.attribute)}
                      </label>
                      <div className="mb-2 text-[11px] font-mono text-dark-5 dark:text-dark-6">
                        {option.attribute}
                      </div>
                      {renderOptionInput(option)}
                      <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                        {option.description}
                      </p>
                      {defaultText ? (
                        <p className="mt-1 text-[11px] text-dark-5 dark:text-dark-6">
                          Default: {defaultText}
                        </p>
                      ) : null}
                      {hasRange ? (
                        <p className="mt-1 text-[11px] text-dark-5 dark:text-dark-6">
                          Range:{" "}
                          {typeof option.min === "number" ? option.min : "none"} -{" "}
                          {typeof option.max === "number" ? option.max : "none"}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-dark dark:text-white">Preview</h3>
              <p className="text-sm text-dark-5 dark:text-dark-6">
                Launch a live widget preview using the loader URL and key styling
                attributes.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewEnabled((prev) => !prev)}
                disabled={!canPreview}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewEnabled ? "Hide Preview" : "Preview Widget"}
              </button>
              {!canPreview ? (
                <span className="text-xs text-dark-5 dark:text-dark-6">
                  Provide a loader URL to enable preview.
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-dark-5 dark:text-dark-6">
              Preview applies core appearance settings. Advanced attributes are
              included in the embed snippet.
            </p>
            {previewEnabled && canPreview ? (
              <WidgetLoader
                loaderUrl={previewProps.loaderUrl}
                title={previewProps.title}
                position={previewProps.position}
                primaryColor={previewProps.primaryColor}
                secondaryColor={previewProps.secondaryColor}
                accentColor={previewProps.accentColor}
                primaryFont={previewProps.primaryFont}
                secondaryFont={previewProps.secondaryFont}
                borderColor={previewProps.borderColor}
                borderRadius={previewProps.borderRadius}
                requireConsent={previewProps.requireConsent}
                captureFields={previewProps.captureFields}
                escalationEnabled={previewProps.escalationEnabled}
                debug={previewProps.debug}
              />
            ) : null}
          </div>

          <div className="rounded-lg border border-stroke p-4 dark:border-dark-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-dark dark:text-white">
                Embed Code
              </h3>
              <p className="text-sm text-dark-5 dark:text-dark-6">
                Copy this script tag into your site or tag manager.
              </p>
            </div>
            {embedCode ? (
              <pre className="custom-scrollbar mt-4 max-h-80 overflow-auto rounded-xl border border-stroke bg-white p-4 font-mono text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
                <code>{embedCode}</code>
              </pre>
            ) : (
              <p className="mt-4 text-sm text-dark-5 dark:text-dark-6">
                Add a Widget Loader URL to generate the embed script.
              </p>
            )}
            <p className="mt-2 text-xs text-dark-5 dark:text-dark-6">
              API base and key attributes are omitted from the snippet for security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
