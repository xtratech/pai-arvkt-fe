"use client";
import { EmailIcon, PasswordIcon } from "@/assets/icons";
import Link from "next/link";
import React, { useMemo, useState } from "react";
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
  const [confirmStep, setConfirmStep] = useState<{
    step: string;
    destination?: string;
    medium?: string;
    totpSecret?: string;
    totpUri?: string;
  } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  const resetChallengeState = () => {
    setNewPasswordStep({ required: false, missingAttributes: [] });
    setConfirmStep(null);
    setConfirmCode("");
    setNewPassword("");
    setAttrs({});
  };

  const challengeLabel = useMemo(() => {
    if (!confirmStep) return "";
    switch (confirmStep.step) {
      case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
        return "SMS verification code";
      case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
        return "Authenticator code";
      case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
        return "Email verification code";
      case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
        return "Verification response";
      case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP":
        return "Authenticator setup code";
      default:
        return "Verification code";
    }
  }, [confirmStep]);

  const applyNextStep = (nextStep?: { signInStep?: string } | null) => {
    const step = nextStep?.signInStep;
    if (!step || step === "DONE") {
      router.replace("/dashboard");
      return;
    }

    if (step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
      resetChallengeState();
      setNewPasswordStep({
        required: true,
        missingAttributes: (nextStep as any)?.missingAttributes || [],
      });
      return;
    }

    if (
      step === "CONFIRM_SIGN_IN_WITH_SMS_CODE" ||
      step === "CONFIRM_SIGN_IN_WITH_TOTP_CODE" ||
      step === "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" ||
      step === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" ||
      step === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP"
    ) {
      const delivery = (nextStep as any)?.codeDeliveryDetails || {};
      const totpDetails = (nextStep as any)?.totpSetupDetails;
      const totpSecret =
        totpDetails && typeof totpDetails.sharedSecret === "string" ? totpDetails.sharedSecret : undefined;
      let totpUri: string | undefined;
      if (totpDetails?.getSetupUri && typeof totpDetails.getSetupUri === "function") {
        try {
          totpUri = String(totpDetails.getSetupUri("Pluree"));
        } catch {
          totpUri = undefined;
        }
      } else if (typeof totpDetails?.getSetupUri === "string") {
        totpUri = totpDetails.getSetupUri;
      } else if (typeof totpDetails?.setupUri === "string") {
        totpUri = totpDetails.setupUri;
      }

      setNewPasswordStep({ required: false, missingAttributes: [] });
      setConfirmStep({
        step,
        destination: delivery.destination,
        medium: delivery.deliveryMedium,
        totpSecret,
        totpUri,
      });
      return;
    }

    setError(`Additional sign-in step required: ${step}. Please contact support.`);
  };

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
      resetChallengeState();
      const out = await signIn({ username: data.email, password: data.password });
      applyNextStep(out.nextStep);
    } catch (err: any) {
      const message =
        err?.name === "PasswordResetRequiredException"
          ? "Password reset required. Please use the forgot password flow."
          : err?.name === "NotAuthorizedException"
            ? "Incorrect email or password."
            : err?.name === "UserNotConfirmedException"
              ? "Account not confirmed. Please verify your email."
              : err?.message || "Unable to sign in. Please try again.";
      if (err?.name === "PasswordResetRequiredException") {
        router.replace(`/auth/forgot-password?email=${encodeURIComponent(data.email)}`);
        return;
      }
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
      const result = await confirmSignIn({
        challengeResponse: newPassword,
        options: newPasswordStep.missingAttributes?.length
          ? { userAttributes: attrs }
          : undefined,
      } as any);
      applyNextStep(result?.nextStep);
    } catch (err: any) {
      const message = err?.message || "Failed to set new password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmChallenge(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmCode.trim()) {
      setError("Enter the verification code to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await confirmSignIn({
        challengeResponse: confirmCode.trim(),
      } as any);
      setConfirmCode("");
      applyNextStep(result?.nextStep);
    } catch (err: any) {
      const message = err?.message || "Unable to verify the code.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={
        newPasswordStep.required
          ? handleCompleteNewPassword
          : confirmStep
            ? handleConfirmChallenge
            : handleSubmit
      }
    >
      {!newPasswordStep.required && !confirmStep && (
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

      {confirmStep && (
        <>
          <InputGroup
            type="text"
            label={challengeLabel}
            className="mb-5 [&_input]:py-[15px]"
            placeholder="Enter the verification code"
            name="confirmCode"
            handleChange={(e: any) => setConfirmCode(e.target.value)}
            value={confirmCode}
            icon={<PasswordIcon />}
          />

          {confirmStep.step === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP" ? (
            <div className="mb-4 rounded-md border border-stroke bg-gray-1 px-3 py-2 text-xs text-dark-5 dark:border-dark-3 dark:bg-dark-2 dark:text-dark-6">
              <div className="font-semibold text-dark dark:text-white">Set up your authenticator app</div>
              {confirmStep.totpSecret ? (
                <div className="mt-2">
                  Secret:{" "}
                  <span className="break-all font-mono text-dark dark:text-white">
                    {confirmStep.totpSecret}
                  </span>
                </div>
              ) : null}
              {confirmStep.totpUri ? (
                <div className="mt-2">
                  Setup URI:{" "}
                  <span className="break-all font-mono text-dark dark:text-white">
                    {confirmStep.totpUri}
                  </span>
                </div>
              ) : null}
              <div className="mt-2">
                Add the secret to your authenticator app, then enter the code above to continue.
              </div>
            </div>
          ) : null}

          {confirmStep.destination ? (
            <p className="mb-3 text-sm text-dark-5 dark:text-dark-6">
              Sent to {confirmStep.medium ? `${confirmStep.medium}: ` : ""}
              <span className="font-semibold text-dark dark:text-white">{confirmStep.destination}</span>
            </p>
          ) : null}
        </>
      )}

      {!newPasswordStep.required && !confirmStep ? (
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
          <Link
            href="/auth/forgot-password"
            className="hover:text-primary dark:text-white dark:hover:text-primary"
          >
            Forgot Password?
          </Link>
        </div>
      ) : null}

      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {(newPasswordStep.required || confirmStep) && (
        <div className="mb-3 text-right text-xs">
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => {
              resetChallengeState();
              setError(null);
            }}
            disabled={loading}
          >
            Back to sign in
          </button>
        </div>
      )}

      <div className="mb-4.5">
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary p-4 font-medium text-white transition hover:bg-opacity-90"
        >
          {newPasswordStep.required ? "Update Password" : confirmStep ? "Verify" : "Sign In"}
          {loading && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent dark:border-primary dark:border-t-transparent" />
          )}
        </button>
      </div>
    </form>
  );
}
