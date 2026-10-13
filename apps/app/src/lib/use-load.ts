import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api } from "./api";

/** Loads from the server each time the screen comes into view. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const next = await api<T>(path);
      if (current.current === path) {
        setData(next);
        setProblem(null);
      }
    } catch (error) {
      if (current.current === path) setProblem(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, problem, loading, reload };
}
