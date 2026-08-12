import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';

/**
 * Socket.IO adapter backed by Redis pub/sub.
 *
 * The default in-memory adapter only fans events out to sockets connected
 * to the *same* process. That's invisible at one API instance, but the
 * moment a second replica goes up (any horizontal scaling), a chat message
 * sent by a client on instance A silently never reaches a recipient
 * connected to instance B. This adapter fixes that by publishing every
 * emitted event through Redis so all instances receive it.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl =
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

    this.pubClient = createClient({ url: redisUrl });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (err) =>
      this.logger.error('Redis pub client error', err),
    );
    this.subClient.on('error', (err) =>
      this.logger.error('Redis sub client error', err),
    );

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log(
      'Socket.IO Redis adapter connected — realtime events now fan out across all API instances.',
    );
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
