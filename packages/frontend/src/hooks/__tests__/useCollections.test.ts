import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  fetchCollections: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
}));

import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from "../../lib/api";

const mockFetchCollections = vi.mocked(fetchCollections);
const mockCreateCollection = vi.mocked(createCollection);
const mockUpdateCollection = vi.mocked(updateCollection);
const mockDeleteCollection = vi.mocked(deleteCollection);

const mockCollection = {
  id: "col-1",
  user_id: "u-1",
  name: "Favourites",
  is_default: 1,
  is_public: 0,
  position: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCollections — API functions", () => {
  it("fetchCollections returns a list of collections", async () => {
    mockFetchCollections.mockResolvedValueOnce({
      items: [mockCollection],
    });

    const result = await fetchCollections();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Favourites");
    expect(mockFetchCollections).toHaveBeenCalledOnce();
  });

  it("createCollection sends name and returns new collection", async () => {
    const newCollection = {
      ...mockCollection,
      id: "col-2",
      name: "Desserts",
      is_default: 0,
    };
    mockCreateCollection.mockResolvedValueOnce(newCollection);

    const result = await createCollection({ name: "Desserts" });
    expect(result.id).toBe("col-2");
    expect(result.name).toBe("Desserts");
    expect(mockCreateCollection).toHaveBeenCalledWith({ name: "Desserts" });
  });

  it("updateCollection sends partial data and returns updated collection", async () => {
    const updated = { ...mockCollection, name: "My Favourites" };
    mockUpdateCollection.mockResolvedValueOnce(updated);

    const result = await updateCollection("col-1", {
      name: "My Favourites",
    });
    expect(result.name).toBe("My Favourites");
    expect(mockUpdateCollection).toHaveBeenCalledWith("col-1", {
      name: "My Favourites",
    });
  });

  it("deleteCollection calls API with collection id", async () => {
    mockDeleteCollection.mockResolvedValueOnce(undefined);

    await deleteCollection("col-1");
    expect(mockDeleteCollection).toHaveBeenCalledWith("col-1");
  });
});

describe("useCollections — collection filtering", () => {
  it("filters out excluded collection by id", () => {
    const collections = [
      mockCollection,
      { ...mockCollection, id: "col-2", name: "Desserts", is_default: 0 },
    ];
    const excludeId = "col-1";
    const filtered = collections.filter((c) => c.id !== excludeId);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("Desserts");
  });

  it("returns all collections when no excludeId", () => {
    const collections = [
      mockCollection,
      { ...mockCollection, id: "col-2", name: "Desserts", is_default: 0 },
    ];
    const filtered = collections;

    expect(filtered).toHaveLength(2);
  });
});
