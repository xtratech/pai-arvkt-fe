"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signOut as amplifySignOut,
  type AuthUser,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

type UserAttributes = Record<string, string>;

interface SessionTokens {
  idToken?: string;
  accessToken?: string;
}

interface UserContextValue {
  user: AuthUser | null;
  attributes: UserAttributes | null;
  tokens: SessionTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastError: Error | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const AUTH_EVENTS_TO_WATCH = new Set([
  "signedIn",
  "signedOut",
  "tokenRefresh",
  "tokenRefresh_failure",
  "userDeleted",
]);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [attributes, setAttributes] = useState<UserAttributes | null>(null);
  const [tokens, setTokens] = useState<SessionTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    if (mountedRef.current) {
      setIsLoading(true);
      setLastError(null);
    }

    try {
      const currentUser = await getCurrentUser();
      const [session, userAttributes] = await Promise.all([
        fetchAuthSession(),
        fetchUserAttributes(),
      ]);

      if (!mountedRef.current) {
        return;
      }

      const normalizedAttributes: UserAttributes | null = userAttributes
        ? Object.entries(userAttributes).reduce<UserAttributes>((acc, [key, value]) => {
            if (typeof value === "string" && value.length > 0) {
              acc[key] = value;
            }
            return acc;
          }, {})
        : null;

      setUser(currentUser);
      setAttributes(normalizedAttributes);
      setTokens({
        idToken: session.tokens?.idToken?.toString(),
        accessToken: session.tokens?.accessToken?.toString(),
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      const authError = error as { name?: string };
      const isUnauthenticated = authError?.name === "UserUnAuthenticatedException";

      setUser(null);
      setAttributes(null);
      setTokens(null);
      setLastError(
        isUnauthenticated
          ? null
          : error instanceof Error
            ? error
            : new Error("Unable to resolve Cognito session"),
      );
    } finally {
      isRefreshingRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await amplifySignOut();
    } finally {
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload?.event && AUTH_EVENTS_TO_WATCH.has(payload.event)) {
        refresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refresh]);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      attributes,
      tokens,
      isAuthenticated: Boolean(user),
      isLoading,
      lastError,
      refresh,
      signOut: handleSignOut,
    }),
    [user, attributes, tokens, isLoading, lastError, refresh, handleSignOut],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
