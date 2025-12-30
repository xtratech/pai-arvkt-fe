"use client";
import { EmailIcon, PasswordIcon } from "@/assets/icons";
import Link from "next/link";
import React, { useState } from "react";
import InputGroup from "../FormElements/InputGroup";
import { Checkbox } from "../FormElements/checkbox";
import { signIn, confirmSignIn } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function SigninWithPassword() {
  const router = useRouter();
  const [data, setData] = useState({
    email: process.env.NEXT_PUBLIC_DEMO_USER_MAIL || "",
    password: process.env.NEXT_PUBLIC_DEMO_USER_PASS || "",
    remember: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPasswordStep, setNewPasswordStep] = useState<{
    required: boolean;
    missingAttributes: string[];
  }>({ required: false, missingAttributes: [] });
  const [newPassword, setNewPassword] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData({
      ...data,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const out = await signIn({ username: data.email, password: data.password });
      const step = out.nextStep?.signInStep;
      if (step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setNewPasswordStep({
          required: true,
          missingAttributes: (out.nextStep as any)?.missingAttributes || [],
        });
        setError(null);
        return;
      }
      router.replace("/dashboard");
    } catch (err: any) {
      const message =
        err?.name === "UserNotConfirmedException"
          ? "Account not confirmed. Please verify your email."
          : err?.message || "Unable to sign in. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  async function handleCompleteNewPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignIn({
        challengeResponse: newPassword,
        options: newPasswordStep.missingAttributes?.length
          ? { userAttributes: attrs }
          : undefined,
      } as any);
      router.replace("/dashboard");
    } catch (err: any) {
      const message = err?.message || "Failed to set new password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={newPasswordStep.required ? handleCompleteNewPassword : handleSubmit}>
      {!newPasswordStep.required && (
        <>
      <InputGroup
        type="email"
        label="Email"
        className="mb-4 [&_input]:py-[15px]"
        placeholder="Enter your email"
        name="email"
        handleChange={handleChange}
        value={data.email}
        icon={<EmailIcon />}
      />

      <InputGroup
        type="password"
        label="Password"
        className="mb-5 [&_input]:py-[15px]"
        placeholder="Enter your password"
        name="password"
        handleChange={handleChange}
        value={data.password}
        icon={<PasswordIcon />}
      />
        </>
      )}

      {newPasswordStep.required && (
        <>
          <InputGroup
            type="password"
            label="Set New Password"
            className="mb-5 [&_input]:py-[15px]"
            placeholder="Enter a new password"
            name="newPassword"
            handleChange={(e: any) => setNewPassword(e.target.value)}
            value={newPassword}
            icon={<PasswordIcon />}
          />
          {newPasswordStep.missingAttributes?.map((key) => (
            <InputGroup
              key={key}
              type="text"
              label={key}
              className="mb-5 [&_input]:py-[15px]"
              placeholder={`Enter ${key}`}
              name={key}
              handleChange={(e: any) =>
                setAttrs((prev) => ({ ...prev, [key]: e.target.value }))
              }
              value={attrs[key] || ""}
            />
          ))}
        </>
      )}

      <div className="mb-6 flex items-center justify-between gap-2 py-2 font-medium">
        <Checkbox
          label="Remember me"
          name="remember"
          withIcon="check"
          minimal
          radius="md"
          onChange={(e) =>
            setData({
              ...data,
              remember: e.target.checked,
            })
          }
        />

        {!newPasswordStep.required && (
        <Link
          href="/auth/forgot-password"
          className="hover:text-primary dark:text-white dark:hover:text-primary"
        >
          Forgot Password?
        </Link>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4.5">
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90"
        >
          {newPasswordStep.required ? "Update Password" : "Sign In"}
          {loading && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
          )}
        </button>
      </div>
    </form>
  );
}
