import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

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
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  user: null,
  isLoading: true,
  isAdmin: false,
  login: () => {},
  logout: () => {},
});

export function AdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 页面加载时检查 session cookie
  useEffect(() => {
    setIsLoading(false);
  }, []);

  const login = useCallback((_: string, userData: User) => {
    // Session 由后端 HTTP-only cookie 管理，前端不需要存 token
    // 但为了保持刷新后的登录状态，我们存一个标志
    localStorage.setItem('admin_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_user');
    setUser(null);
    // 调用后端 logout 清除 cookie
    fetch('/api/trpc/auth.logout', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <AdminContext.Provider value={{ user, isLoading, isAdmin: !!user, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
