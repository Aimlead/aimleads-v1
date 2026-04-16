import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { dataClient, isApiConfigured } from '@/services/dataClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const loginGenerationRef = useRef(0);

  const checkAppState = async () => {
    const generation = loginGenerationRef.current;
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const authed = await dataClient.auth.isAuthenticated();

      // If login() was called while we were waiting, discard stale result
      if (loginGenerationRef.current !== generation) return;

      if (!authed) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      const currentUser = await dataClient.auth.getCurrentUser();

      if (loginGenerationRef.current !== generation) return;

      setUser(currentUser || null);
      setIsAuthenticated(Boolean(currentUser));
    } catch (error) {
      if (loginGenerationRef.current !== generation) return;

      const status = error?.status || error?.response?.status;
      if (status === 401 || status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({ type: 'unknown', message: error?.message || 'Unable to initialize app state' });
      }
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      if (loginGenerationRef.current === generation) {
        setAppPublicSettings({ mode: dataClient.mode, backendConfigured: isApiConfigured });
        setIsLoadingAuth(false);
      }
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const login = async ({ email, password }) => {
    loginGenerationRef.current += 1;
    const result = await dataClient.auth.login({ email, password });
    setUser(result || null);
    setIsAuthenticated(Boolean(result));
    setAuthError(null);
    setIsLoadingAuth(false);
    return result;
  };

  const register = async ({ email, password, full_name }) => {
    const result = await dataClient.auth.register({ email, password, full_name });
    setUser(result || null);
    setIsAuthenticated(Boolean(result));
    setAuthError(null);
    return result;
  };

  const logout = async (navigateFn) => {
    setUser(null);
    setIsAuthenticated(false);
    await dataClient.auth.logout().catch(() => {});
    if (typeof navigateFn === 'function') navigateFn();
  };

  const navigateToLogin = () => {
    const redirectUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    dataClient.auth.redirectToLogin(redirectUrl);
  };

  const refreshUser = async () => {
    await checkAppState();
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      login,
      register,
      logout,
      navigateToLogin,
      checkAppState,
      refreshUser,
      mode: dataClient.mode,
    }),
    [user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
