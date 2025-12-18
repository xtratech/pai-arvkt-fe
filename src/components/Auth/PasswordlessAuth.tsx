"use client";

import { CallIcon, EmailIcon } from "@/assets/icons";
import InputGroup from "@/components/FormElements/InputGroup";
import { confirmSignIn, fetchAuthSession, signIn } from "aws-amplify/auth";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

type Step = "INPUT" | "VERIFY";

type PasswordlessAuthProps = {
  heading?: string;
};

/**
 * Placeholder registration hook for new users.
 * Replace with real registration (e.g., API call to create Cognito user) when wiring up.
 */
async function registerNewUser(username: string) {
  console.info("[PasswordlessAuth] Registering new user (mock)", username);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

export default function PasswordlessAuth({ heading = "Passwordless Sign-in" }: PasswordlessAuthProps) {
  const [step, setStep] = useState<Step>("INPUT");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVerifyStep = step === "VERIFY";

  const helperText = useMemo(() => {
    if (isVerifyStep && username) {
      return `Enter the 6-digit code sent to ${username}.`;
    }
    return "Use your email or phone number to receive a one-time code.";
  }, [isVerifyStep, username]);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Please enter your email or phone number.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await attemptSignIn(trimmed);
      const challengeName = (result as any)?.challengeName;
      const nextStep = (result as any)?.nextStep?.signInStep;
      const isCustomChallenge =
        challengeName === "CUSTOM_CHALLENGE" || nextStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE";

      if (!isCustomChallenge) {
        setError("Unable to start passwordless sign-in. Please try again.");
        return;
      }

      setCurrentUser(result);
      setStep("VERIFY");
    } catch (err: any) {
      const message = err?.message || "Unable to start sign-in. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError("Enter the 6-digit code to continue.");
      return;
    }
    if (!currentUser) {
      setError("Session expired. Please request a new code.");
      setStep("INPUT");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await confirmSignIn({ challengeResponse: otp.trim() });

      const session = await fetchAuthSession();
      console.log("[PasswordlessAuth] Authenticated session", session);
    } catch (err: any) {
      const message = err?.message || "Invalid code. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  async function attemptSignIn(identifier: string) {
    try {
      return await signIn({ username: identifier, options: { authFlowType: "CUSTOM_WITHOUT_SRP" } });
    } catch (err: any) {
      if (err?.name === "UserNotFoundException") {
        await registerNewUser(identifier);
        return await signIn({ username: identifier, options: { authFlowType: "CUSTOM_WITHOUT_SRP" } });
      }
      throw err;
    }
  }

  return (
    <div className="rounded-[10px] border border-stroke bg-white p-6 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-8">
      <div className="mb-6 space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-dark dark:text-white">
          {heading}
        </p>
        <p className="text-sm text-dark-5 dark:text-dark-6">{helperText}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={isVerifyStep ? handleVerify : handleRequestCode} className="space-y-5">
        {step === "INPUT" ? (
          <InputGroup
            type="text"
            label="Email or phone"
            placeholder="you@example.com or +1 555 000 0000"
            className="[&_input]:py-[15px]"
            value={username}
            handleChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            icon={username.match(/^\+?\d/)
              ? <CallIcon className="text-dark-6 dark:text-dark-6" />
              : <EmailIcon className="text-dark-6 dark:text-dark-6" />}
          />
        ) : (
          <>
            <InputGroup
              type="text"
              label="Verification code"
              placeholder="Enter the 6-digit code"
              className="[&_input]:py-[15px]"
              value={otp}
              handleChange={(e: ChangeEvent<HTMLInputElement>) => setOtp(e.target.value.replace(/\s+/g, ""))}
              icon={<EmailIcon className="text-dark-6 dark:text-dark-6" />}
              required
            />
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Didn&apos;t get a code? Re-request by going back and submitting your email/phone again.
            </p>
          </>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isVerifyStep ? "Verify Code" : "Send Code"}
            {loading && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
            )}
          </button>

          {isVerifyStep && (
            <button
              type="button"
              onClick={() => {
                setStep("INPUT");
                setOtp("");
                setCurrentUser(null);
                setError(null);
              }}
              className="w-full text-center text-sm font-semibold text-dark hover:text-primary dark:text-white dark:hover:text-primary"
            >
              Use a different email or phone
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
