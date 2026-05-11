import { createContext, useContext } from "react";

export interface User {
  id: number;
  username: string;
  apiKey: boolean;
  has2FA: boolean;
}

export interface AdminContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const AdminContext = createContext<AdminContextType>({
  user: null,
  isLoading: true,
  isAdmin: false,
  login: () => {},
  logout: () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}
