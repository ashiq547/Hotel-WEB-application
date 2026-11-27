import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import api, { clearSession as clearStoredSession } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  /** True while the session is being restored on page load. */
  loading: boolean;
  /** True once restoration finished and the user is NOT logged in. */
  restored: boolean;
  login: (username: string, password?: string) => Promise<void>;
  guestLogin: (emailOrUsername: string, password: string) => Promise<void>;
  setSession: (token: string, user: User) => void;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [restored, setRestored] = useState<boolean>(false);

  const resetState = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
  }, []);

  // Restore the session on mount by calling /auth/refresh (httpOnly cookie).
  // While this runs, `loading` is true so protected pages don't flash guest content.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      // Optimistically show a remembered user name while restoring, but keep
      // `loading` true so route guards hold back protected content.
      const savedUser = localStorage.getItem('hms_user');
      if (savedUser) {
        try { setUser(JSON.parse(savedUser)); } catch { /* ignore */ }
      }

      try {
        const res = await api.post('/auth/refresh', {}, { _skipAuthRefresh: true } as any);
        if (cancelled) return;
        const { token: newToken, user: sessionUser } = res.data;
        if (newToken) {
          localStorage.setItem('hms_token', newToken);
          localStorage.setItem('hms_user', JSON.stringify(sessionUser));
          setToken(newToken);
          setUser(sessionUser);
        } else {
          resetState();
        }
      } catch {
        if (!cancelled) resetState();
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRestored(true);
        }
      }
    };

    restore();
    return () => { cancelled = true; };
  }, [resetState]);

  // The API layer broadcasts when a 401 finally kills the session.
  useEffect(() => {
    const onExpired = () => resetState();
    window.addEventListener('hms:session-expired', onExpired);
    return () => window.removeEventListener('hms:session-expired', onExpired);
  }, [resetState]);

  const setSession = (newToken: string, newUser: User) => {
    localStorage.setItem('hms_token', newToken);
    localStorage.setItem('hms_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const login = async (username: string, password?: string) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { token: jwtToken, user: loggedUser } = response.data;
      setSession(jwtToken, loggedUser);
    } catch (err: any) {
      const msg = err.response?.data?.error || (err.code === 'ERR_NETWORK' || !err.response
        ? 'Cannot connect to backend server (port 5000). Please make sure to run "npm run dev" from the project ROOT folder.'
        : 'Login failed. Please check credentials.');
      throw new Error(msg);
    }
  };

  const guestLogin = async (emailOrUsername: string, password: string) => {
    try {
      const response = await api.post('/auth/guest-login', { emailOrUsername, password });
      const { token: jwtToken, user: loggedUser } = response.data;
      setSession(jwtToken, loggedUser);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Guest login failed. Please check credentials.';
      throw new Error(msg);
    }
  };

  // Real logout: ask the server to revoke the refresh session (invalidates it server-side),
  // then clear local state.
  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { _skipAuthRefresh: true } as any);
    } catch {
      // Even if the request fails, clear the local session.
    }
    resetState();
  };

  const switchRole = (newRole: UserRole) => {
    if (!user) return;
    const updatedUser: User = { ...user, role: newRole };
    setUser(updatedUser);
    localStorage.setItem('hms_user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, restored, login, guestLogin, setSession, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
