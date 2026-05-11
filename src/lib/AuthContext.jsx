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

      // { user: null } from the server is a valid unauthenticated state, not an error
      if (!authed) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      const currentUser = await dataClient.auth.getCurrentUser();

      if (loginGenerationRef.current !== generation) return;

      // getCurrentUser returning null means the session dissolved between the two calls
      if (!currentUser) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      if (loginGenerationRef.current !== generation) return;

      const status = error?.status || error?.response?.status;
      // 401/403 are expected when the user is logged out — not a product error
      if (status === 401 || status === 403) {
        setAuthError(null);
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

  // Silently re-verify the session after the user returns to the tab (if they were away > 5 min)
  // or on a periodic 12-minute heartbeat while the page is active.
  useEffect(() => {
    let hiddenAt = null;
    const AWAY_THRESHOLD_MS = 5 * 60 * 1000;
    const HEARTBEAT_MS = 12 * 60 * 1000;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
        if (Date.now() - hiddenAt >= AWAY_THRESHOLD_MS) {
          checkAppState();
        }
        hiddenAt = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkAppState();
      }
    }, HEARTBEAT_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(heartbeat);
    };
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
