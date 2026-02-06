import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from '../constant';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      userId: payload.sub, // Keep for backward compatibility
      username: payload.username,
      role: payload.role,
      userType: payload.userType,
      tenantId: payload.tenantId,
      timezone: payload.timezone,
      schoolName: payload.schoolName,
      schoolLogo: payload.schoolLogo,
      brandColor: payload.brandColor,
    };
  }
}
