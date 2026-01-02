/* eslint-disable react/no-unescaped-entities */
"use client";

import Link from "next/link";
import GoogleSigninButton from "../GoogleSigninButton";
import SigninWithPassword from "../SigninWithPassword";
import { signInWithRedirect } from "aws-amplify/auth";
import { useState } from "react";

export default function Signin() {
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setSocialError(null);
    setSocialLoading(true);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err: any) {
      const message = err?.message || "Unable to start Google sign-in.";
      setSocialError(message);
      setSocialLoading(false);
    }
  };

  return (
    <>
      {socialError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {socialError}
        </div>
      )}

      <GoogleSigninButton text="Sign in" onClick={handleGoogle} loading={socialLoading} />

      <div className="my-6 flex items-center justify-center">
        <span className="block h-px w-full bg-stroke dark:bg-dark-3"></span>
        <div className="block w-full min-w-fit bg-white px-3 text-center font-medium dark:bg-gray-dark">
          Or sign in with email
        </div>
        <span className="block h-px w-full bg-stroke dark:bg-dark-3"></span>
      </div>

      <div>
        <SigninWithPassword />
      </div>

      <div className="mt-6 text-center">
        <p>
          Don't have an account?{" "}
          <Link href="/auth/sign-up" className="text-primary">
            Sign Up
          </Link>
        </p>
      </div>

      <div className="mt-3 text-center text-xs text-dark-5 dark:text-dark-6">
        By using the system, logging in, or signing up, you agree to the{" "}
        <Link href="/terms" className="text-primary underline-offset-2 hover:underline">
          Terms and Conditions
        </Link>
        .
      </div>
    </>
  );
}
