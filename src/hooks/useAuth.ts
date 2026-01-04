'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: AuthError | null;
}

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  // Get initial session
  useEffect(() => {
    const getSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          setState((prev) => ({ ...prev, error, loading: false }));
          return;
        }

        setState({
          user: session?.user ?? null,
          session,
          loading: false,
          error: null,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as AuthError,
        }));
      }
    };

    getSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        error: null,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  // Sign in with email and password
  const signIn = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error }));
        return { success: false, error };
      }

      setState({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Sign up with email and password
  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setState((prev) => ({ ...prev, loading: false, error }));
        return { success: false, error };
      }

      setState({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Sign in with OAuth provider
  const signInWithOAuth = useCallback(
    async (provider: 'google' | 'apple') => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Sign in with magic link
  const signInWithMagicLink = useCallback(
    async (email: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setState((prev) => ({ ...prev, loading: false }));

      if (error) {
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Reset password
  const resetPassword = useCallback(
    async (email: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      setState((prev) => ({ ...prev, loading: false }));

      if (error) {
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Update password
  const updatePassword = useCallback(
    async (newPassword: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      setState((prev) => ({ ...prev, loading: false }));

      if (error) {
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      return { success: true, error: null };
    },
    [supabase.auth]
  );

  // Sign out
  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const { error } = await supabase.auth.signOut();

    if (error) {
      setState((prev) => ({ ...prev, loading: false, error }));
      return { success: false, error };
    }

    setState({
      user: null,
      session: null,
      loading: false,
      error: null,
    });

    router.push('/');
    return { success: true, error: null };
  }, [supabase.auth, router]);

  return {
    user: state.user,
    session: state.session,
    loading: state.loading,
    error: state.error,
    signIn,
    signUp,
    signInWithOAuth,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
    signOut,
  };
}

