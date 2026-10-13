import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "./api";
import { authClient } from "./auth-client";

/**
 * Where the person is in Briv:
 * - signed-out: show Welcome and sign-in
 * - setup: signed in, but About you or the location question is not done
 * - ready: the everyday app
 * - problem: signed in, but the server could not be reached
 */
export type Stage = "loading" | "signed-out" | "setup" | "ready" | "problem";

type SessionValue = {
  stage: Stage;
  me: Me | null;
  /** Fetch the person again after a change. */
  refresh: () => Promise<Me | null>;
  /** Use the answer from a call that already returned the person. */
  setMe: (me: Me) => void;
  signOut: () => Promise<void>;
  problem: string | null;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}

export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error("useMe needs a signed-in person.");
  return me;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<Me>("/me");
      setMe(next);
      setProblem(null);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The server no longer knows this session: start again from Welcome.
        setMe(null);
        await authClient.signOut().catch(() => undefined);
        return null;
      }
      setProblem(error instanceof Error ? error.message : "Something went wrong.");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setMe(null);
      return;
    }
    let live = true;
    setLoadingMe(true);
    refresh().finally(() => {
      if (live) setLoadingMe(false);
    });
    return () => {
      live = false;
    };
  }, [userId, refresh]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setMe(null);
  }, []);

  const stage: Stage = useMemo(() => {
    if (session.isPending) return "loading";
    if (!userId) return "signed-out";
    if (!me) return problem && !loadingMe ? "problem" : "loading";
    return me.profile.onboarded && me.profile.locationAsked ? "ready" : "setup";
  }, [session.isPending, userId, me, loadingMe, problem]);

  const value = useMemo(() => ({ stage, me, refresh, setMe, signOut, problem }), [stage, me, refresh, signOut, problem]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
