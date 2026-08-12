import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis-backed presence service for chat.
 *
 * Replaces the in-memory Maps in ChatGateway that broke under horizontal scaling.
 * Uses two key schemas per user:
 *   - presence:user:{userId}:sockets  → Redis Set  (socketIds connected right now)
 *   - presence:tenant:{tenantId}:online → Redis Set (userIds currently online in tenant)
 *
 * Socket entries expire automatically via a TTL that is refreshed on each heartbeat.
 * Tenant sets are cleaned up when a user's last socket disconnects.
 */
@Injectable()
export class ChatPresenceService {
  private readonly logger = new Logger(ChatPresenceService.name);

  /** TTL in seconds for a user's socket set — generous enough to survive reconnects. */
  private readonly SOCKET_TTL_SECONDS = 120;

  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      // Reconnect automatically
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on('error', (err) =>
      this.logger.error(`Redis presence error: ${err.message}`),
    );
    this.redis.on('connect', () =>
      this.logger.log('Chat presence Redis connected'),
    );
  }

  // ─── Key helpers ─────────────────────────────────────────────────────────

  private userSocketsKey(userId: string): string {
    return `presence:user:${userId}:sockets`;
  }

  private tenantOnlineKey(tenantId: string): string {
    return `presence:tenant:${tenantId}:online`;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Register a new socket connection for a user.
   * Adds the socketId to the user's socket set and marks the user as online
   * in the tenant's online set.
   */
  async setOnline(
    userId: string,
    tenantId: string,
    socketId: string,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.sadd(this.userSocketsKey(userId), socketId);
    pipeline.expire(this.userSocketsKey(userId), this.SOCKET_TTL_SECONDS);
    pipeline.sadd(this.tenantOnlineKey(tenantId), userId);
    await pipeline.exec();
  }

  /**
   * Remove a socket on disconnect.
   * Returns true if the user still has other active sockets, false if they
   * are now fully offline (so the caller can broadcast an offline event).
   */
  async setOffline(userId: string, socketId: string): Promise<boolean> {
    await this.redis.srem(this.userSocketsKey(userId), socketId);
    const remaining = await this.redis.scard(this.userSocketsKey(userId));

    if (remaining === 0) {
      // User is fully offline — find their tenantId and remove from tenant set.
      // We scan all tenant online sets for this userId (simplest approach at this scale).
      await this.removeUserFromAllTenantSets(userId);
      return false;
    }

    return true;
  }

  /**
   * Check if a user has at least one active socket connection.
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.scard(this.userSocketsKey(userId));
    return count > 0;
  }

  /**
   * Get all socket IDs for a user (used to target direct socket emits).
   */
  async getUserSocketIds(userId: string): Promise<string[]> {
    return this.redis.smembers(this.userSocketsKey(userId));
  }

  /**
   * Get all online user IDs in a given tenant.
   */
  async getOnlineUsersInTenant(tenantId: string): Promise<string[]> {
    const members = await this.redis.smembers(
      this.tenantOnlineKey(tenantId),
    );

    // Filter to only users who still have active sockets (handles stale entries)
    const results = await Promise.all(
      members.map(async (userId) => ({
        userId,
        online: await this.isUserOnline(userId),
      })),
    );

    // Clean up stale entries in the background
    const stale = results.filter((r) => !r.online).map((r) => r.userId);
    if (stale.length > 0) {
      await this.redis.srem(this.tenantOnlineKey(tenantId), ...stale);
    }

    return results.filter((r) => r.online).map((r) => r.userId);
  }

  /**
   * Refresh the TTL on a user's socket set (call on ping/heartbeat).
   */
  async refreshTtl(userId: string): Promise<void> {
    await this.redis.expire(
      this.userSocketsKey(userId),
      this.SOCKET_TTL_SECONDS,
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Scan all `presence:tenant:*:online` keys to remove a userId.
   * This is O(tenants) but tenants are few; acceptable.
   */
  private async removeUserFromAllTenantSets(userId: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'presence:tenant:*:online',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of keys) {
          pipeline.srem(key, userId);
        }
        await pipeline.exec();
      }
    } while (cursor !== '0');
  }
}
