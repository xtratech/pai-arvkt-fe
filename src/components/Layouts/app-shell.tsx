"use client";

import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import RequireAuth from "@/components/Auth/RequireAuth";
import { useIdleResumeTrainingCheck } from "@/hooks/use-idle-resume-check";

const CHROMELESS_PATHS = ["/chat-editor"];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || "";
  useIdleResumeTrainingCheck();
  const hideChrome = CHROMELESS_PATHS.some((path) => pathname.startsWith(path));
  const isHome = pathname === "/";
  const isDashboard = pathname === "/dashboard";
  const content = <RequireAuth>{children}</RequireAuth>;

  if (hideChrome || isHome) {
    return (
      <div
        className={`min-h-screen ${isHome ? "" : "bg-gray-2 dark:bg-[#020d1a]"
          }`}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="w-full bg-gray-2 dark:bg-[#020d1a]">
        <Header />

        <main
          className={`isolate mx-auto w-full overflow-hidden p-4 md:p-6 2xl:p-10 ${isDashboard ? "max-w-none" : "max-w-screen-2xl"
            }`}
        >
          {content}
        </main>
      </div>
    </div>
  );
}
