import { ConflictException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: createUserDto.email },
          { username: createUserDto.username },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === createUserDto.email) {
        throw new ConflictException('Email already exists');
      }
      if (existingUser.username === createUserDto.username) {
        throw new ConflictException('Username already exists');
      }
    }
    // Hash password before saving
    if (!createUserDto.password) {
      throw new Error('Password is required');
    }
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
    });

    //Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findAll(tenantId?: string, role?: string, noTenant?: boolean) {
    const where: any = {};

    // If tenantId is provided, filter by it
    if (tenantId) {
      where.tenantId = tenantId;
    }

    // If noTenant is true, filter for users without a tenant
    if (noTenant) {
      where.tenantId = null;
    }

    // If role is provided, filter by it
    if (role) {
      where.role = role;
    } else {
      // Default behavior: hide SUPER_ADMIN unless specifically requested
      where.role = {
        not: 'SUPER_ADMIN',
      };
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map(({ password, ...user }) => user);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: id,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    //Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: username,
      },
    });

    if (!user) {
      return null;
    }

    //Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  async update(id: string, updateUserDto: UpdateUserDto) {
    // If password is being updated, hash it
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const user = await this.prisma.user.update({
      where: {
        id: id,
      },
      data: updateUserDto,
    });

    //Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: {
        id: id,
      },
    });
  }

  async approveUser(id: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
