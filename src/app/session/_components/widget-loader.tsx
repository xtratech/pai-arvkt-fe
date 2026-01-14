"use client";

import { useEffect } from "react";

const SCRIPT_ID = "session-web-widget-loader";
const SECONDARY_STYLE_ID = "session-web-widget-secondary-style";
const WIDGET_ROOT_ID = "quooker-widget-root";
const WIDGET_STYLE_ID = "quooker-widget-styles";

declare global {
  interface Window {
    __QUOOKER_WIDGET_LOADER__?: boolean;
  }
}

type WidgetLoaderProps = {
  loaderUrl?: string | null;
  title?: string | null;
  position?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  primaryFont?: string | null;
  secondaryFont?: string | null;
  requireConsent?: boolean | string | null;
  captureFields?: string | null;
  escalationEnabled?: boolean | string | null;
  debug?: boolean | string | null;
};

function normalizeString(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeBoolean(value?: boolean | string | null) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function normalizeCaptureFields(value?: string | null) {
  if (!value) return "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function setDataAttribute(
  script: HTMLScriptElement,
  attribute: string,
  value?: string | null,
) {
  if (!value) {
    script.removeAttribute(attribute);
    return;
  }
  script.setAttribute(attribute, value);
}

function setBooleanAttribute(
  script: HTMLScriptElement,
  attribute: string,
  value?: boolean,
) {
  if (typeof value !== "boolean") {
    script.removeAttribute(attribute);
    return;
  }
  script.setAttribute(attribute, value ? "true" : "false");
}

export function WidgetLoader({
  loaderUrl,
  title,
  position,
  primaryColor,
  secondaryColor,
  accentColor,
  primaryFont,
  secondaryFont,
  requireConsent,
  captureFields,
  escalationEnabled,
  debug,
}: WidgetLoaderProps) {
  useEffect(() => {
    const normalizedLoaderUrl = normalizeString(loaderUrl);
    if (!normalizedLoaderUrl) return;

    let resolvedUrl = "";
    try {
      resolvedUrl = new URL(normalizedLoaderUrl, window.location.href).toString();
    } catch {
      return;
    }

    const existingById = document.getElementById(SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    const existingBySrc = Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[src]"),
    ).find((script) => script.src === resolvedUrl);
    const isNewScript = !existingById && !existingBySrc;
    const script = existingById ?? existingBySrc ?? document.createElement("script");
    const ownsScript = Boolean(existingById) || isNewScript;

    if (isNewScript) {
      script.id = SCRIPT_ID;
      script.src = resolvedUrl;
      script.async = true;
    } else if (existingById && script.src !== resolvedUrl) {
      script.src = resolvedUrl;
    }

    setDataAttribute(script, "data-title", normalizeString(title));

    const normalizedPosition = normalizeString(position);
    if (normalizedPosition === "left" || normalizedPosition === "right") {
      setDataAttribute(script, "data-position", normalizedPosition);
    } else {
      script.removeAttribute("data-position");
    }

    setDataAttribute(script, "data-primary-color", normalizeString(primaryColor));
    setDataAttribute(script, "data-secondary-color", normalizeString(secondaryColor));
    setDataAttribute(script, "data-accent-color", normalizeString(accentColor));
    setDataAttribute(script, "data-primary-font", normalizeString(primaryFont));
    setDataAttribute(script, "data-secondary-font", normalizeString(secondaryFont));

    const normalizedCaptureFields = normalizeCaptureFields(captureFields);
    setDataAttribute(script, "data-capture-fields", normalizedCaptureFields);

    setBooleanAttribute(script, "data-require-consent", normalizeBoolean(requireConsent));
    setBooleanAttribute(
      script,
      "data-escalation-enabled",
      normalizeBoolean(escalationEnabled),
    );
    setBooleanAttribute(script, "data-debug", normalizeBoolean(debug));
    // Never pass API credentials through the loader attributes.
    script.removeAttribute("data-api-base");
    script.removeAttribute("data-api-key");

    const normalizedSecondary = normalizeString(secondaryColor);
    const existingStyle = document.getElementById(SECONDARY_STYLE_ID) as
      | HTMLStyleElement
      | null;
    if (normalizedSecondary) {
      const styleTag = existingStyle ?? document.createElement("style");
      styleTag.id = SECONDARY_STYLE_ID;
      // Expose secondary color as a CSS variable; the widget may ignore it if unsupported.
      styleTag.textContent = `#${WIDGET_ROOT_ID}{--qwk-secondary:${normalizedSecondary};}`;
      if (!styleTag.parentElement) {
        document.head.appendChild(styleTag);
      }
    } else {
      existingStyle?.remove();
    }

    if (isNewScript && document.body) {
      document.body.appendChild(script);
    }

    return () => {
      if (ownsScript) {
        const ownedScript = document.getElementById(SCRIPT_ID);
        ownedScript?.remove();
      }

      document.getElementById(WIDGET_ROOT_ID)?.remove();
      document.getElementById(WIDGET_STYLE_ID)?.remove();
      document.getElementById(SECONDARY_STYLE_ID)?.remove();

      const loaderFlag = window.__QUOOKER_WIDGET_LOADER__;
      if (loaderFlag) {
        delete window.__QUOOKER_WIDGET_LOADER__;
      }
    };
  }, [
    captureFields,
    debug,
    escalationEnabled,
    loaderUrl,
    position,
    primaryColor,
    requireConsent,
    secondaryColor,
    accentColor,
    primaryFont,
    secondaryFont,
    title,
  ]);

  return null;
}
