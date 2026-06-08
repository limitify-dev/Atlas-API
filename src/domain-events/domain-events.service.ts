import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DomainEventsService {
  constructor(private readonly emitter: EventEmitter2) {}

  /**
   * Emits a domain event synchronously.
   * The event class must have a static EVENT string property.
   */
  emit(event: object): void {
    const eventName = (event.constructor as any).EVENT as string | undefined;
    if (!eventName) {
      throw new Error(
        `Missing static EVENT on ${event.constructor.name}. Add: static readonly EVENT = '...';`,
      );
    }
    this.emitter.emit(eventName, event);
  }

  emitAsync(event: object): Promise<any[]> {
    const eventName = (event.constructor as any).EVENT as string | undefined;
    if (!eventName) {
      throw new Error(`Missing static EVENT on ${event.constructor.name}.`);
    }
    return this.emitter.emitAsync(eventName, event);
  }
}
