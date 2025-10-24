"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser } from "aws-amplify/auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        await getCurrentUser();
        if (active) setChecking(false);
      } catch {
        // Allow auth routes without redirect loop
        const isAuthRoute = pathname?.startsWith("/auth");
        if (!isAuthRoute) {
          router.replace("/auth/sign-in");
        }
        if (active) setChecking(false);
      }
    }
    check();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

