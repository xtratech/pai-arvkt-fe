"use client";

import GoogleSigninButton from "@/components/Auth/GoogleSigninButton";
import { SignupWithPassword } from "@/components/Auth/SignupWithPassword";
import Link from "next/link";
import { signInWithRedirect } from "aws-amplify/auth";
import { useState } from "react";

export function SignupContent() {
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setSocialError(null);
    setSocialLoading(true);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err: any) {
      const message = err?.message || "Unable to start Google sign-up.";
      setSocialError(message);
      setSocialLoading(false);
    }
  };

  return (
    <div className="w-full p-4 sm:p-12.5 xl:p-15">
      {socialError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {socialError}
        </div>
      )}

      <GoogleSigninButton text="Sign up" onClick={handleGoogle} loading={socialLoading} />

      <div className="my-6 flex items-center justify-center">
        <span className="block h-px w-full bg-stroke dark:bg-dark-3"></span>
        <div className="block w-full min-w-fit bg-white px-3 text-center font-medium dark:bg-gray-dark">
          Or sign up with email/password
        </div>
        <span className="block h-px w-full bg-stroke dark:bg-dark-3"></span>
      </div>

      <SignupWithPassword />

      <div className="mt-6 text-center">
        <p>
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="text-primary">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
