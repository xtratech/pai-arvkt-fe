"use client";

import { EmailIcon, PasswordIcon } from "@/assets/icons";
import InputGroup from "@/components/FormElements/InputGroup";
import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ResetStep = "request" | "confirm" | "done";

export default function ForgotPassword() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<ResetStep>("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{ destination?: string; medium?: string } | null>(null);

  useEffect(() => {
    const prefillEmail = searchParams?.get("email");
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
  }, [searchParams]);

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email to continue.");
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword({ username: trimmedEmail });
      const nextStep = result?.nextStep;
      const stepName = nextStep?.resetPasswordStep;
      const details = (nextStep as any)?.codeDeliveryDetails || {};
      setDelivery({
        destination: details.destination,
        medium: details.deliveryMedium,
      });

      if (stepName === "CONFIRM_RESET_PASSWORD_WITH_CODE") {
        setStep("confirm");
        setSuccess("We sent a verification code. Enter it below with your new password.");
      } else {
        setStep("done");
        setSuccess("If your account exists, a reset message has been sent.");
      }
    } catch (err: any) {
      const message = err?.message || "Unable to start the reset flow.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !code.trim() || !newPassword.trim()) {
      setError("Email, code, and new password are required.");
      return;
    }

    setLoading(true);
    try {
      await confirmResetPassword({
        username: trimmedEmail,
        confirmationCode: code.trim(),
        newPassword: newPassword.trim(),
      });
      setStep("done");
      setSuccess("Password updated. You can sign in now.");
    } catch (err: any) {
      const message = err?.message || "Unable to reset password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={step === "confirm" ? handleConfirm : handleRequest}>
      <InputGroup
        type="email"
        label="Email"
        className="mb-4 [&_input]:py-[15px]"
        placeholder="Enter your email"
        name="email"
        handleChange={(e: any) => setEmail(e.target.value)}
        value={email}
        icon={<EmailIcon />}
      />

      {step === "confirm" && (
        <>
          <InputGroup
            type="text"
            label="Verification code"
            className="mb-4 [&_input]:py-[15px]"
            placeholder="Enter the code"
            name="code"
            handleChange={(e: any) => setCode(e.target.value)}
            value={code}
            icon={<PasswordIcon />}
          />

          <InputGroup
            type="password"
            label="New Password"
            className="mb-4 [&_input]:py-[15px]"
            placeholder="Enter a new password"
            name="newPassword"
            handleChange={(e: any) => setNewPassword(e.target.value)}
            value={newPassword}
            icon={<PasswordIcon />}
          />
        </>
      )}

      {delivery?.destination ? (
        <p className="mb-3 text-sm text-dark-5 dark:text-dark-6">
          Sent to {delivery.medium ? `${delivery.medium}: ` : ""}
          <span className="font-semibold text-dark dark:text-white">{delivery.destination}</span>
        </p>
      ) : null}

      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-md border border-green-300 bg-green-light-7 p-3 text-sm text-green-dark dark:border-green-dark dark:bg-green-light-6 dark:text-green-dark">
          {success}
        </div>
      )}

      <div className="mb-4.5">
        {step === "done" ? (
          <Link
            href="/auth/sign-in"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90"
          >
            Back to Sign In
          </Link>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {step === "confirm" ? "Reset Password" : "Send Reset Code"}
            {loading && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
            )}
          </button>
        )}
      </div>

      {step !== "done" && (
        <div className="text-center text-sm">
          <Link href="/auth/sign-in" className="text-primary underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </div>
      )}
    </form>
  );
}
