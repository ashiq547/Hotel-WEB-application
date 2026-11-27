import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: 'https://hotel-api-pearl.vercel.app/api',
  withCredentials: true, // send the httpOnly refresh cookie
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach JWT access token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hms_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

const AUTH_ENDPOINTS = ['/auth/login', '/auth/guest-login', '/auth/refresh', '/auth/logout'];

let refreshing: Promise<string> | null = null;

/** Remove stored session artifacts (called on refresh failure / logout). */
export function clearSession() {
  localStorage.removeItem('hms_token');
  localStorage.removeItem('hms_user');
  window.dispatchEvent(new Event('hms:session-expired'));
}

/** Try to get a fresh access token via the httpOnly refresh cookie. */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await api.post('/auth/refresh', {}, { _skipAuthRefresh: true } as any);
    const { token, user } = res.data;
    if (token) {
      localStorage.setItem('hms_token', token);
      if (user) localStorage.setItem('hms_user', JSON.stringify(user));
      return token as string;
    }
  } catch {
    // Refresh failed — session is really gone.
    clearSession();
  }
  return null;
}

function redirectAfterLogout() {
  const currentPath = window.location.pathname;
  const isPublicPage = ['/', '/hotels', '/rooms', '/login', '/guest-login', '/register'].includes(currentPath);
  if (!isPublicPage) {
    window.location.href = currentPath === '/guest-dashboard' ? '/guest-login' : '/login';
  }
}

/**
 * When the server rejects the access token:
 * 1. Try one silent refresh using the httpOnly cookie.
 * 2. If that fails, clear the session and redirect to login.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config: any = error.config || {};
    const url = config.url || '';

    // Refresh endpoint failures mean the session is dead — just clean up.
    if (url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    if (status === 401 && !config._retry && !AUTH_ENDPOINTS.some((e) => url.includes(e))) {
      config._retry = true;

      // Only one refresh at a time; queued requests wait for it.
      refreshing = refreshing || refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const newToken = await refreshing;

      if (newToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }

      redirectAfterLogout();
    }

    return Promise.reject(error);
  }
);

export default api;
