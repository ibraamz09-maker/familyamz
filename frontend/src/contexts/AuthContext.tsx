import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Family } from '../types';

interface MemberInfo {
  id: number;
  name: string;
  color: string;
}

interface AuthContextType {
  family: Family | null;
  isAdmin: boolean;
  member: MemberInfo | null;
  login: (token: string, family: Family) => void;
  adminLogin: (token: string) => void;
  memberLogin: (token: string, family: Family, member: MemberInfo) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [family, setFamily] = useState<Family | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [member, setMember] = useState<MemberInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const familyStr = localStorage.getItem('family');
    const adminFlag = localStorage.getItem('isAdmin');
    const memberStr = localStorage.getItem('member');
    if (token && familyStr) setFamily(JSON.parse(familyStr));
    if (token && adminFlag === 'true') setIsAdmin(true);
    if (token && memberStr) setMember(JSON.parse(memberStr));
  }, []);

  const login = (token: string, f: Family) => {
    localStorage.setItem('token', token);
    localStorage.setItem('family', JSON.stringify(f));
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('member');
    setFamily(f);
    setIsAdmin(false);
    setMember(null);
  };

  const adminLogin = (token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('isAdmin', 'true');
    localStorage.removeItem('family');
    localStorage.removeItem('member');
    setIsAdmin(true);
    setFamily(null);
    setMember(null);
  };

  const memberLogin = (token: string, f: Family, m: MemberInfo) => {
    localStorage.setItem('token', token);
    localStorage.setItem('family', JSON.stringify(f));
    localStorage.setItem('member', JSON.stringify(m));
    localStorage.removeItem('isAdmin');
    setFamily(f);
    setMember(m);
    setIsAdmin(false);
  };

  const logout = () => {
    localStorage.clear();
    setFamily(null);
    setIsAdmin(false);
    setMember(null);
  };

  return (
    <AuthContext.Provider value={{ family, isAdmin, member, login, adminLogin, memberLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
