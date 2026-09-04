'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type RequestOptions } from '@/lib/api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal fetch-on-mount hook (no external data library is installed).
 * `deps` re-triggers the fetch, `skip` lets a page defer loading until it has
 * enough state (e.g. a selected month) to make the request meaningful.
 */
export function useApi<T>(
  path: string | null,
  options?: RequestOptions,
  deps: unknown[] = [],
): UseApiState<T> & { refetch: () => void } {
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: Boolean(path), error: null });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get<T>(path, optionsRef.current)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof ApiError ? err.message : 'Something went wrong',
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refetch };
}

export function useMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
): {
  mutate: (input: TInput) => Promise<TOutput | null>;
  loading: boolean;
  error: string | null;
  reset: () => void;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (input: TInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn(input);
        setLoading(false);
        return result;
      } catch (err) {
        setLoading(false);
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
        return null;
      }
    },
    [fn],
  );

  const reset = useCallback(() => setError(null), []);
  return { mutate, loading, error, reset };
}
