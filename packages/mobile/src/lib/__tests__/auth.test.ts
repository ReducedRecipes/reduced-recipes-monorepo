import { describe, it, expect, beforeEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { storeToken, getToken, deleteToken } from '../auth';
import { __resetStore } from '../__mocks__/expo-secure-store';

describe('auth lib (expo-secure-store wrapper)', () => {
  beforeEach(() => {
    __resetStore();
  });

  it('storeToken calls SecureStore.setItemAsync with correct key and value', async () => {
    await storeToken('my-token-123');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'session_token',
      'my-token-123',
    );
  });

  it('getToken calls SecureStore.getItemAsync and returns the stored value', async () => {
    await storeToken('abc');
    const token = await getToken();

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session_token');
    expect(token).toBe('abc');
  });

  it('getToken returns null when no token is stored', async () => {
    const token = await getToken();

    expect(token).toBeNull();
  });

  it('deleteToken calls SecureStore.deleteItemAsync with correct key', async () => {
    await storeToken('to-delete');
    await deleteToken();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session_token');
  });

  it('getToken returns null after deleteToken is called', async () => {
    await storeToken('temp');
    await deleteToken();
    const token = await getToken();

    expect(token).toBeNull();
  });
});
