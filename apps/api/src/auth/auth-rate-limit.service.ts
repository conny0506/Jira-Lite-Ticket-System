import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

type MemoryRateEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly memoryStore = new Map<string, MemoryRateEntry>();
  private readonly useRedis =
    (process.env.AUTH_RATE_LIMIT_USE_REDIS ??
      (process.env.NODE_ENV === 'production' ? 'true' : 'false'))
      .toLowerCase()
      .trim() === 'true';
  private readonly redisClient = this.createRedisClient();

  async increment(
    action: 'login' | 'refresh',
    ip: string,
    limit: number,
    windowSeconds: number,
  ) {
    if (this.redisClient) {
      return this.incrementRedis(action, ip, limit, windowSeconds);
    }
    return this.incrementMemory(action, ip, limit, windowSeconds);
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  private createRedisClient() {
    if (!this.useRedis) return null;
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;
    return new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  private async incrementRedis(
    action: 'login' | 'refresh',
    ip: string,
    limit: number,
    windowSeconds: number,
  ) {
    const key = `auth:ratelimit:${action}:${ip}`;
    try {
      await this.redisClient!.connect();
    } catch {}

    const tx = this.redisClient!.multi();
    tx.incr(key);
    tx.expire(key, windowSeconds, 'NX');
    tx.ttl(key);
    const result = await tx.exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    const ttlSeconds = Number(result?.[2]?.[1] ?? windowSeconds);
    const allowed = count <= limit;
    return {
      allowed,
      count,
      resetAt: Date.now() + Math.max(ttlSeconds, 1) * 1000,
    };
  }

  private incrementMemory(
    action: 'login' | 'refresh',
    ip: string,
    limit: number,
    windowSeconds: number,
  ) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const key = `${action}:${ip}`;
    const current = this.memoryStore.get(key);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      this.memoryStore.set(key, next);
      return { allowed: true, count: 1, resetAt: next.resetAt };
    }
    current.count += 1;
    this.memoryStore.set(key, current);
    return {
      allowed: current.count <= limit,
      count: current.count,
      resetAt: current.resetAt,
    };
  }
}
