import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  userId: string;
  username: string;
  role: string;
  userType: string;
  tenantId: string;
  teacherId?: string;
  timezone?: string;
  schoolName?: string;
  schoolLogo?: string;
  brandColor?: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request: { user: AuthUser } = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
