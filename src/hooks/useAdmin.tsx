import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { trpc } from '@/providers/trpc';

interface User {
  id: number;
  username: string;
  apiKey: boolean;
  has2FA: boolean;
}

interface AdminContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  user: null,
  isLoading: true,
  isAdmin: false,
  login: () => {},
  logout: () => {},
});

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

export function AdminProvider({ children }: { children: ReactNode }) {
  // Optimistic init from localStorage so the UI doesn't flash logged-out on every refresh.
  const [user, setUser] = useState<User | null>(readCachedUser);

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

  useEffect(() => {
    if (!isFetched) return;
    if (!meData) {
      localStorage.removeItem('admin_user');
      setUser(null);
      return;
    }
    const fresh: User = {
      id: meData.id,
      username: meData.username,
      apiKey: !!meData.apiKey,
      has2FA: !!meData.has2FA,
    };
    localStorage.setItem('admin_user', JSON.stringify(fresh));
    setUser(fresh);
  }, [meData, isFetched]);

  const login = useCallback((userData: User) => {
    localStorage.setItem('admin_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_user');
    setUser(null);
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        utils.auth.me.setData(undefined, null);
      },
    });
  }, [logoutMutation, utils]);

  return (
    <AdminContext.Provider value={{ user, isLoading: meLoading && !user, isAdmin: !!user, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
