const cache = new Map<string, Buffer>()

export class AvatarCacheService {
  get(key: string): Buffer | undefined {
    return cache.get(key)
  }

  set(key: string, data: Buffer): void {
    cache.set(key, data)
  }

  clearAll(): void {
    cache.clear()
  }

  get size(): number {
    return cache.size
  }
}
