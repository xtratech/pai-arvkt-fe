
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

const CONTROL_INPUT_CLASS =
  "block w-full rounded-lg border border-stroke/80 bg-white px-2.5 py-2 text-[12px] text-dark shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-dark-3 dark:bg-dark-2 dark:text-white";
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

function toFieldId(attribute: string) {
  return `widget-${attribute.replace(/[^a-z0-9]/gi, "-")}`;
}

function toTabId(label: string) {
  return `tab-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveHexColor(value: string, fallback?: string) {
  const trimmed = value.trim();
  if (HEX_COLOR_RE.test(trimmed)) return trimmed;
  if (fallback && HEX_COLOR_RE.test(fallback)) return fallback;
  return "#000000";
}

function resolveNumberFallback(option: WidgetOption) {
  if (typeof option.default === "number") return option.default;
  if (typeof option.min === "number") return option.min;
  return 0;
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
function InfoIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="10" cy="10" r="7.25" />
      <path strokeLinecap="round" d="M10 8.1v5" />
      <circle cx="10" cy="6.2" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
    </svg>
  );
}

type InfoTooltipProps = {
  content: string;
};

function InfoTooltip({ content }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Info"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stroke/70 text-dark-5 transition hover:border-primary hover:text-primary dark:border-dark-3 dark:text-dark-6"
      >
        <InfoIcon />
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl bg-dark px-3 py-2 text-xs text-white shadow-lg dark:bg-white dark:text-dark"
        >
          <span className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-dark dark:bg-white" />
          {content}
        </div>
      ) : null}
    </div>
  );
}
type ToggleSwitchProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  labelId?: string;
};

function ToggleSwitch({ value, onChange, disabled, labelId }: ToggleSwitchProps) {
  const isSet = value === "true" || value === "false";
  const isOn = value === "true";
  const trackClass = isOn
    ? "bg-primary"
    : isSet
      ? "bg-gray-2 dark:bg-dark-3"
      : "bg-gray-1/70 dark:bg-dark-4";

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!isSet) {
            onChange("true");
          } else {
            onChange(isOn ? "false" : "true");
          }
        }}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition ${trackClass} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span
          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
            isOn ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      <div className="flex items-center gap-2 text-[10px] text-dark-5 dark:text-dark-6">
        <span>{isSet ? (isOn ? "On" : "Off") : "Default"}</span>
        {isSet ? (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            className="rounded-full border border-stroke/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-dark-5 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-dark-6"
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

type OptionFieldProps = {
  option: WidgetOption;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  fieldId: string;
  labelId: string;
};

function OptionField({
  option,
  value,
  onChange,
  disabled,
  fieldId,
  labelId,
}: OptionFieldProps) {
  const defaultText =
    typeof option.default === "string"
      ? option.default
      : typeof option.default === "number" || typeof option.default === "boolean"
        ? String(option.default)
        : "";

  if (option.type === "enum") {
    return (
      <div className="relative">
        <select
          id={fieldId}
          name={option.attribute}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROL_INPUT_CLASS} appearance-none pr-8`}
          disabled={disabled}
        >
          <option value="">Use default</option>
          {(option.values ?? []).map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-dark-5 dark:text-dark-6">
          <ChevronIcon />
        </span>
      </div>
    );
  }

  if (option.type === "boolean") {
    return (
      <ToggleSwitch
        value={value}
        onChange={onChange}
        disabled={disabled}
        labelId={labelId}
      />
    );
  }

  if (option.type === "number") {
    const minValue = typeof option.min === "number" ? option.min : undefined;
    const maxValue = typeof option.max === "number" ? option.max : undefined;
    const numericValue = value.trim().length ? Number(value) : Number.NaN;
    const rangeValue = Number.isFinite(numericValue)
      ? numericValue
      : resolveNumberFallback(option);

    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-dark-5 dark:text-dark-6">
          {typeof minValue === "number" ? minValue : ""}
        </span>
        <input
          id={fieldId}
          name={option.attribute}
          type="range"
          min={minValue}
          max={maxValue}
          step="1"
          value={rangeValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gray-2 accent-primary dark:bg-dark-3"
          disabled={disabled}
        />
        <span className="text-[10px] text-dark-5 dark:text-dark-6">
          {typeof maxValue === "number" ? maxValue : ""}
        </span>
        <input
          type="number"
          value={value}
          min={minValue}
          max={maxValue}
          onChange={(event) => onChange(event.target.value)}
          className="w-20 rounded-lg border border-stroke/80 bg-white px-2 py-1.5 text-[12px] text-dark shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          placeholder={defaultText || undefined}
          disabled={disabled}
        />
      </div>
    );
  }

  if (option.type === "hex-color") {
    const swatchValue = resolveHexColor(value, defaultText || undefined);
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatchValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-stroke/70 bg-white p-0 shadow-sm dark:border-dark-3 dark:bg-dark-2"
          aria-label={formatAttributeLabel(option.attribute)}
          disabled={disabled}
        />
        <input
          id={fieldId}
          name={option.attribute}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={CONTROL_INPUT_CLASS}
          placeholder={defaultText || "#000000"}
          disabled={disabled}
        />
      </div>
    );
  }

  const inputType = option.type === "url" ? "url" : "text";
  return (
    <input
      id={fieldId}
      name={option.attribute}
      type={inputType}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL_INPUT_CLASS}
      placeholder={defaultText || undefined}
      disabled={disabled}
    />
  );
}
type ConfigurationTabsProps = {
  categories: WidgetCategory[];
  values: Record<string, string>;
  onChange: (attribute: string, value: string) => void;
  disabled?: boolean;
  connection: {
    loaderUrl: string;
    apiKeyName: string;
    onLoaderUrlChange: (value: string) => void;
    onApiKeyNameChange: (value: string) => void;
  };
};

function ConfigurationTabs({
  categories,
  values,
  onChange,
  disabled,
  connection,
}: ConfigurationTabsProps) {
  const connectionLabel = "Widget Connection";
  const connectionTabId = toTabId(connectionLabel);
  const tabItems = useMemo(
    () => [
      ...categories.map((category) => ({
        id: toTabId(category.name),
        label: category.name,
        description: category.description,
        count: category.options.length,
      })),
      {
        id: connectionTabId,
        label: connectionLabel,
        description: "Loader URL and API key header configuration.",
        count: 2,
      },
    ],
    [categories, connectionTabId],
  );

  const [activeTab, setActiveTab] = useState(
    tabItems[0]?.id ?? connectionTabId,
  );

  useEffect(() => {
    if (!tabItems.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabItems[0]?.id ?? connectionTabId);
    }
  }, [activeTab, connectionTabId, tabItems]);

  const activeCategory = categories.find(
    (category) => toTabId(category.name) === activeTab,
  );

  return (
    <div className="rounded-2xl border border-stroke/80 bg-white/70 shadow-sm backdrop-blur dark:border-dark-3 dark:bg-dark-2/70">
      <div className="border-b border-stroke/70 px-3 py-3 dark:border-dark-3">
        <div className="custom-scrollbar flex flex-wrap gap-2 overflow-x-auto" role="tablist">
          {tabItems.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-stroke/70 text-dark-5 hover:border-primary/50 hover:text-primary dark:border-dark-3 dark:text-dark-6"
                }`}
              >
                <span>{tab.label}</span>
                <span className="rounded-full bg-gray-1 px-1.5 py-0.5 text-[10px] text-dark-5 dark:bg-dark-3 dark:text-dark-6">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {activeTab === connectionTabId ? (
          <div
            role="tabpanel"
            id={`${connectionTabId}-panel`}
            aria-labelledby={`${connectionTabId}-tab`}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-primary dark:text-white">
                {connectionLabel}
              </h3>
              <p className="text-xs text-dark-5 dark:text-dark-6">
                Loader URL is required to preview and embed the widget.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  className="mb-2 block text-xs font-semibold text-dark dark:text-white"
                  htmlFor="web_widget_loader_url"
                >
                  Widget Loader URL
                </label>
                <input
                  id="web_widget_loader_url"
                  name="web_widget_loader_url"
                  type="text"
                  value={connection.loaderUrl}
                  onChange={(event) => connection.onLoaderUrlChange(event.target.value)}
                  className={CONTROL_INPUT_CLASS}
                  placeholder="https://example.com/widget-loader.js"
                  disabled={disabled}
                />
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-semibold text-dark dark:text-white"
                  htmlFor="web_widget_api_key_name"
                >
                  API Key Name
                </label>
                <input
                  id="web_widget_api_key_name"
                  name="web_widget_api_key_name"
                  type="text"
                  value={connection.apiKeyName}
                  onChange={(event) => connection.onApiKeyNameChange(event.target.value)}
                  className={CONTROL_INPUT_CLASS}
                  placeholder={DEFAULT_KEY_NAME}
                  disabled={disabled}
                />
                <p className="mt-1 text-[11px] text-dark-5 dark:text-dark-6">
                  Header name used by your widget API. Defaults to {DEFAULT_KEY_NAME}.
                </p>
              </div>
            </div>
          </div>
        ) : activeCategory ? (
          <div
            role="tabpanel"
            id={`${activeTab}-panel`}
            aria-labelledby={`${activeTab}-tab`}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-primary dark:text-white">
                {activeCategory.name}
              </h3>
              {activeCategory.description ? (
                <p className="text-xs text-dark-5 dark:text-dark-6">
                  {activeCategory.description}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeCategory.options.map((option) => {
                const fieldId = toFieldId(option.attribute);
                const labelId = `${fieldId}-label`;
                const isBoolean = option.type === "boolean";
                const label = formatAttributeLabel(option.attribute);
                const defaultText =
                  typeof option.default === "string"
                    ? option.default
                    : typeof option.default === "number" || typeof option.default === "boolean"
                      ? String(option.default)
                      : "";
                return (
                  <div
                    key={option.attribute}
                    className="rounded-xl border border-stroke/70 bg-white/80 p-3 shadow-sm dark:border-dark-3 dark:bg-dark-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label
                          id={labelId}
                          htmlFor={isBoolean ? undefined : fieldId}
                          className="text-xs font-semibold text-dark dark:text-white"
                        >
                          {label}
                        </label>
                        <div className="mt-0.5 text-[10px] font-mono text-dark-5 dark:text-dark-6">
                          {option.attribute}
                        </div>
                      </div>
                      <InfoTooltip content={option.description} />
                    </div>
                    <div className="mt-3">
                      <OptionField
                        option={option}
                        value={values[option.attribute] ?? ""}
                        onChange={(next) => onChange(option.attribute, next)}
                        disabled={disabled}
                        fieldId={fieldId}
                        labelId={labelId}
                      />
                    </div>
                    {defaultText ? (
                      <div className="mt-2 text-[10px] text-dark-5 dark:text-dark-6">
                        Default: {defaultText}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
type WidgetPreviewProps = {
  enabled: boolean;
  onToggle: () => void;
  canPreview: boolean;
  isWebWidgetType: boolean;
  loaderUrl: string;
  previewProps: {
    loaderUrl?: string;
    title?: string;
    position?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    primaryFont?: string;
    secondaryFont?: string;
    borderColor?: string;
    borderRadius?: string;
    requireConsent?: boolean;
    captureFields?: string;
    firstSuggestions?: string;
    escalationEnabled?: boolean;
    debug?: boolean;
  };
};

function WidgetPreview({
  enabled,
  onToggle,
  canPreview,
  isWebWidgetType,
  loaderUrl,
  previewProps,
}: WidgetPreviewProps) {
  const statusText = !isWebWidgetType
    ? "Agent type is not WebWidgetChatbot or WebChatbot."
    : loaderUrl
      ? "Loader URL configured."
      : "Loader URL missing.";

  return (
    <div className="rounded-2xl border border-stroke/80 bg-white/80 p-4 shadow-sm dark:border-dark-3 dark:bg-dark-2/80">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-primary dark:text-white">Preview</h3>
          <p className="text-xs text-dark-5 dark:text-dark-6">
            Launch the live widget with core appearance settings.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={!canPreview}
          className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enabled ? "Hide Preview" : "Enable Preview"}
        </button>
      </div>
      <div className="mt-3 text-xs text-dark-5 dark:text-dark-6">{statusText}</div>
      {!canPreview ? (
        <div className="mt-2 text-[11px] text-dark-5 dark:text-dark-6">
          Add a loader URL and ensure the agent type is correct to enable preview.
        </div>
      ) : null}
      {enabled && canPreview ? (
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
          firstSuggestions={previewProps.firstSuggestions}
          escalationEnabled={previewProps.escalationEnabled}
          debug={previewProps.debug}
        />
      ) : null}
    </div>
  );
}

type EmbedCodePanelProps = {
  code: string;
  onCopy: () => void;
  copyState: "idle" | "copied" | "error";
};

function EmbedCodePanel({ code, onCopy, copyState }: EmbedCodePanelProps) {
  return (
    <div className="rounded-2xl border border-stroke/80 bg-white/80 p-4 shadow-sm dark:border-dark-3 dark:bg-dark-2/80">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-primary dark:text-white">Embed Code</h3>
          <p className="text-xs text-dark-5 dark:text-dark-6">
            Copy this script tag into your site or tag manager.
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!code}
          className="inline-flex items-center rounded-full border border-stroke/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-dark transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white"
        >
          {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy Code"}
        </button>
      </div>
      {code ? (
        <pre className="custom-scrollbar mt-4 max-h-80 overflow-auto rounded-xl border border-stroke bg-white p-4 font-mono text-xs text-dark dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
          <code>{code}</code>
        </pre>
      ) : (
        <p className="mt-4 text-xs text-dark-5 dark:text-dark-6">
          Add a Widget Loader URL to generate the embed script.
        </p>
      )}
      <p className="mt-2 text-[11px] text-dark-5 dark:text-dark-6">
        API base and key attributes are omitted from the snippet for security.
      </p>
    </div>
  );
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyTimeoutRef = useRef<number | null>(null);

  const isWebWidgetType = useMemo(() => {
    const sessionType = session?.config?.type;
    return typeof sessionType === "string" && WEB_WIDGET_TYPES.has(sessionType);
  }, [session]);

  const canPreview = Boolean(isWebWidgetType && normalizeString(loaderUrl));

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

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

  const handleLoaderUrlChange = useCallback((value: string) => {
    setLoaderUrl(value);
    setSuccess(null);
  }, []);

  const handleApiKeyNameChange = useCallback((value: string) => {
    setApiKeyName(value);
    setSuccess(null);
  }, []);

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

  const handleCopy = useCallback(async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopyState("copied");
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.error("[WebWidgetEditor] Unable to copy embed code", err);
      setCopyState("error");
    }
  }, [embedCode]);

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
      firstSuggestions: getValue("data-first-suggestions"),
      escalationEnabled: parseBooleanValue(attributeValues["data-escalation-enabled"] ?? ""),
      debug: parseBooleanValue(attributeValues["data-debug"] ?? ""),
    };
  }, [attributeValues, loaderUrl]);
  if (loading) {
    return (
      <div className="rounded-2xl border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[160px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="rounded-2xl border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-dark-5 dark:text-dark-6">{error}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const statusBadge = normalizeString(loaderUrl) ? "Ready" : "Needs loader URL";

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          {success}
        </div>
      ) : null}
      {!isWebWidgetType ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          This agent is not marked as a WebWidgetChatbot or WebChatbot. Update the
          type to enable all widget settings.
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-stroke/80 bg-white/80 p-5 shadow-sm dark:border-dark-3 dark:bg-dark-2/80">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[#0ea5e9]/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-primary dark:text-white">
              Web Widget Editor Dashboard
            </h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Fine tune the visual system and runtime behavior for your embedded
              widget.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-stroke/70 bg-white/80 px-3 py-2 text-xs text-dark shadow-sm dark:border-dark-3 dark:bg-dark-3 dark:text-white">
              <div className="text-[10px] uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Status
              </div>
              <div className="font-semibold">{statusBadge}</div>
            </div>
            <div className="rounded-xl border border-stroke/70 bg-white/80 px-3 py-2 text-xs text-dark shadow-sm dark:border-dark-3 dark:bg-dark-3 dark:text-white">
              <div className="text-[10px] uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Categories
              </div>
              <div className="font-semibold">{WIDGET_CATEGORIES.length}</div>
            </div>
            <div className="rounded-xl border border-stroke/70 bg-white/80 px-3 py-2 text-xs text-dark shadow-sm dark:border-dark-3 dark:bg-dark-3 dark:text-white">
              <div className="text-[10px] uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Options
              </div>
              <div className="font-semibold">{ALL_OPTIONS.length}</div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ConfigurationTabs
            categories={WIDGET_CATEGORIES}
            values={attributeValues}
            onChange={handleAttributeChange}
            disabled={saving}
            connection={{
              loaderUrl,
              apiKeyName,
              onLoaderUrlChange: handleLoaderUrlChange,
              onApiKeyNameChange: handleApiKeyNameChange,
            }}
          />
        </div>

        <div className="space-y-6">
          <WidgetPreview
            enabled={previewEnabled}
            onToggle={() => setPreviewEnabled((prev) => !prev)}
            canPreview={canPreview}
            isWebWidgetType={isWebWidgetType}
            loaderUrl={loaderUrl}
            previewProps={previewProps}
          />

          <EmbedCodePanel code={embedCode} onCopy={handleCopy} copyState={copyState} />
        </div>
      </div>
    </div>
  );
}
