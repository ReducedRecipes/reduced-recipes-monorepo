import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const storage: Record<string, string> = { session_token: 'test-token' };
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => { storage[key] = val; },
});

import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  fetchCollectionBookmarks,
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchFollowing,
  fetchUserCollections,
  moveBookmark,
  searchBookmarks,
  syncBookmarks,
  createBookmark,
} from './api';

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('Collections API', () => {
  it('fetchCollections calls GET /collections', async () => {
    const data = { items: [{ id: '1', name: 'Saved' }] };
    mockFetch.mockReturnValue(jsonResponse(data));
    const result = await fetchCollections();
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/collections'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('createCollection calls POST /collections with name', async () => {
    const col = { id: '2', name: 'Desserts' };
    mockFetch.mockReturnValue(jsonResponse(col));
    const result = await createCollection({ name: 'Desserts', is_public: true });
    expect(result).toEqual(col);
    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Desserts', is_public: true });
  });

  it('updateCollection calls PATCH /collections/:id', async () => {
    const col = { id: '2', name: 'Updated' };
    mockFetch.mockReturnValue(jsonResponse(col));
    await updateCollection('2', { name: 'Updated' });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/2');
    expect(init.method).toBe('PATCH');
  });

  it('deleteCollection calls DELETE /collections/:id', async () => {
    mockFetch.mockReturnValue(jsonResponse(undefined));
    await deleteCollection('2');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/2');
    expect(init.method).toBe('DELETE');
  });

  it('fetchCollectionBookmarks calls GET /collections/:id/bookmarks with cursor', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchCollectionBookmarks('c1', 'abc', 10);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/c1/bookmarks');
    expect(url).toContain('cursor=abc');
    expect(url).toContain('limit=10');
  });
});

describe('Follow System API', () => {
  it('followUser calls POST /users/:id/follow', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true }));
    const result = await followUser('u1');
    expect(result).toEqual({ success: true });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/follow');
    expect(init.method).toBe('POST');
  });

  it('unfollowUser calls DELETE /users/:id/follow', async () => {
    mockFetch.mockReturnValue(jsonResponse(undefined));
    await unfollowUser('u1');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/follow');
    expect(init.method).toBe('DELETE');
  });

  it('fetchFollowers calls GET /users/:id/followers', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchFollowers('u1', undefined, 20);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/followers');
    expect(url).toContain('limit=20');
  });

  it('fetchFollowing calls GET /users/:id/following', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchFollowing('u1');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/following');
  });

  it('fetchUserCollections calls GET /users/:id/collections', async () => {
    const data = { items: [] };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchUserCollections('u1');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/collections');
  });
});

describe('Bookmark Move & Search API', () => {
  it('moveBookmark calls POST /bookmarks/move', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true }));
    await moveBookmark('b1', 'c2');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/bookmarks/move');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bookmark_id: 'b1', target_collection_id: 'c2' });
  });

  it('searchBookmarks calls GET /bookmarks/search with query', async () => {
    const data = { items: [] };
    mockFetch.mockReturnValue(jsonResponse(data));
    await searchBookmarks('chicken', 'c1');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/bookmarks/search');
    expect(url).toContain('q=chicken');
    expect(url).toContain('collection_id=c1');
  });

  it('searchBookmarks works without collectionId', async () => {
    const data = { items: [] };
    mockFetch.mockReturnValue(jsonResponse(data));
    await searchBookmarks('pasta');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('q=pasta');
    expect(url).not.toContain('collection_id');
  });
});

describe('Bookmark Sync API', () => {
  it('syncBookmarks calls POST /sync/bookmarks with actions', async () => {
    const actions = [
      { recipe_id: 'r1', collection_id: null, action: 'add' as const, client_timestamp: '2024-01-01T00:00:00Z' },
    ];
    const response = { results: [{ recipe_id: 'r1', status: 'applied' as const }] };
    mockFetch.mockReturnValue(jsonResponse(response));
    const result = await syncBookmarks(actions);
    expect(result).toEqual(response);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/sync/bookmarks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ actions });
  });
});

describe('createBookmark with collection_id', () => {
  it('sends collection_id when provided', async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 'b1' }));
    await createBookmark('r1', 'c1');
    const [, init] = mockFetch.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ recipe_id: 'r1', collection_id: 'c1' });
  });

  it('sends null collection_id when not provided', async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 'b1' }));
    await createBookmark('r1');
    const [, init] = mockFetch.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ recipe_id: 'r1', collection_id: null });
  });
});
