import { api, tokenStorage } from './client';
import type {
  AuthResponseDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  UserProfileDto,
} from '../types/auth';

export const authApi = {
  async login(credentials: LoginRequestDto, remember: boolean = true): Promise<AuthResponseDto> {
    const res = await api.postWrapped<AuthResponseDto>('/api/auth/login', credentials);
    if (!res.success || !res.data) {
      throw new Error(res.message || 'Login failed.');
    }
    tokenStorage.setAuth(res.data.accessToken, res.data.refreshToken, remember);
    return res.data;
  },

  async refreshToken(dto: RefreshTokenRequestDto): Promise<AuthResponseDto> {
    const res = await api.postWrapped<AuthResponseDto>('/api/auth/refresh-token', dto);
    if (!res.success || !res.data) {
      throw new Error(res.message || 'Token refresh failed.');
    }
    return res.data;
  },

  async logout(): Promise<void> {
    const token = tokenStorage.getRefreshToken();
    try {
      if (token) {
        await api.post('/api/auth/logout', { refreshToken: token });
      }
    } finally {
      tokenStorage.clearAuth();
    }
  },

  async getMe(): Promise<UserProfileDto> {
    return api.get<UserProfileDto>('/api/users/me');
  },
};
