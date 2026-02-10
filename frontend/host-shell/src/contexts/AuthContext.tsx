import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  permissions: string[];
}

interface ImpersonationInfo {
  isImpersonating: boolean;
  impersonatorId?: string;
  targetUserId?: string;
  reason?: string;
}

interface AuthContextType {
  user: User | null;
  impersonation: ImpersonationInfo;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  startImpersonation: (targetUserId: string, reason: string, duration: number) => Promise<void>;
  endImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationInfo>({ isImpersonating: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing tokens on mount
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      refresh();
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email,
      password,
    });

    const { accessToken, refreshToken, user: userData } = response.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await axios.post('http://localhost:3001/api/v1/auth/logout', {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setImpersonation({ isImpersonating: false });
    }
  };

  const refresh = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token');
      }

      const response = await axios.post('http://localhost:3001/api/v1/auth/refresh', {
        refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken, user: userData } = response.data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefreshToken);
      setUser(userData);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const startImpersonation = async (targetUserId: string, reason: string, duration: number) => {
    const token = localStorage.getItem('accessToken');
    const response = await axios.post(
      'http://localhost:3001/api/v1/auth/impersonate/start',
      { targetUserId, reason, durationMinutes: duration },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const { impersonationToken, targetUser } = response.data.data;
    localStorage.setItem('impersonationToken', impersonationToken);
    setImpersonation({
      isImpersonating: true,
      impersonatorId: user?.id,
      targetUserId: targetUser.id,
      reason,
    });
  };

  const endImpersonation = async () => {
    const impersonationToken = localStorage.getItem('impersonationToken');
    if (!impersonationToken) return;

    await axios.post(
      'http://localhost:3001/api/v1/auth/impersonate/end',
      {},
      { headers: { Authorization: `Bearer ${impersonationToken}` } }
    );

    localStorage.removeItem('impersonationToken');
    setImpersonation({ isImpersonating: false });
    await refresh();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        impersonation,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refresh,
        startImpersonation,
        endImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
