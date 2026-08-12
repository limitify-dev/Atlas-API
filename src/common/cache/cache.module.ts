import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Global cache module. RedisModule (also @Global) provides REDIS_CLIENT, so
 * CacheService can be injected anywhere without importing this module.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
