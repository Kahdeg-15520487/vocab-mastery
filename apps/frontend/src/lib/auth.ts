const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'LEARNER' | 'ADMIN';
  subscriptionTier: 'FREE' | 'EXPLORER' | 'WORDSMITH';
  subscriptionExpiresAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface AuthError {
  error: string;
}

class AuthService {
  private accessToken: string | null = null;

  constructor() {
    // Try to restore token from sessionStorage on init
    this.accessToken = sessionStorage.getItem('accessToken');
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers as Record<string, string>,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for refresh token
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async register(email: string, password: string, username: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    });

    this.accessToken = response.accessToken;
    sessionStorage.setItem('accessToken', response.accessToken);

    return response;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.accessToken = response.accessToken;
    sessionStorage.setItem('accessToken', response.accessToken);

    return response;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.accessToken = null;
      sessionStorage.removeItem('accessToken');
    }
  }

  async logoutAll(): Promise<void> {
    try {
      await this.request('/auth/logout-all', { method: 'POST' });
    } finally {
      this.accessToken = null;
      sessionStorage.removeItem('accessToken');
    }
  }

  async refresh(): Promise<string> {
    const response = await this.request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
    });

    this.accessToken = response.accessToken;
    sessionStorage.setItem('accessToken', response.accessToken);

    return response.accessToken;
  }

  async getMe(): Promise<{ user: User }> {
    return this.request('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    
    // Password change revokes all tokens, need to re-login
    this.accessToken = null;
    sessionStorage.removeItem('accessToken');
  }

  async deleteAccount(password: string): Promise<void> {
    await this.request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    
    this.accessToken = null;
    sessionStorage.removeItem('accessToken');
  }

  async exportData(): Promise<Blob> {
    const url = `${API_BASE}/auth/export`;
    
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    return response.blob();
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  clearTokens(): void {
    this.accessToken = null;
    sessionStorage.removeItem('accessToken');
  }
}

export const authService = new AuthService();
