import { describe, it, expect, beforeEach } from "vitest";
import { mmkv, mmkvStorage } from "../mmkv";

beforeEach(() => {
  // Clear any state between tests
  mmkv.delete("test-key");
  mmkv.delete("another-key");
});

describe("mmkv", () => {
  it("returns undefined for missing keys", () => {
    expect(mmkv.getString("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves a string value", () => {
    mmkv.set("test-key", "hello");
    expect(mmkv.getString("test-key")).toBe("hello");
  });

  it("overwrites existing values", () => {
    mmkv.set("test-key", "first");
    mmkv.set("test-key", "second");
    expect(mmkv.getString("test-key")).toBe("second");
  });

  it("deletes a key", () => {
    mmkv.set("test-key", "value");
    mmkv.delete("test-key");
    expect(mmkv.getString("test-key")).toBeUndefined();
  });
});

describe("mmkvStorage (Zustand StateStorage)", () => {
  it("returns null for missing keys", () => {
    expect(mmkvStorage.getItem("nonexistent")).toBeNull();
  });

  it("stores and retrieves via setItem/getItem", () => {
    mmkvStorage.setItem("test-key", '{"count":1}');
    expect(mmkvStorage.getItem("test-key")).toBe('{"count":1}');
  });

  it("removes items", () => {
    mmkvStorage.setItem("test-key", "value");
    mmkvStorage.removeItem("test-key");
    expect(mmkvStorage.getItem("test-key")).toBeNull();
  });

  it("shares state with mmkv", () => {
    mmkv.set("another-key", "shared");
    expect(mmkvStorage.getItem("another-key")).toBe("shared");
  });
});
