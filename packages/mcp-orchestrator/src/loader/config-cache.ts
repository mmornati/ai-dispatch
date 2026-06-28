export class ConfigCache<T> {
  private store = new Map<string, T>();
  private timestamps = new Map<string, number>();

  set(key: string, value: T): void {
    this.store.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.timestamps.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.timestamps.clear();
  }

  getAll(): Map<string, T> {
    return new Map(this.store);
  }

  getAge(key: string): number | undefined {
    const ts = this.timestamps.get(key);
    return ts ? Date.now() - ts : undefined;
  }
}
