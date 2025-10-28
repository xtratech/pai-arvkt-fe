"use client";

import { SidebarProvider } from "@/components/Layouts/sidebar/sidebar-context";
import { UserProvider } from "@/contexts/user-context";
import { configureAmplify } from "@/lib/amplify";
import { ThemeProvider } from "next-themes";

configureAmplify();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light" attribute="class">
      <UserProvider>
        <SidebarProvider>{children}</SidebarProvider>
      </UserProvider>
    </ThemeProvider>
  );
}
