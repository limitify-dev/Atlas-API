import { PrismaClient, Role, Status } from '../../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

async function createSuperAdmin() {
  try {
    // Super admin credentials
    const superAdminData = {
      email: 'superadmin@atlas.com',
      username: 'superadmin',
      password: 'SuperAdmin@123',
      name: 'Super Administrator',
      phone: '+1234567890',
      role: Role.SUPER_ADMIN,
      status: Status.ACTIVE,
      emailVerified: true,
    };

    // Check if super admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: superAdminData.email },
          { username: superAdminData.username },
        ],
      },
    });

    if (existingAdmin) {
      console.log('   Super admin already exists!');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Role: ${existingAdmin.role}`);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(superAdminData.password, 10);

    // Create super admin
    const superAdmin = await prisma.user.create({
      data: {
        ...superAdminData,
        password: hashedPassword,
      },
    });

    console.log('✅ Super admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ', superAdminData.email);
    console.log('👤 Username: ', superAdminData.username);
    console.log('🔑 Password: ', superAdminData.password);
    console.log('👑 Role:     ', superAdmin.role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('⚠️  IMPORTANT: Change the password after first login!');
    console.log('');
  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createSuperAdmin()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
