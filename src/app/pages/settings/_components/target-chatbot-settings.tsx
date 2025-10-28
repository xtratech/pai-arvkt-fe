"use client";

import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import {
  apiGet,
  apiPut,
  ApiClientError,
} from "@/services/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";

type TargetChatbotSettings = {
  apiUrl: string;
  apiParamName: string;
  apiKey: string;
};

type FeedbackState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const DEFAULT_SETTINGS: TargetChatbotSettings = {
  apiUrl: "",
  apiParamName: "x-api-key",
  apiKey: "",
};

const SETTINGS_PATH =
  process.env.NEXT_PUBLIC_TARGET_CHATBOT_SETTINGS_PATH ??
  "/settings/target-chatbot";

export function TargetChatbotSettingsForm() {
  const [formData, setFormData] = useState<TargetChatbotSettings>(
    DEFAULT_SETTINGS,
  );
  const [initialValues, setInitialValues] = useState<TargetChatbotSettings>(
    DEFAULT_SETTINGS,
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(() => {
    return (
      formData.apiUrl !== initialValues.apiUrl ||
      formData.apiParamName !== initialValues.apiParamName ||
      formData.apiKey !== initialValues.apiKey
    );
  }, [formData, initialValues]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = event.target;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    },
    [],
  );

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);
      setFeedback(null);

      try {
        const remoteSettings = await apiGet<TargetChatbotSettings>(SETTINGS_PATH);
        if (!active || !remoteSettings) {
          return;
        }

        const normalized: TargetChatbotSettings = {
          apiUrl: remoteSettings.apiUrl ?? "",
          apiParamName: remoteSettings.apiParamName ?? DEFAULT_SETTINGS.apiParamName,
          apiKey: remoteSettings.apiKey ?? "",
        };

        setFormData(normalized);
        setInitialValues({ ...normalized });
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof ApiClientError && error.data && typeof error.data === "object"
            ? String((error.data as Record<string, unknown>).message ?? "Failed to load settings. Showing last known values.")
            : "Failed to load settings. Showing last known values.";
        setFeedback({ type: "error", message });
        setFormData(DEFAULT_SETTINGS);
        setInitialValues(DEFAULT_SETTINGS);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFeedback(null);
      setSaving(true);

      try {
        await apiPut(SETTINGS_PATH, {
          body: {
            apiUrl: formData.apiUrl,
            apiParamName: formData.apiParamName,
            apiKey: formData.apiKey,
          },
        });

        setInitialValues({ ...formData });
        setFeedback({
          type: "success",
          message: "Settings saved successfully.",
        });
      } catch (error) {
        const apiError =
          error instanceof ApiClientError ? error : undefined;
        const message =
          (apiError?.data &&
            typeof apiError.data === "object" &&
            apiError.data !== null &&
            "message" in apiError.data
            ? String((apiError.data as Record<string, unknown>).message)
            : apiError?.message) ||
          "Unable to save settings. Please try again.";

        setFeedback({
          type: "error",
          message,
        });
      } finally {
        setSaving(false);
      }
    },
    [formData],
  );

  const handleReset = useCallback(() => {
    setFormData({ ...initialValues });
    setFeedback(null);
  }, [initialValues]);

  return (
    <ShowcaseSection title="Target Chatbot Details" className="!p-7">
      <form onSubmit={handleSubmit} className="space-y-5.5">
        <InputGroup
          className="space-y-2"
          type="text"
          name="apiUrl"
          label="API URL"
          placeholder="https://your-api-id.execute-api.ap-southeast-1.amazonaws.com/Prod/resource"
          value={formData.apiUrl}
          handleChange={handleChange}
          height="sm"
          required
          disabled={loading || saving}
        />

        <InputGroup
          className="space-y-2"
          type="text"
          name="apiParamName"
          label="API Parameter Name"
          placeholder="x-api-key"
          value={formData.apiParamName}
          handleChange={handleChange}
          height="sm"
          required
          disabled={loading || saving}
        />

        <InputGroup
          className="space-y-2"
          type="text"
          name="apiKey"
          label="API Key"
          placeholder="Paste the API key used for x-api-key header"
          value={formData.apiKey}
          handleChange={handleChange}
          height="sm"
          disabled={loading || saving}
        />

        {feedback && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          {loading && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Loading settings…
            </span>
          )}

          <div className="ml-auto flex gap-3">
            <button
              className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 disabled:cursor-not-allowed disabled:opacity-60 dark:border-dark-3 dark:text-white"
              type="button"
              onClick={handleReset}
              disabled={saving || loading || !isDirty}
            >
              Reset
            </button>

            <button
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={saving || loading || !isDirty}
            >
              Save
              {saving && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent" />
              )}
            </button>
          </div>
        </div>
      </form>
    </ShowcaseSection>
  );
}
