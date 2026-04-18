import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
  ApiError,
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
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections');
    expect(init.headers['X-Client']).toBe('rr-mobile/1.0');
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
    expect(JSON.parse(init.body)).toEqual({ name: 'Updated' });
  });

  it('deleteCollection calls DELETE /collections/:id', async () => {
    mockFetch.mockReturnValue(jsonResponse(undefined));
    await deleteCollection('2');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/2');
    expect(init.method).toBe('DELETE');
  });

  it('fetchCollectionBookmarks calls GET /collections/:id/bookmarks with cursor and limit', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchCollectionBookmarks('c1', 'abc', 10);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/c1/bookmarks');
    expect(url).toContain('cursor=abc');
    expect(url).toContain('limit=10');
  });

  it('fetchCollectionBookmarks works without optional params', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchCollectionBookmarks('c1');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/collections/c1/bookmarks');
    expect(url).not.toContain('cursor=');
    expect(url).not.toContain('limit=');
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

  it('fetchFollowers calls GET /users/:id/followers with pagination', async () => {
    const data = { items: [{ id: 'f1', name: 'Alice', profile_image_url: null }], next_cursor: 'cur1' };
    mockFetch.mockReturnValue(jsonResponse(data));
    const result = await fetchFollowers('u1', undefined, 20);
    expect(result).toEqual(data);
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

  it('fetchFollowing passes cursor param', async () => {
    const data = { items: [], next_cursor: null };
    mockFetch.mockReturnValue(jsonResponse(data));
    await fetchFollowing('u1', 'cur1');
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('cursor=cur1');
  });

  it('fetchUserCollections calls GET /users/:id/collections', async () => {
    const data = { items: [{ id: 'c1', name: 'Favorites', is_public: true }] };
    mockFetch.mockReturnValue(jsonResponse(data));
    const result = await fetchUserCollections('u1');
    expect(result).toEqual(data);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/users/u1/collections');
  });
});

describe('Bookmark Move & Search API', () => {
  it('moveBookmark calls POST /bookmarks/move with correct body', async () => {
    mockFetch.mockReturnValue(jsonResponse({ success: true }));
    await moveBookmark('b1', 'c2');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/bookmarks/move');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bookmark_id: 'b1', target_collection_id: 'c2' });
  });

  it('searchBookmarks calls GET /bookmarks/search with query and collection_id', async () => {
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

  it('syncBookmarks handles multiple actions', async () => {
    const actions = [
      { recipe_id: 'r1', collection_id: 'c1', action: 'add' as const, client_timestamp: '2024-01-01T00:00:00Z' },
      { recipe_id: 'r2', collection_id: null, action: 'remove' as const, client_timestamp: '2024-01-01T00:00:01Z' },
    ];
    const response = {
      results: [
        { recipe_id: 'r1', status: 'applied' as const },
        { recipe_id: 'r2', status: 'conflict' as const, server_state: { exists: true, updated_at: '2024-01-02T00:00:00Z' } },
      ],
    };
    mockFetch.mockReturnValue(jsonResponse(response));
    const result = await syncBookmarks(actions);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.status).toBe('applied');
    expect(result.results[1]!.status).toBe('conflict');
    expect(result.results[1]!.server_state).toEqual({ exists: true, updated_at: '2024-01-02T00:00:00Z' });
  });
});

describe('API Error Handling', () => {
  it('throws ApiError on non-ok response', async () => {
    mockFetch.mockReturnValue(jsonResponse(
      { error: { message: 'Not found' } },
      404,
    ));
    await expect(fetchCollections()).rejects.toThrow(ApiError);
    await expect(fetchCollections()).rejects.toThrow('Not found');
  });

  it('throws ApiError with status code', async () => {
    mockFetch.mockReturnValue(jsonResponse(
      { error: { message: 'Unauthorized' } },
      401,
    ));
    try {
      await followUser('u1');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(401);
    }
  });

  it('handles non-JSON error responses gracefully', async () => {
    mockFetch.mockReturnValue(Promise.resolve({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    }));
    await expect(fetchCollections()).rejects.toThrow(ApiError);
  });
});

describe('Request Headers', () => {
  it('includes X-Client and Content-Type headers', async () => {
    mockFetch.mockReturnValue(jsonResponse({ items: [] }));
    await fetchCollections();
    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Client']).toBe('rr-mobile/1.0');
  });
});
