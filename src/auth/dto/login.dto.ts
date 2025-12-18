import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User username or email address',
    example: 'userName or john.doe@example.com',
  })
  identifier: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
  })
  password: string;
}
