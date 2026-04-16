const store = new Map<string, string>();

export class MMKV {
  constructor(_options?: { id?: string }) {}

  getString(key: string): string | undefined {
    return store.get(key);
  }

  set(key: string, value: string): void {
    store.set(key, value);
  }

  delete(key: string): void {
    store.delete(key);
  }

  contains(key: string): boolean {
    return store.has(key);
  }

  clearAll(): void {
    store.clear();
  }
}
