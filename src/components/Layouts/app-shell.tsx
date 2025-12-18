"use client";

import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import RequireAuth from "@/components/Auth/RequireAuth";

const CHROMELESS_PATHS = ["/chat-editor"];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || "";
  const hideChrome = CHROMELESS_PATHS.some((path) => pathname.startsWith(path));
  const content = <RequireAuth>{children}</RequireAuth>;

  if (hideChrome) {
    return <div className="min-h-screen bg-gray-2 dark:bg-[#020d1a]">{content}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="w-full bg-gray-2 dark:bg-[#020d1a]">
        <Header />

        <main className="isolate mx-auto w-full max-w-screen-2xl overflow-hidden p-4 md:p-6 2xl:p-10">
          {content}
        </main>
      </div>
    </div>
  );
}
