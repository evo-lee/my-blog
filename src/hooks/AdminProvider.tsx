import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { trpc } from '@/providers/trpc-client';
import { AdminContext, type User } from '@/hooks/admin-context';

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem('admin_user');
    return null;
  }
}

function toUser(meData: {
  id: number;
  username: string;
  apiKey?: boolean | null;
  has2FA?: boolean | null;
}): User {
  return {
    id: meData.id,
    username: meData.username,
    apiKey: !!meData.apiKey,
    has2FA: !!meData.has2FA,
  };
}

export function AdminProvider({ children }: { children: ReactNode }) {
  // Optimistic init from localStorage so the UI doesn't flash logged-out on every refresh.
  const [cachedUser, setCachedUser] = useState<User | null>(readCachedUser);

  // Authoritative check: ask the server "am I logged in?" — the cookie is HttpOnly,
  // so only the server knows. This reconciles localStorage with reality after login,
  // logout, expiry, or remote revocation.
  const utils = trpc.useUtils();
  const { data: meData, isLoading: meLoading, isFetched } = trpc.auth.me.useQuery(undefined, {
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60_000,
  });
  const logoutMutation = trpc.auth.logout.useMutation();

  const serverUser = meData ? toUser(meData) : null;
  const user = isFetched ? serverUser : cachedUser;

  useEffect(() => {
    if (!isFetched) return;
    if (!serverUser) {
      localStorage.removeItem('admin_user');
      return;
    }
    localStorage.setItem('admin_user', JSON.stringify(serverUser));
  }, [isFetched, serverUser]);

  const login = useCallback((userData: User) => {
    localStorage.setItem('admin_user', JSON.stringify(userData));
    setCachedUser(userData);
    utils.auth.me.setData(undefined, userData);
  }, [utils]);

  const logout = useCallback(async () => {
    // Hit the server FIRST so we know whether the session row was actually
    // deleted before we wipe local state. If the request fails (offline,
    // server down), surface it and keep the user logged in — clearing
    // local state silently while the cookie remains valid is the bug
    // codex flagged.
    try {
      await logoutMutation.mutateAsync();
    } catch (err) {
      console.warn('Logout failed; session may still be active server-side', err);
      throw err;
    }
    localStorage.removeItem('admin_user');
    setCachedUser(null);
    utils.auth.me.setData(undefined, null);
  }, [logoutMutation, utils]);

  return (
    <AdminContext.Provider value={{ user, isLoading: meLoading && !user, isAdmin: !!user, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}
