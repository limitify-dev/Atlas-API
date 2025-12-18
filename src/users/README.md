# User Module Documentation

## Overview

The User module handles all user-related operations including user creation, retrieval, updates, and deletion. It integrates with the authentication system and implements role-based access control (RBAC) with tenant isolation.

## Architecture

### Components

- **UsersController**: Handles HTTP requests for user operations
- **UsersService**: Contains business logic for user management
- **DTOs**: Data Transfer Objects for validation and API documentation
- **Prisma Integration**: Database operations using Prisma ORM

## Security Features

### Authentication & Authorization

All user endpoints are protected with JWT authentication using `@UseGuards(JwtAuthGuard)`.

#### Access Control Rules:

1. **Create User** (`POST /users`)
   - Only `ADMIN` and `SUPER_ADMIN` roles can create users
   - Validates email and username uniqueness
   - Automatically hashes passwords using bcryptjs

2. **Get All Users** (`GET /users`)
   - Authenticated users can view user lists
   - Excludes `SUPER_ADMIN` users from results
   - TODO: Implement tenant-based filtering

3. **Get User by ID** (`GET /users/:id`)
   - Users can view their own profile
   - Admins can view any user profile
   - Returns user data without password

4. **Update User** (`PATCH /users/:id`)
   - Users can update their own profile
   - Admins can update any user profile
   - Password is automatically hashed if updated

5. **Delete User** (`DELETE /users/:id`)
   - Only `ADMIN` and `SUPER_ADMIN` roles can delete users
   - Cascades deletion through related records (via Prisma)

### Password Security

- Passwords are hashed using bcryptjs with salt rounds of 10
- Passwords are never returned in API responses
- Password validation in `findByUsername` is handled securely in AuthService

## API Endpoints

### Create User
```http
POST /users
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username123",
  "name": "John Doe",
  "password": "SecurePass123!",
  "phone": "+1234567890",
  "role": "USER",
  "userType": "STUDENT"
}
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "username123",
  "name": "John Doe",
  "phone": "+1234567890",
  "role": "USER",
  "userType": "STUDENT",
  "status": "PENDING",
  "emailVerified": false,
  "createdAt": "2025-12-05T10:30:00.000Z"
}
```

### Get All Users
```http
GET /users
Authorization: Bearer <access_token>
```

### Get User by ID
```http
GET /users/:id
Authorization: Bearer <access_token>
```

### Update User
```http
PATCH /users/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "+9876543210"
}
```

### Delete User
```http
DELETE /users/:id
Authorization: Bearer <access_token>
```

### Approve User (Change Status to ACTIVE)
```http
POST /users/:id/approve
Authorization: Bearer <access_token>
```

## Data Models

### User Entity (Prisma Schema)

```prisma
model User {
  id            String    @id @default(uuid())
  tenantId      String?   // Null for super admins
  email         String    @unique
  name          String
  username      String    @unique
  password      String
  phone         String?   @unique
  avatar        String?
  role          Role      @default(USER)
  userType      UserType?
  status        Status    @default(PENDING)
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?

  // Relations
  tenant                Tenant?
  sessions              Session[]
  refreshTokens         RefreshToken[]
  student               Student?
  teacher               Teacher?
  parent                Parent?
}
```

### Enums

**Role:**
- `SUPER_ADMIN`: Platform administrator
- `ADMIN`: School/tenant administrator
- `USER`: Regular user

**UserType:**
- `TEACHER`: Teaching staff
- `STUDENT`: Student
- `PARENT`: Parent/Guardian
- `STAFF`: Non-teaching staff

**Status:**
- `PENDING`: Awaiting approval
- `ACTIVE`: Active user
- `INACTIVE`: Deactivated
- `SUSPENDED`: Temporarily suspended

## DTOs

### CreateUserDto

```typescript
{
  name: string;
  email: string;
  username: string;
  phone?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
  userType?: 'TEACHER' | 'STUDENT' | 'PARENT' | 'STAFF' | null;
  password: string;
}
```

### UpdateUserDto

Partial version of CreateUserDto - all fields optional

## Service Methods

### `create(createUserDto: CreateUserDto)`
Creates a new user with password hashing and validation.

**Validations:**
- Email uniqueness
- Username uniqueness
- Password hashing (bcryptjs, 10 rounds)

**Returns:** User object without password

**Throws:**
- `ConflictException`: If email or username already exists

### `findAll()`
Retrieves all users excluding SUPER_ADMIN.

**Returns:** Array of user objects without passwords

### `findOne(id: string)`
Finds a user by ID.

**Returns:** User object without password or null

### `findByUsername(username: string)`
Finds a user by username.

**Returns:** User object without password or null

### `update(id: string, updateUserDto: UpdateUserDto)`
Updates user information. Hashes password if provided.

**Returns:** Updated user object without password

### `remove(id: string)`
Deletes a user by ID.

**Returns:** Deleted user object

### `approveUser(id: string)`
Changes user status to ACTIVE.

**Returns:** Updated user object without password

## Multi-Tenant Support

The User model supports multi-tenancy through the `tenantId` field:

- `tenantId === null`: Super admin (platform-level access)
- `tenantId !== null`: Tenant-specific user (school-level access)

**TODO:** Implement tenant filtering in controllers to ensure data isolation.

## Best Practices

1. **Never expose passwords**: All service methods remove the password field before returning
2. **Hash passwords**: Always hash passwords using bcryptjs before storing
3. **Validate uniqueness**: Check email and username uniqueness before creation
4. **Role-based access**: Implement proper authorization checks in controllers
5. **Tenant isolation**: Filter users by tenantId when implemented

## Error Handling

- `ConflictException`: Email or username already exists
- `ForbiddenException`: Insufficient permissions
- `UnauthorizedException`: Invalid or missing authentication token
- `NotFoundException`: User not found (handled by Prisma)

## Future Enhancements

1. Add tenant filtering to all query methods
2. Implement bulk user operations
3. Add user search and pagination
4. Implement user profile picture upload
5. Add email verification flow
6. Implement two-factor authentication (2FA)
7. Add user activity logging
8. Implement soft delete functionality

## Testing

### Unit Tests
Test user service methods in isolation with mocked Prisma client.

### Integration Tests
Test complete user flows including:
- User creation with authentication
- Role-based access control
- Password hashing and validation
- Tenant isolation

### Example Test Cases
```typescript
describe('UsersService', () => {
  it('should create a user with hashed password', async () => {
    // Test implementation
  });

  it('should throw ConflictException for duplicate email', async () => {
    // Test implementation
  });

  it('should not return password in response', async () => {
    // Test implementation
  });
});
```

## Related Modules

- **Auth Module**: Handles authentication and user validation
- **Tenant Module**: Manages tenant/school organizations
- **Student/Teacher/Parent Modules**: Extended user profiles

## Dependencies

- `@nestjs/common`: NestJS core functionality
- `@nestjs/swagger`: API documentation
- `@prisma/client`: Database ORM
- `bcryptjs`: Password hashing
- `class-validator`: DTO validation
- `class-transformer`: DTO transformation
