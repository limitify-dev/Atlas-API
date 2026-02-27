import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from 'src/common/supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
  ) {}

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
    const data: Record<string, unknown> = {};

    if (updateUserDto.email !== undefined) {
      data.email = updateUserDto.email;
    }
    if (updateUserDto.name !== undefined) {
      data.name = updateUserDto.name;
    }
    if (updateUserDto.username !== undefined) {
      data.username = updateUserDto.username;
    }
    if (updateUserDto.phone !== undefined) {
      data.phone = updateUserDto.phone;
    }
    if (updateUserDto.role !== undefined) {
      data.role = updateUserDto.role;
    }
    if (updateUserDto.userType !== undefined) {
      data.userType = updateUserDto.userType;
    }
    if (updateUserDto.status !== undefined) {
      data.status = updateUserDto.status;
    }
    if (updateUserDto.tenantId !== undefined) {
      data.tenantId = updateUserDto.tenantId;
    }

    // If password is being updated, hash it
    if (updateUserDto.password !== undefined) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    if (typeof data.email === 'string') {
      const existingByEmail = await this.prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existingByEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    if (typeof data.username === 'string') {
      const existingByUsername = await this.prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existingByUsername) {
        throw new ConflictException('Username already exists');
      }
    }

    const user = await this.prisma.user.update({
      where: {
        id: id,
      },
      data,
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

  async updateAvatar(id: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const fileName = `avatar-${Date.now()}.${fileExt}`;
    const filePath = user.tenantId
      ? `${user.tenantId}/users/${id}/${fileName}`
      : `system/users/${id}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from('atlas-profiles')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Avatar upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = this.supabase.client.storage
      .from('atlas-profiles')
      .getPublicUrl(filePath);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { avatar: urlData.publicUrl },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }
}
