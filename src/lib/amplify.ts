"use client";

import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";

let configured = false;

const DEFAULT_API_NAME = "UserDataAPI";

function sanitizeEnv(value?: string | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeEndpoint(value?: string) {
  if (!value) return undefined;
  return value.replace(/\/+$/, "");
}

export function configureAmplify() {
  if (configured) {
    return;
  }

  const region =
    sanitizeEnv(process.env.NEXT_PUBLIC_AWS_REGION) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_AWS_COGNITO_REGION) ??
    sanitizeEnv(process.env.AWS_REGION);
  const userPoolId =
    sanitizeEnv(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_AWS_USER_POOLS_ID) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_AWS_COGNITO_USER_POOL_ID);
  const userPoolClientId =
    sanitizeEnv(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_WEB_CLIENT_ID) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_AWS_USER_POOLS_WEB_CLIENT_ID);
  const apiName =
    sanitizeEnv(process.env.NEXT_PUBLIC_USERDATA_API_NAME) ?? DEFAULT_API_NAME;
  const apiEndpoint = normalizeEndpoint(
    sanitizeEnv(process.env.NEXT_PUBLIC_USERDATA_API_ENDPOINT),
  );
  const apiKey = sanitizeEnv(process.env.NEXT_PUBLIC_USERDATA_API_KEY);

  if ((!userPoolId || !userPoolClientId) && process.env.NODE_ENV !== "production") {
    console.warn(
      "[amplify] Missing Cognito env vars (NEXT_PUBLIC_COGNITO_USER_POOL_ID / NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID). Auth flows will fail until they are provided.",
    );
  }

  if (!apiEndpoint && process.env.NODE_ENV !== "production") {
    console.warn(
      "[amplify] NEXT_PUBLIC_USERDATA_API_ENDPOINT is not defined. REST API calls through Amplify will be disabled.",
    );
  }

  const resourcesConfig = {
    ...(userPoolId &&
      userPoolClientId && {
        Auth: {
          Cognito: {
            userPoolId,
            userPoolClientId,
            ...(region && { region }),
            loginWith: {
              email: true,
              username: false,
              phone: false,
            },
          },
        },
      }),
    ...(apiEndpoint && {
      API: {
        REST: {
          [apiName]: {
            endpoint: apiEndpoint,
            region,
          },
        },
      },
    }),
  };

  const libraryOptions =
    apiEndpoint || apiKey
      ? {
          API: {
            REST: {
              headers: async ({ apiName: currentApiName }: { apiName: string }) => {
                const headers: Record<string, string> = {};

                if (apiKey) {
                  headers["x-api-key"] = apiKey;
                }

                if (!apiEndpoint || currentApiName !== apiName) {
                  return headers;
                }

                try {
                  const session = await fetchAuthSession();
                  const token =
                    session.tokens?.idToken?.toString() ??
                    session.tokens?.accessToken?.toString();

                  if (token) {
                    headers.Authorization = token;
                  }
                } catch (error) {
                  if (process.env.NODE_ENV !== "production") {
                    console.debug(
                      "[amplify] Unable to resolve auth session for REST headers.",
                      error,
                    );
                  }
                }

                return headers;
              },
            },
          },
        }
      : undefined;

  if (!("Auth" in resourcesConfig) && process.env.NODE_ENV !== "production") {
    console.warn(
      "[amplify] Auth resources were not added to Amplify configuration.",
      {
        userPoolId,
        userPoolClientId,
        region,
        resourcesConfig,
      },
    );
  } else if (process.env.NODE_ENV !== "production") {
    console.info("[amplify] Auth configured with Cognito user pool.", {
      userPoolId,
      userPoolClientId,
      region,
    });
  }

  Amplify.configure(resourcesConfig, libraryOptions);
  configured = true;
}
