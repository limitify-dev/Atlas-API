# Authentication Module Documentation

## Overview

The Authentication module provides a complete JWT-based authentication system with refresh tokens, session management, and secure password handling. It implements industry-standard security practices for user authentication and authorization.

## Security Features

### JWT Token Management

- **Access Tokens**: Short-lived tokens (15 minutes default) for API access
- **Refresh Tokens**: Long-lived tokens (7 days default) for obtaining new access tokens
- **Token Storage**: Refresh tokens and sessions stored in database with expiration tracking
- **Token Rotation**: Refresh tokens are rotated on each refresh request

### Password Security

- **Hashing Algorithm**: bcryptjs with 10 salt rounds
- **Secure Validation**: Passwords never exposed in responses or logs
- **Password Reset**: Secure token-based password reset flow (TODO: implement email)

### Configuration

Environment variables for security configuration:

```env
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

**IMPORTANT**: Never commit production JWT secrets to version control!

## API Endpoints

### Register

Creates a new user account and returns authentication tokens.

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "username": "johndoe",
  "phone": "+1234567890",
  "tenantId": "tenant-uuid",
  "userType": "STUDENT"
}
```

**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "role": "USER",
    "status": "PENDING",
    "emailVerified": false
  }
}
```

**Errors:**
- `409 Conflict`: Email or username already exists
- `400 Bad Request`: Invalid input data

### Login

Authenticates a user with username and password.

```http
POST /auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "username": "johndoe",
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

**Errors:**
- `401 Unauthorized`: Invalid credentials

### Refresh Token

Obtains new access and refresh tokens using a valid refresh token.

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token",
  "user": { /* user object */ }
}
```

**Security Notes:**
- Old refresh token is invalidated immediately
- New refresh token is generated and stored
- Implements token rotation for enhanced security

**Errors:**
- `401 Unauthorized`: Invalid or expired refresh token

### Get Profile

Returns the authenticated user's profile.

```http
GET /auth/profile
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "userId": "user-uuid",
  "username": "johndoe"
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token

### Logout

Invalidates user session and refresh tokens.

```http
POST /auth/logout
Content-Type: application/json

{
  "userId": "user-uuid",
  "sessionToken": "access-token"
}
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Security Notes:**
- Deletes all refresh tokens (logs out from all devices)
- Invalidates current session
- Can be modified to support per-device logout

### Email Verification

Verifies user email address using token sent via email.

```http
GET /auth/verify-email?token=verification-token
```

**Status**: TODO - Email sending not implemented

### Request Password Reset

Sends password reset email to user.

```http
POST /auth/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Status**: TODO - Email sending not implemented

### Reset Password

Resets user password using reset token.

```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}
```

**Status**: TODO - Implementation pending

## Authentication Strategies

### Local Strategy (Username/Password)

Used for initial login authentication.

**File**: `strategies/local.strategy.ts`

**Process:**
1. Extracts username and password from request body
2. Validates credentials through AuthService.validateUser()
3. Returns user object if valid, throws UnauthorizedException if invalid

### JWT Strategy

Used for protecting routes that require authentication.

**File**: `strategies/jwt.strategy.ts`

**Process:**
1. Extracts JWT token from Authorization header (Bearer token)
2. Validates token signature and expiration
3. Extracts user payload (userId, username)
4. Attaches user to request object

## Guards

### JwtAuthGuard

Protects routes requiring authentication.

**Usage:**
```typescript
@UseGuards(JwtAuthGuard)
@Get('protected')
protectedRoute(@Request() req) {
  return req.user; // Contains { userId, username }
}
```

### LocalAuthGuard

Used on login endpoint to validate credentials.

**Usage:**
```typescript
@UseGuards(LocalAuthGuard)
@Post('login')
login(@Request() req) {
  return this.authService.login(req.user);
}
```

### Custom AuthGuard

Manual JWT validation guard (alternative to JwtAuthGuard).

**File**: `guards/auth.guard.ts`

## Data Models

### Session

Tracks active user sessions with access tokens.

```prisma
model Session {
  id           String   @id @default(uuid())
  userId       String
  token        String   @unique
  ipAddress    String?
  userAgent    String?
  expiresAt    DateTime
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
}
```

**Lifecycle:**
- Created on login/register
- Updated on token refresh
- Deleted on logout
- Automatically expires based on expiresAt

### RefreshToken

Stores refresh tokens for token rotation.

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

**Lifecycle:**
- Created on login/register
- Rotated on token refresh (old deleted, new created)
- Deleted on logout
- Automatically expires based on expiresAt

## Service Methods

### `register(registerDto: RegisterDto): Promise<AuthResponseDto>`

Creates new user account with authentication tokens.

**Flow:**
1. Validates and creates user (via UsersService)
2. Generates access and refresh tokens
3. Stores refresh token in database
4. Creates session record
5. Returns tokens and user object

**Security:**
- Passwords hashed by UsersService
- Tokens immediately active
- User status set to PENDING (requires approval)

### `login(user: any): Promise<AuthResponseDto>`

Authenticates user and provides tokens.

**Flow:**
1. Receives validated user from LocalStrategy
2. Generates access and refresh tokens
3. Stores refresh token in database
4. Creates session record
5. Updates lastLoginAt timestamp
6. Returns tokens and user object

### `refreshToken(refreshToken: string): Promise<AuthResponseDto>`

Refreshes authentication tokens.

**Flow:**
1. Verifies refresh token signature
2. Checks token exists in database and not expired
3. Deletes old refresh token
4. Generates new access and refresh tokens
5. Stores new refresh token
6. Creates new session
7. Returns new tokens and user object

**Security:**
- Implements token rotation
- Old tokens invalidated immediately
- Prevents token reuse attacks

### `validateUser(username: string, password: string): Promise<any | null>`

Validates user credentials.

**Flow:**
1. Fetches user from database by username
2. Compares password hash using bcrypt
3. Returns user without password if valid
4. Returns null if invalid

**Security:**
- Direct database access (bypasses UsersService to get password)
- Timing-attack resistant (bcrypt comparison)
- Never returns password in response

### `logout(userId: string, sessionToken: string): Promise<void>`

Invalidates user session and tokens.

**Flow:**
1. Deletes session matching userId and sessionToken
2. Deletes all refresh tokens for user

**Note:** Currently logs out from all devices. Can be modified for single-device logout.

### `verifyEmail(token: string): Promise<{ message: string }>`

**Status:** TODO - Implementation pending

### `requestPasswordReset(email: string): Promise<{ message: string }>`

**Status:** TODO - Implementation pending

### `resetPassword(token: string, newPassword: string): Promise<{ message: string }>`

**Status:** TODO - Implementation pending

## DTOs

### LoginDto
```typescript
{
  username: string;
  password: string;
}
```

### RegisterDto
```typescript
{
  email: string;
  password: string;
  name: string;
  username: string;
  phone?: string;
  tenantId?: string;
  userType?: 'TEACHER' | 'STUDENT' | 'PARENT' | 'STAFF';
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER'; // Defaults to USER
}
```

### AuthResponseDto
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}
```

### UserDto
```typescript
{
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  username: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  userType: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
}
```

## Security Best Practices

### ✅ Implemented

1. JWT tokens with secure secret from environment
2. Password hashing with bcryptjs (10 rounds)
3. Refresh token rotation
4. Token expiration (access: 15m, refresh: 7d)
5. Database-backed token validation
6. Session tracking
7. Secure password validation (never exposed)
8. HTTPS required in production

### 🚧 TODO

1. Rate limiting on authentication endpoints
2. Account lockout after failed attempts
3. Email verification implementation
4. Password reset implementation
5. IP address and user agent tracking for sessions
6. Two-factor authentication (2FA)
7. OAuth/Social login integration
8. Audit logging for security events
9. Device management
10. Remember me functionality

## Testing

### Unit Tests

```typescript
describe('AuthService', () => {
  it('should register user with hashed password', async () => {
    // Test implementation
  });

  it('should login user with valid credentials', async () => {
    // Test implementation
  });

  it('should refresh tokens and rotate refresh token', async () => {
    // Test implementation
  });

  it('should reject invalid credentials', async () => {
    // Test implementation
  });

  it('should logout and invalidate tokens', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Test complete authentication flows:
- Registration → Email verification → Login
- Login → Access protected route → Logout
- Login → Token refresh → Access protected route
- Failed login attempts → Account lockout

## Error Handling

- `UnauthorizedException`: Invalid credentials, expired tokens, or missing auth
- `ConflictException`: Email/username already exists during registration
- `BadRequestException`: Invalid input data or malformed requests
- `ForbiddenException`: Insufficient permissions

## Related Modules

- **Users Module**: User management and profile operations
- **Tenant Module**: Multi-tenant organization management

## Dependencies

- `@nestjs/jwt`: JWT token generation and validation
- `@nestjs/passport`: Authentication strategies
- `passport-jwt`: JWT strategy for Passport
- `passport-local`: Local strategy for Passport
- `bcryptjs`: Password hashing
- `@prisma/client`: Database operations

## Configuration

### JWT Constants

**File**: `constant.ts`

```typescript
export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION',
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
};
```

**⚠️ Security Warning**: Always use a strong, random JWT secret in production!

### Module Configuration

**File**: `auth.module.ts`

```typescript
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.accessTokenExpiry },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
```

## Production Checklist

- [ ] Set strong JWT_SECRET environment variable
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Implement email verification
- [ ] Set up monitoring and alerting
- [ ] Configure session timeout
- [ ] Add audit logging
- [ ] Review and test all security features
- [ ] Set up automated security scanning
