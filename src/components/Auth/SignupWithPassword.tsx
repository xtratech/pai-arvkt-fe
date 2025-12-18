"use client";

import { EmailIcon, PasswordIcon } from "@/assets/icons";
import InputGroup from "@/components/FormElements/InputGroup";
import { confirmSignUp, signUp } from "aws-amplify/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignupWithPassword() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<{
    required: boolean;
    username?: string;
    destination?: string;
    medium?: string;
  }>({ required: false });
  const [code, setCode] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.email.trim() || !form.password.trim() || !form.confirmPassword.trim()) {
      setError("Email, password, and confirmation are required.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    setLoading(true);
    try {
      const result = await signUp({
        username: form.email.trim(),
        password: form.password,
        options: {
          userAttributes: {
            email: form.email.trim(),
          },
          // Adjust validation data/auto-verified attrs via env if needed
        },
      });

      const step = result.nextStep?.signUpStep;
      if (step === "DONE") {
        router.replace("/auth/sign-in");
        return;
      }

      if (step === "CONFIRM_SIGN_UP") {
        setConfirmStep({
          required: true,
          username: form.email.trim(),
          destination: (result.nextStep as any)?.codeDeliveryDetails?.destination,
          medium: (result.nextStep as any)?.codeDeliveryDetails?.deliveryMedium,
        });
        setSuccess(
          "We've sent you a verification code. Enter it below to confirm your account, then sign in.",
        );
        return;
      }

      setSuccess("Check your email for a verification link or code to complete sign-up, then sign in.");
    } catch (err: any) {
      const message = err?.message || "Unable to sign up. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmStep.username || !code.trim()) {
      setError("Enter the verification code to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await confirmSignUp({
        username: confirmStep.username,
        confirmationCode: code.trim(),
      });
      router.replace("/auth/sign-in");
    } catch (err: any) {
      const message = err?.message || "Unable to confirm sign-up. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (confirmStep.required) {
    return (
      <form onSubmit={handleConfirm}>
        <InputGroup
          type="text"
          label="Verification code"
          className="mb-5 [&_input]:py-[15px]"
          placeholder="Enter the code"
          name="code"
          handleChange={(e) => setCode(e.target.value)}
          value={code}
          icon={<PasswordIcon />}
        />

        {confirmStep.destination && (
          <p className="mb-3 text-sm text-dark-5 dark:text-dark-6">
            Sent to {confirmStep.medium ? `${confirmStep.medium}: ` : ""}
            <span className="font-semibold text-dark dark:text-white">{confirmStep.destination}</span>
          </p>
        )}

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
          <button
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Confirm account
            {loading && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
            )}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup
        type="email"
        label="Email"
        className="mb-4 [&_input]:py-[15px]"
        placeholder="Enter your email"
        name="email"
        handleChange={handleChange}
        value={form.email}
        icon={<EmailIcon />}
      />

      <InputGroup
        type="password"
        label="Password"
        className="mb-5 [&_input]:py-[15px]"
        placeholder="Create a password"
        name="password"
        handleChange={handleChange}
        value={form.password}
        icon={<PasswordIcon />}
      />

      <InputGroup
        type="password"
        label="Confirm Password"
        className="mb-5 [&_input]:py-[15px]"
        placeholder="Re-enter your password"
        name="confirmPassword"
        handleChange={handleChange}
        value={form.confirmPassword}
        icon={<PasswordIcon />}
      />

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
        <button
          type="submit"
          disabled={loading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Create account
          {loading && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
          )}
        </button>
      </div>
    </form>
  );
}
