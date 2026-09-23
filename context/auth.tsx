import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../config/supabaseConfig";

export type AuthUser = {
  id: string;
  email: string | null;
  user_metadata: {
    displayName?: string;
    avatar_url?: string;
    // Team context persisted on the account by the Team/Profile screens via
    // `supabase.auth.updateUser`. It is passed through so every tab (Home team
    // name, Team tab active group, Statistics "active" badge) reads the same
    // values instead of silently seeing undefined.
    teamId?: string;
    teamName?: string;
    teamInviteCode?: string;
    role?: string;
  };
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ emailConfirmationRequired: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => ({ emailConfirmationRequired: false }),
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? null,
          user_metadata: {
            displayName: session.user.user_metadata?.displayName,
            avatar_url: session.user.user_metadata?.avatar_url,
            teamId: session.user.user_metadata?.teamId,
            teamName: session.user.user_metadata?.teamName,
            teamInviteCode: session.user.user_metadata?.teamInviteCode,
            role: session.user.user_metadata?.role,
          },
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    // Listen to Auth State Changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email ?? null,
            user_metadata: {
              displayName: session.user.user_metadata?.displayName,
              avatar_url: session.user.user_metadata?.avatar_url,
              teamId: session.user.user_metadata?.teamId,
              teamName: session.user.user_metadata?.teamName,
              teamInviteCode: session.user.user_metadata?.teamInviteCode,
              role: session.user.user_metadata?.role,
            },
          });
        } else {
          setUser(null);
        }
        setIsLoading(false);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ emailConfirmationRequired: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          displayName: displayName?.trim(),
        },
      },
    });

    if (error) throw error;

    return {
      emailConfirmationRequired: !data.session,
    };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signIn, signUp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
