import { apiRequest } from '../api';

export async function loginUser(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function logoutUser() {
  return apiRequest('/auth/logout', { method: 'POST' });
}

export async function getCurrentUser() {
  const { user } = await apiRequest('/auth/me');
  return user;
}