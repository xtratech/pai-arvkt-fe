"use client";

import { useUser } from "@/contexts/user-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useUser();
  const [redirecting, setRedirecting] = useState(false);
  const redirectInFlightRef = useRef(false);
  const isAuthRoute = pathname?.startsWith("/auth");
  const isPublicRoute =
    pathname === "/" ||
    pathname?.startsWith("/case-study") ||
    pathname?.startsWith("/terms") ||
    pathname?.startsWith("/payment-success") ||
    pathname?.startsWith("/payment-failure");

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isAuthRoute || isPublicRoute) {
      redirectInFlightRef.current = false;
      setRedirecting(false);
      return;
    }

    if (!isAuthenticated) {
      if (!redirectInFlightRef.current) {
        redirectInFlightRef.current = true;
        setRedirecting(true);
        router.replace("/auth/sign-in");
      }
      return;
    }

    redirectInFlightRef.current = false;
    setRedirecting(false);
  }, [isAuthRoute, isAuthenticated, isLoading, isPublicRoute, router]);

  if ((isLoading || redirecting) && !isPublicRoute) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
