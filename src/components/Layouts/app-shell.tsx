"use client";

import type { PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import RequireAuth from "@/components/Auth/RequireAuth";
import { useUser } from "@/contexts/user-context";
import { useIdleResumeTrainingCheck } from "@/hooks/use-idle-resume-check";

const CHROMELESS_PATHS = ["/chat-editor"];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname() || "";
  const { isAuthenticated } = useUser();
  useIdleResumeTrainingCheck();
  const hideChrome = CHROMELESS_PATHS.some((path) => pathname.startsWith(path));
  const isHome = pathname === "/";
  const showSidebarOnHome = isHome && isAuthenticated;
  const isDashboard = pathname === "/dashboard" || showSidebarOnHome;
  const content = <RequireAuth>{children}</RequireAuth>;

  if (hideChrome) {
    return <div className="min-h-screen bg-gray-2 dark:bg-[#020d1a]">{content}</div>;
  }

  if (isHome && !showSidebarOnHome) {
    return (
      <div className="min-h-screen bg-gray-2 dark:bg-[#020d1a]">
        <Header />
        <main className="w-full">{content}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="w-full bg-gray-2 dark:bg-[#020d1a]">
        <Header />

        <main
          className={`isolate mx-auto w-full overflow-hidden p-4 md:p-6 2xl:p-10 ${
            isDashboard ? "max-w-none" : "max-w-screen-2xl"
          } ${showSidebarOnHome ? "p-0 md:p-0 2xl:p-0" : ""}`}
        >
          {content}
        </main>
      </div>
    </div>
  );
}
