import { describe, it, expect, beforeEach } from "vitest";
import { mmkv, mmkvStorage } from "../mmkv";

describe("mmkv", () => {
  beforeEach(() => {
    mmkv.clearAll();
  });

  it("stores and retrieves string values", () => {
    mmkv.set("key", "value");
    expect(mmkv.getString("key")).toBe("value");
  });

  it("returns undefined for missing keys", () => {
    expect(mmkv.getString("nonexistent")).toBeUndefined();
  });

  it("deletes values", () => {
    mmkv.set("key", "value");
    mmkv.delete("key");
    expect(mmkv.getString("key")).toBeUndefined();
  });
});

describe("mmkvStorage (Zustand StateStorage adapter)", () => {
  beforeEach(() => {
    mmkv.clearAll();
  });

  it("getItem returns null for missing keys", () => {
    expect(mmkvStorage.getItem("missing")).toBeNull();
  });

  it("setItem and getItem round-trip", () => {
    mmkvStorage.setItem("key", '{"count":1}');
    expect(mmkvStorage.getItem("key")).toBe('{"count":1}');
  });

  it("removeItem deletes the key", () => {
    mmkvStorage.setItem("key", "value");
    mmkvStorage.removeItem("key");
    expect(mmkvStorage.getItem("key")).toBeNull();
  });
});
