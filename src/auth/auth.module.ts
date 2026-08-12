import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteService } from './invite.service';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { LocalStrategy } from './strategies/local.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constant';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EmailModule } from 'src/email/email.module';
import { StudioModule } from '../studio/studio.module';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    InviteService,
    OtpService,
    SmsService,
    LocalStrategy,
    JwtStrategy,
  ],
  imports: [
    PrismaModule,
    EmailModule,
    StudioModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.accessTokenExpiry },
    }),
  ],
  exports: [AuthService, InviteService, OtpService, SmsService],
})
export class AuthModule {}
