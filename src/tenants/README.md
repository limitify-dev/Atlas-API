# Tenant Module Documentation

## Overview

The Tenant module manages multi-tenant organizations (schools) in the Atlas system. Each tenant represents an independent school or educational institution with its own users, students, teachers, and data. This module implements complete tenant isolation and subscription management.

## Architecture

### Components

- **TenantsController**: Handles HTTP requests for tenant operations
- **TenantsService**: Contains business logic for tenant management
- **DTOs**: Data Transfer Objects for validation and API documentation
- **Prisma Integration**: Database operations with relationship handling

## Security Features

### Authentication & Authorization

All tenant endpoints are protected with JWT authentication and role-based access control.

#### Access Control Rules:

1. **Create Tenant** (`POST /tenants`)
   - Only `SUPER_ADMIN` role can create tenants
   - Validates slug and domain uniqueness

2. **Get All Tenants** (`GET /tenants`)
   - `SUPER_ADMIN` and `ADMIN` roles can view tenant lists

3. **Get Tenant** (`GET /tenants/:id` or `/tenants/slug/:slug`)
   - `SUPER_ADMIN` and `ADMIN` roles can view tenant details
   - Public slug endpoint for tenant identification

4. **Get Tenant Statistics** (`GET /tenants/:id/stats`)
   - `SUPER_ADMIN` and `ADMIN` roles can view statistics
   - Returns counts of users, students, teachers, and other entities

5. **Update Tenant** (`PATCH /tenants/:id`)
   - Only `SUPER_ADMIN` role can update tenants
   - Validates slug and domain uniqueness on update

6. **Delete Tenant** (`DELETE /tenants/:id`)
   - Only `SUPER_ADMIN` role can delete tenants
   - Cascades deletion through all related records

## API Endpoints

### Create Tenant

```http
POST /tenants
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Springfield Elementary School",
  "slug": "springfield-elementary",
  "domain": "school.springfield.edu",
  "email": "admin@springfield.edu",
  "phone": "+1234567890",
  "address": "123 School Street",
  "city": "Springfield",
  "state": "Illinois",
  "country": "USA",
  "zipCode": "62701",
  "subscriptionPlan": "PREMIUM",
  "maxStudents": 500,
  "maxTeachers": 50
}
```

**Response (201 Created):**
```json
{
  "id": "tenant-uuid",
  "name": "Springfield Elementary School",
  "slug": "springfield-elementary",
  "domain": "school.springfield.edu",
  "status": "TRIAL",
  "subscriptionPlan": "PREMIUM",
  "maxStudents": 500,
  "maxTeachers": 50,
  "createdAt": "2025-12-05T10:30:00.000Z",
  "updatedAt": "2025-12-05T10:30:00.000Z"
}
```

### Get All Tenants

```http
GET /tenants
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
[
  {
    "id": "tenant-uuid",
    "name": "Springfield Elementary",
    "slug": "springfield-elementary",
    "status": "ACTIVE",
    "subscriptionPlan": "PREMIUM",
    "createdAt": "2025-12-05T10:30:00.000Z"
  }
]
```

### Get Tenant by ID

```http
GET /tenants/:id
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "tenant-uuid",
  "name": "Springfield Elementary School",
  "slug": "springfield-elementary",
  "domain": "school.springfield.edu",
  "logo": "https://example.com/logo.png",
  "address": "123 School Street",
  "city": "Springfield",
  "state": "Illinois",
  "country": "USA",
  "zipCode": "62701",
  "phone": "+1234567890",
  "email": "admin@springfield.edu",
  "website": "https://springfield.edu",
  "status": "ACTIVE",
  "subscriptionPlan": "PREMIUM",
  "subscriptionStartDate": "2025-12-01T00:00:00.000Z",
  "subscriptionEndDate": "2026-12-01T00:00:00.000Z",
  "maxStudents": 500,
  "maxTeachers": 50,
  "settings": {
    "theme": "light",
    "language": "en"
  },
  "createdAt": "2025-12-05T10:30:00.000Z",
  "updatedAt": "2025-12-05T10:30:00.000Z",
  "_count": {
    "users": 45,
    "students": 350,
    "teachers": 30
  }
}
```

### Get Tenant by Slug

```http
GET /tenants/slug/:slug
Authorization: Bearer <access_token>
```

Used for subdomain routing and tenant identification.

### Get Tenant Statistics

```http
GET /tenants/:id/stats
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "tenant-uuid",
  "name": "Springfield Elementary School",
  "...": "...other tenant fields...",
  "statistics": {
    "users": 45,
    "students": 350,
    "teachers": 30,
    "parents": 280,
    "grades": 12,
    "sections": 24,
    "subjects": 15,
    "books": 5000,
    "buses": 10,
    "events": 25
  }
}
```

### Update Tenant

```http
PATCH /tenants/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated School Name",
  "status": "ACTIVE",
  "subscriptionPlan": "ENTERPRISE",
  "maxStudents": 1000
}
```

### Delete Tenant

```http
DELETE /tenants/:id
Authorization: Bearer <access_token>
```

**⚠️ Warning**: This operation cascades and deletes all related data including users, students, teachers, and all associated records.

## Data Models

### Tenant Entity (Prisma Schema)

```prisma
model Tenant {
  id                    String           @id @default(uuid())
  name                  String
  slug                  String           @unique
  domain                String?          @unique
  logo                  String?
  address               String?
  city                  String?
  state                 String?
  country               String?
  zipCode               String?
  phone                 String?
  email                 String?
  website               String?
  status                TenantStatus     @default(TRIAL)
  subscriptionPlan      SubscriptionPlan @default(FREE)
  subscriptionStartDate DateTime?
  subscriptionEndDate   DateTime?
  maxStudents           Int              @default(100)
  maxTeachers           Int              @default(20)
  settings              Json?
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  // Relations
  users                 User[]
  students              Student[]
  teachers              Teacher[]
  parents               Parent[]
  grades                Grade[]
  sections              Section[]
  subjects              Subject[]
  attendances           Attendance[]
  books                 Book[]
  buses                 Bus[]
  events                Event[]
  // ... and more
}
```

### Enums

**TenantStatus:**
- `TRIAL`: Trial period
- `ACTIVE`: Active subscription
- `SUSPENDED`: Temporarily suspended
- `CANCELLED`: Subscription cancelled

**SubscriptionPlan:**
- `FREE`: Free tier (limited features)
- `BASIC`: Basic plan
- `PREMIUM`: Premium features
- `ENTERPRISE`: Full enterprise features

## DTOs

### CreateTenantDto

```typescript
{
  name: string;                    // Required
  slug: string;                    // Required, unique
  domain?: string;                 // Optional, unique if provided
  logo?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: TenantStatus;           // Default: TRIAL
  subscriptionPlan?: SubscriptionPlan; // Default: FREE
  maxStudents?: number;            // Default: 100
  maxTeachers?: number;            // Default: 20
  settings?: Record<string, any>; // JSON settings
}
```

### UpdateTenantDto

Partial version of CreateTenantDto - all fields optional

## Service Methods

### `create(createTenantDto: CreateTenantDto)`

Creates a new tenant with validation.

**Validations:**
- Slug uniqueness
- Domain uniqueness (if provided)

**Returns:** Created tenant object

**Throws:**
- `ConflictException`: If slug or domain already exists

### `findAll()`

Retrieves all tenants ordered by creation date (newest first).

**Returns:** Array of tenant objects

### `findOne(id: string)`

Finds a tenant by ID with user/student/teacher counts.

**Returns:** Tenant object with `_count` field

**Throws:**
- `NotFoundException`: If tenant not found

### `findBySlug(slug: string)`

Finds a tenant by slug for subdomain routing.

**Returns:** Tenant object

**Throws:**
- `NotFoundException`: If tenant not found

### `update(id: string, updateTenantDto: UpdateTenantDto)`

Updates tenant information with validation.

**Validations:**
- Tenant existence
- Slug uniqueness (if changed)
- Domain uniqueness (if changed)

**Returns:** Updated tenant object

**Throws:**
- `NotFoundException`: If tenant not found
- `ConflictException`: If new slug or domain already exists

### `remove(id: string)`

Deletes a tenant and all related data.

**Returns:** Deleted tenant object

**Throws:**
- `NotFoundException`: If tenant not found

**⚠️ Warning**: Cascading delete removes all related records

### `getStats(id: string)`

Retrieves comprehensive statistics for a tenant.

**Returns:** Tenant object with detailed statistics

**Throws:**
- `NotFoundException`: If tenant not found

## Multi-Tenant Implementation

### Tenant Isolation

All tenant-specific data is isolated through the `tenantId` foreign key:

```prisma
model User {
  id       String  @id @default(uuid())
  tenantId String? // Links to tenant
  // ... other fields

  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

### Subdomain Routing

Tenants can be accessed via:
- Custom domain: `school.springfield.edu`
- Subdomain: `springfield-elementary.atlas.com`
- Slug-based: `/tenants/slug/springfield-elementary`

### Subscription Management

Each tenant has:
- **Subscription Plan**: Determines available features
- **Status**: Controls access (TRIAL, ACTIVE, SUSPENDED, CANCELLED)
- **Resource Limits**: `maxStudents`, `maxTeachers`
- **Subscription Dates**: Track billing periods

**TODO**: Implement subscription enforcement and billing integration

## Best Practices

1. **Unique Slugs**: Always use URL-friendly slugs (lowercase, hyphens)
2. **Resource Limits**: Enforce `maxStudents` and `maxTeachers` limits
3. **Cascade Awareness**: Understand that deleting a tenant removes ALL data
4. **Subscription Checks**: Validate subscription status before operations
5. **Custom Settings**: Use `settings` JSON field for tenant-specific configuration

## Error Handling

- `ConflictException`: Slug or domain already exists
- `NotFoundException`: Tenant not found
- `ForbiddenException`: Insufficient permissions (non-super admin)
- `UnauthorizedException`: Invalid or missing authentication token

## Future Enhancements

1. **Subscription Enforcement**: Block operations when subscription expired
2. **Resource Limit Enforcement**: Prevent exceeding maxStudents/maxTeachers
3. **Billing Integration**: Stripe/payment gateway integration
4. **Tenant Onboarding**: Automated setup wizard
5. **Tenant Analytics**: Usage metrics and dashboards
6. **White-Label Support**: Custom branding per tenant
7. **Data Export**: Tenant data backup and export
8. **Tenant Suspension**: Graceful suspension with data retention
9. **Multi-Region Support**: Geographic data distribution
10. **Tenant Templates**: Pre-configured tenant setups

## Testing

### Unit Tests

```typescript
describe('TenantsService', () => {
  it('should create a tenant with unique slug', async () => {
    // Test implementation
  });

  it('should throw ConflictException for duplicate slug', async () => {
    // Test implementation
  });

  it('should return tenant statistics', async () => {
    // Test implementation
  });

  it('should cascade delete all related data', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Test complete tenant workflows:
- Tenant creation → User creation → Student enrollment
- Subscription management and status changes
- Resource limit enforcement
- Tenant isolation verification

## Subscription Plans Comparison

| Feature | FREE | BASIC | PREMIUM | ENTERPRISE |
|---------|------|-------|---------|------------|
| Max Students | 100 | 500 | 2000 | Unlimited |
| Max Teachers | 20 | 50 | 200 | Unlimited |
| Storage | 1GB | 10GB | 100GB | Unlimited |
| Support | Community | Email | Priority | Dedicated |
| Custom Domain | ❌ | ❌ | ✅ | ✅ |
| White-Label | ❌ | ❌ | ❌ | ✅ |
| API Access | Limited | Standard | Advanced | Full |

## Related Modules

- **User Module**: Tenant-specific user management
- **Student Module**: Student enrollment and management
- **Teacher Module**: Teacher assignment and scheduling
- **Auth Module**: Authentication with tenant context

## Dependencies

- `@nestjs/common`: NestJS core functionality
- `@nestjs/swagger`: API documentation
- `@prisma/client`: Database ORM with cascade support
- `class-validator`: DTO validation
- `class-transformer`: DTO transformation

## Configuration

### Environment Variables

```env
# Tenant-related settings
DEFAULT_MAX_STUDENTS=100
DEFAULT_MAX_TEACHERS=20
ENABLE_CUSTOM_DOMAINS=true
TRIAL_PERIOD_DAYS=30
```

## Monitoring & Maintenance

### Key Metrics to Track

1. **Active Tenants**: Count by subscription status
2. **Resource Usage**: Students/teachers per tenant
3. **Subscription Status**: Trial/Active/Suspended counts
4. **Storage Usage**: Per tenant data size
5. **API Usage**: Request rates per tenant

### Maintenance Tasks

1. **Trial Expiration**: Automated checks for expired trials
2. **Subscription Renewal**: Handle subscription renewals
3. **Data Cleanup**: Archive suspended tenant data
4. **Resource Monitoring**: Alert on limit approaches
5. **Backup**: Regular tenant data backups

## Security Considerations

1. **Super Admin Only**: Only super admins can create/modify/delete tenants
2. **Data Isolation**: Ensure queries filter by tenantId
3. **Cascade Deletes**: Verify cascade behavior in production
4. **Subscription Enforcement**: Prevent access for expired subscriptions
5. **Audit Logging**: Track all tenant modifications

## Production Checklist

- [ ] Configure subscription enforcement
- [ ] Set up billing integration
- [ ] Implement resource limit checks
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerts
- [ ] Test cascade delete behavior
- [ ] Configure custom domain DNS
- [ ] Implement trial expiration automation
- [ ] Set up tenant analytics
- [ ] Review and test security controls
