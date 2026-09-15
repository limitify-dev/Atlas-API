import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_DEVICE_KEY = 'allowInactiveDevice';

/**
 * Marks a device-api route as reachable by a matching but still-INACTIVE
 * device key — only /device-api/register needs this, since that's the route
 * that activates a freshly (re)generated key in the first place.
 */
export const AllowInactiveDevice = () =>
  SetMetadata(ALLOW_INACTIVE_DEVICE_KEY, true);
