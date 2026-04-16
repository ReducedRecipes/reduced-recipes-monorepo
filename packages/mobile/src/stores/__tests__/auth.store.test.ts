import { describe, it, expect, beforeEach } from 'vitest';
import type { User } from '@rr/shared';
import { useAuthStore } from '../auth.store';
import { __resetStore } from '../../lib/__mocks__/expo-secure-store';
import * as SecureStore from 'expo-secure-store';

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: null,
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('auth.store', () => {
  beforeEach(() => {
    __resetStore();
    // Reset Zustand store to initial state
    useAuthStore.setState({
      user: null,
      sessionToken: null,
      isAuthenticated: false,
      isNewUser: false,
    });
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.sessionToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });

  it('setSession populates user, token, and isAuthenticated', () => {
    useAuthStore.getState().setSession('token-abc', mockUser);
    const state = useAuthStore.getState();

    expect(state.user).toEqual(mockUser);
    expect(state.sessionToken).toBe('token-abc');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isNewUser).toBe(false);
  });

  it('setSession stores token via SecureStore', () => {
    useAuthStore.getState().setSession('token-xyz', mockUser);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'session_token',
      'token-xyz',
    );
  });

  it('setSession sets isNewUser when passed true', () => {
    useAuthStore.getState().setSession('token', mockUser, true);

    expect(useAuthStore.getState().isNewUser).toBe(true);
  });

  it('clearSession resets all state', () => {
    useAuthStore.getState().setSession('token', mockUser, true);
    useAuthStore.getState().clearSession();
    const state = useAuthStore.getState();

    expect(state.user).toBeNull();
    expect(state.sessionToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });

  it('clearSession calls deleteToken via SecureStore', () => {
    useAuthStore.getState().setSession('token', mockUser);
    useAuthStore.getState().clearSession();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session_token');
  });

  it('hydrateFromStorage reads token and sets sessionToken when present', async () => {
    // Pre-store a token
    await SecureStore.setItemAsync('session_token', 'stored-token');
    __resetStore(); // clear mock call counts but keep data — need to re-store
    await SecureStore.setItemAsync('session_token', 'stored-token');

    await useAuthStore.getState().hydrateFromStorage();

    expect(useAuthStore.getState().sessionToken).toBe('stored-token');
  });

  it('hydrateFromStorage does not set sessionToken when no token stored', async () => {
    await useAuthStore.getState().hydrateFromStorage();

    expect(useAuthStore.getState().sessionToken).toBeNull();
  });
});
