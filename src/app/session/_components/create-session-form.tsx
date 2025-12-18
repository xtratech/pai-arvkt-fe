"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/services/sessions";
import { useUser } from "@/contexts/user-context";

const DEFAULT_SYSTEM_PROMPT_FILE = process.env.NEXT_PUBLIC_SYSTEMPROMPT_FILE_NAME || "systemprompt-v1.json";
const DEFAULT_KB_FILE = process.env.NEXT_PUBLIC_KB_FILE_NAME || "kb-v1.json";

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

type FormState = {
  name: string;
  notes: string;
  system_prompt_file_name: string;
  knowledgebase_file_name: string;
};

export function CreateSessionForm() {
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

  const [form, setForm] = useState<FormState>({
    name: "",
    notes: "",
    system_prompt_file_name: DEFAULT_SYSTEM_PROMPT_FILE,
    knowledgebase_file_name: DEFAULT_KB_FILE,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

      setSaving(true);
      setError(null);

      try {
        const created = await createSession(userId, {
          name: form.name.trim(),
          notes: form.notes.trim(),
          system_prompt_file_name: form.system_prompt_file_name.trim(),
          knowledgebase_file_name: form.knowledgebase_file_name.trim(),
        });
        router.replace(`/session?id=${created.id}`);
        router.refresh();
      } catch (err) {
        console.error("[CreateSessionForm] Unable to create session", err);
        setError("Unable to create session. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [form, userId, router],
  );

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
      <div>
        <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="name">
          Session Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={form.name}
          onChange={handleChange}
          className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
          placeholder="Give your session a name"
          disabled={saving}
        />
      </div>

      <div>
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
          placeholder="Optional notes about this session"
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="system_prompt_file_name">
            System Prompt File Name
          </label>
          <input
            id="system_prompt_file_name"
            name="system_prompt_file_name"
            type="text"
            value={form.system_prompt_file_name}
            onChange={handleChange}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            disabled={saving}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white" htmlFor="knowledgebase_file_name">
            Knowledgebase File Name
          </label>
          <input
            id="knowledgebase_file_name"
            name="knowledgebase_file_name"
            type="text"
            value={form.knowledgebase_file_name}
            onChange={handleChange}
            className="block w-full rounded-lg border border-stroke px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
            disabled={saving}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create Session"}
        </button>
      </div>
    </form>
  );
}
