import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
  QueryTeachersDto,
  TeacherResponseDto,
} from './dto';
import * as bcrypt from 'bcrypt';
import {
  Prisma,
  UserType,
  Role,
  Status,
  Gender,
} from '../../prisma/generated/client';
import * as XLSX from 'xlsx';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createTeacherDto: CreateTeacherDto,
    tenantId: string,
  ): Promise<TeacherResponseDto> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createTeacherDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    try {
      // Create user and teacher in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create user account for the teacher
        const username =
          createTeacherDto.email.split('@')[0] +
          Math.random().toString(36).substring(2, 6);
        const defaultPassword = 'Teacher@123';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const user = await tx.user.create({
          data: {
            tenantId,
            email: createTeacherDto.email,
            name: `${createTeacherDto.firstName} ${createTeacherDto.lastName}`,
            username,
            password: hashedPassword,
            phone: createTeacherDto.phone,
            role: Role.USER, // Or Role.TEACHER if you have that role, but schema says USER/ADMIN/SUPER_ADMIN
            userType: UserType.TEACHER,
            status: Status.ACTIVE,
          },
        });

        // Generate teacher ID
        const teacherCount = await tx.teacher.count({
          where: { tenantId },
        });
        const teacherId = `TCH${String(teacherCount + 1).padStart(3, '0')}`;

        // Create teacher record
        const teacher = await tx.teacher.create({
          data: {
            tenantId,
            userId: user.id,
            teacherId,
            firstName: createTeacherDto.firstName,
            lastName: createTeacherDto.lastName,
            dateOfBirth: createTeacherDto.dateOfBirth ? new Date(createTeacherDto.dateOfBirth) : null,
            gender: createTeacherDto.gender,
            qualification: createTeacherDto.qualification,
            specialization: createTeacherDto.specialization,
            department: createTeacherDto.department,
            joiningDate: createTeacherDto.joiningDate ? new Date(createTeacherDto.joiningDate) : new Date(),
          },
          include: {
            user: true,
          },
        });

        return teacher;
      });

      return this.transformToResponse(result);
    } catch (error) {
       if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Teacher with this info already exists');
        }
      }
      throw error;
    }
  }

  async processBulkUpload(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const results: { success: number; failed: number; errors: any[] } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const [index, row] of data.entries()) {
      try {
        const rowData = row as any;

        // Helper to get value case-insensitively
        const getVal = (key: string) => {
          const foundKey = Object.keys(rowData).find(
            (k) =>
              k.toLowerCase().replace(/\s/g, '') ===
              key.toLowerCase().replace(/\s/g, ''),
          );
          return foundKey ? rowData[foundKey] : undefined;
        };

        const dto = new CreateTeacherDto();
        dto.firstName = String(getVal('FirstName') || '');
        dto.lastName = String(getVal('LastName') || '');
        dto.email = String(getVal('Email') || '');
        dto.phone = getVal('Phone') ? String(getVal('Phone')) : undefined;
        dto.department = getVal('Department') ? String(getVal('Department')) : undefined;
        dto.qualification = getVal('Qualification') ? String(getVal('Qualification')) : undefined;
        dto.specialization = getVal('Specialization') ? String(getVal('Specialization')) : undefined;

        const dob = getVal('DateofBirth');
        dto.dateOfBirth = dob instanceof Date ? dob.toISOString() : undefined;

        const joiningDate = getVal('JoiningDate');
        dto.joiningDate = joiningDate instanceof Date ? joiningDate.toISOString() : undefined;
        
        dto.gender = getVal('Gender') as Gender;

        if (!dto.firstName || !dto.lastName || !dto.email) {
          throw new Error('Missing required fields (First Name, Last Name, Email)');
        }

        await this.create(dto, tenantId);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: index + 2,
          error: error.message,
          data: row,
        });
      }
    }

    return results;
  }

  async getBulkUploadTemplate(): Promise<Buffer> {
    const columns = [
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Department',
      'Qualification',
      'Specialization',
      'Gender',
      'Date of Birth',
      'Joining Date',
    ];

    const data = [
      {
        'First Name': 'John',
        'Last Name': 'Doe',
        Email: 'john.doe@school.com',
        Phone: '1234567890',
        Department: 'Science',
        Qualification: 'PhD',
        Specialization: 'Physics',
        Gender: 'MALE',
        'Date of Birth': '1980-01-01',
        'Joining Date': '2024-01-01',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Teachers');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async findAll(
    queryDto: QueryTeachersDto,
    tenantId: string,
  ): Promise<{
    data: TeacherResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { search, department, status, page = 1, limit = 10 } = queryDto;

    const where: Prisma.TeacherWhereInput = {
      tenantId,
      ...(department && { department: { contains: department, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { teacherId: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(status && { user: { status } }),
    };

    const [teachers, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        include: { user: true, card: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.teacher.count({ where }),
    ]);

    const data = teachers.map((teacher) => this.transformToResponse(teacher));

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, tenantId: string): Promise<TeacherResponseDto> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: { user: true, card: true },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return this.transformToResponse(teacher);
  }

  async update(
    id: string,
    updateTeacherDto: UpdateTeacherDto,
    tenantId: string,
  ): Promise<TeacherResponseDto> {
    const existingTeacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: { user: true },
    });

    if (!existingTeacher) {
      throw new NotFoundException('Teacher not found');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Update user info if needed
        if (
            updateTeacherDto.email || 
            updateTeacherDto.phone || 
            (updateTeacherDto.firstName || updateTeacherDto.lastName)
           ) {
          const userUpdateData: Prisma.UserUpdateInput = {};
          if (updateTeacherDto.email) userUpdateData.email = updateTeacherDto.email;
          if (updateTeacherDto.phone) userUpdateData.phone = updateTeacherDto.phone;
          if (updateTeacherDto.firstName || updateTeacherDto.lastName) {
             const firstName = updateTeacherDto.firstName || existingTeacher.firstName;
             const lastName = updateTeacherDto.lastName || existingTeacher.lastName;
             userUpdateData.name = `${firstName} ${lastName}`;
          }
          
          await tx.user.update({
            where: { id: existingTeacher.userId },
            data: userUpdateData,
          });
        }

        // Update teacher info
        const teacherUpdateData: Prisma.TeacherUpdateInput = {};
        if (updateTeacherDto.firstName) teacherUpdateData.firstName = updateTeacherDto.firstName;
        if (updateTeacherDto.lastName) teacherUpdateData.lastName = updateTeacherDto.lastName;
        if (updateTeacherDto.department) teacherUpdateData.department = updateTeacherDto.department;
        if (updateTeacherDto.qualification) teacherUpdateData.qualification = updateTeacherDto.qualification;
        if (updateTeacherDto.specialization) teacherUpdateData.specialization = updateTeacherDto.specialization;
        if (updateTeacherDto.gender) teacherUpdateData.gender = updateTeacherDto.gender;
        if (updateTeacherDto.dateOfBirth) teacherUpdateData.dateOfBirth = new Date(updateTeacherDto.dateOfBirth);
        if (updateTeacherDto.joiningDate) teacherUpdateData.joiningDate = new Date(updateTeacherDto.joiningDate);

        const updatedTeacher = await tx.teacher.update({
          where: { id },
          data: teacherUpdateData,
          include: { user: true },
        });

        return updatedTeacher;
      });

      return this.transformToResponse(result);
    } catch (error) {
       if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Email already exists');
        }
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string): Promise<{ message: string }> {
     const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    // Deleting the user will cascade delete the teacher because of the relation in schema?
    // Let's check schema:   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
    // Yes, deleting User deletes Teacher. 
    // But wait, should we delete the User? Yes, usually.
    
    await this.prisma.user.delete({
      where: { id: teacher.userId },
    });

    return { message: 'Teacher deleted successfully' };
  }

  async getStatistics(tenantId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalTeachers, activeTeachers, newJoinersThisMonth] = await Promise.all([
      // Total teachers
      this.prisma.teacher.count({
        where: { tenantId },
      }),
      // Active teachers (based on User status)
      this.prisma.teacher.count({
        where: { 
          tenantId,
          user: {
            status: Status.ACTIVE,
          },
        },
      }),
      // New joiners this month
      this.prisma.teacher.count({
        where: {
          tenantId,
          joiningDate: {
            gte: firstDayOfMonth,
          },
        },
      }),
    ]);
    
    // Get unique departments count
    const departments = await this.prisma.teacher.groupBy({
      by: ['department'],
      where: { tenantId },
      _count: true,
    });

    return {
      totalTeachers,
      activeTeachers,
      newJoinersThisMonth,
      departmentsCount: departments.length,
    };
  }

  private transformToResponse(teacher: any): TeacherResponseDto {
    return {
      id: teacher.id,
      teacherId: teacher.teacherId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.user.email,
      phone: teacher.user.phone,
      department: teacher.department,
      joiningDate: teacher.joiningDate,
      gender: teacher.gender,
      qualification: teacher.qualification,
      specialization: teacher.specialization,
      status: teacher.user.status,
      card: teacher.card ? {
        id: teacher.card.id,
        cardNumber: teacher.card.cardNumber,
        status: teacher.card.status,
      } : null,
      createdAt: teacher.createdAt,
      updatedAt: teacher.updatedAt,
    };
  }
}
