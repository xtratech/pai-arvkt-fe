"use client";

import { useEffect, useState } from "react";
import { SessionCard } from "./session-card";
import { fetchSessions, type SessionRecord } from "@/services/sessions";

export function SessionList() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchSessions();
        if (!active) return;
        setSessions(data);
      } catch (err) {
        if (!active) return;
        console.error("[SessionList] Unable to load sessions", err);
        setError("Unable to load sessions at the moment.");
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
  }, []);

  if (loading) {
    return (
      <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex min-h-[160px] items-center justify-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
        </div>
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
        <p className="text-sm text-dark-5 dark:text-dark-6">
          No sessions found. Create your first session to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-6 gap-8">
      {sessions.map((session, idx) => (
        <div key={session.id ?? idx} className="col-span-6 md:col-span-3 xl:col-span-2">
          <SessionCard session={session as any} />
        </div>
      ))}
    </div>
  );
}
