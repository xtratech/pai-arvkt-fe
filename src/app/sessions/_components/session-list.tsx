"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SessionCard } from "./session-card";
import { fetchSessions, type SessionRecord } from "@/services/sessions";
import { useUser } from "@/contexts/user-context";

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

export function SessionList() {
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

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!userId) {
          return;
        }

        const data = await fetchSessions(userId);
        if (!active) return;
        setSessions(data);
      } catch (err) {
        if (!active) return;
        console.error("[SessionList] Unable to load bots", err);
        setError("Unable to load bots at the moment.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (userId) {
      load();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[160px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-red-600 dark:text-red-400">
          Unable to determine your user identity. Please sign out and sign in again.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-dark-5 dark:text-dark-6">
            No bots found. Create your first bot to get started.
          </p>
          <Link
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
            href="/session?id=new"
          >
            Add New Bot
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-end">
        <Link
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90"
          href="/session?id=new"
        >
          Add New Session
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-6 gap-8">
        {sessions.map((session, idx) => (
          <div key={session.id ?? idx} className="col-span-6 md:col-span-3 xl:col-span-2">
            <SessionCard session={session as any} />
          </div>
        ))}
      </div>
    </>
  );
}

