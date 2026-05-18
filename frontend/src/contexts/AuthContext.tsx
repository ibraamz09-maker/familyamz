import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Family } from '../types';

interface AuthContextType {
  family: Family | null;
  isAdmin: boolean;
  login: (token: string, family: Family) => void;
  adminLogin: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState<Family | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const familyStr = localStorage.getItem('family');
    const adminFlag = localStorage.getItem('isAdmin');
    if (token && familyStr) setFamily(JSON.parse(familyStr));
    if (token && adminFlag === 'true') setIsAdmin(true);
  }, []);

  const login = (token: string, f: Family) => {
    localStorage.setItem('token', token);
    localStorage.setItem('family', JSON.stringify(f));
    localStorage.removeItem('isAdmin');
    setFamily(f);
    setIsAdmin(false);
  };

  const adminLogin = (token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('isAdmin', 'true');
    localStorage.removeItem('family');
    setIsAdmin(true);
    setFamily(null);
  };

  const logout = () => {
    localStorage.clear();
    setFamily(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ family, isAdmin, login, adminLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
