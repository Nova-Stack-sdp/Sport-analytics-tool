const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'https://sport--backend-api--7kcwxz9xblx5.code.run';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request to ${path} failed`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function register(data) {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export function login(data) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' });
}

export function getCurrentUser() {
  return request('/api/auth/me');
}
