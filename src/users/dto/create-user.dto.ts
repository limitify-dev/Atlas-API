import { ApiProperty } from '@nestjs/swagger';
import { Role, UserType } from '../../../prisma/generated/client';

export class CreateUserDto {
  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@mail.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username tag',
    example: 'johnDoe12',
  })
  username: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1234567890',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'User role',
    enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    example: 'USER',
  })
  role: Role;

  @ApiProperty({
    description: 'User type',
    enum: ['TEACHER', 'STUDENT', 'PARENT', 'STAFF'],
    example: 'STUDENT',
    nullable: true,
  })
  userType: UserType | null;

  @ApiProperty({
    description: 'User password',
    example: '**********',
  })
  password: string;
}
