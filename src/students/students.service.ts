import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  QueryStudentsDto,
  StudentResponseDto,
  StudentCardQrResponseDto,
  StudentCardInfoDto,
} from './dto';
import * as bcrypt from 'bcryptjs';
import {
  Prisma,
  UserType,
  Role,
  Status,
  Gender,
  PermissionStatus,
} from '../../prisma/generated/client';
import * as XLSX from 'xlsx';
import { SupabaseService } from 'src/common/supabase/supabase.service';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private supabase: SupabaseService,
  ) {}

  async create(
    createStudentDto: CreateStudentDto,
    tenantId: string,
    photo?: Express.Multer.File,
  ): Promise<StudentResponseDto> {
    // Generate student ID
    const studentCount = await this.prisma.student.count({
      where: { tenantId },
    });
    const studentId = `ST${String(studentCount + 1).padStart(3, '0')}`;

    try {
      // Create student, parents, and link them in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Auto-resolve promotionId from the section if not explicitly provided
        let resolvedPromotionId = createStudentDto.promotionId || null;
        if (!resolvedPromotionId) {
          const section = await tx.section.findUnique({
            where: { id: createStudentDto.sectionId },
            select: { promotionId: true },
          });
          resolvedPromotionId = section?.promotionId ?? null;
        }

        // Create student (no user account needed)
        const student = await tx.student.create({
          data: {
            tenantId,
            studentId,
            firstName: createStudentDto.firstName,
            lastName: createStudentDto.lastName,
            email: createStudentDto.email || null,
            phone: createStudentDto.phone || null,
            dateOfBirth: new Date(createStudentDto.dateOfBirth),
            gender: createStudentDto.gender,
            nationality: createStudentDto.nationality || null,
            address: createStudentDto.address || null,
            bloodGroup: createStudentDto.bloodGroup || null,
            rollNumber: createStudentDto.rollNumber || null,
            gradeId: createStudentDto.gradeId,
            sectionId: createStudentDto.sectionId,
            promotionId: resolvedPromotionId,
            admissionDate: new Date(createStudentDto.admissionDate),
            photoUrl: createStudentDto.photoUrl || null,
          },
          include: {
            grade: true,
            section: true,
          },
        });

        // 1. Handle primary parent
        const parent1 = await this.getOrCreateParent(tx, tenantId, {
          name: createStudentDto.parentName,
          email: createStudentDto.parentEmail,
          phone: createStudentDto.parentPhone,
          relationship: createStudentDto.relationship,
          occupation: createStudentDto.occupation,
        });

        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: parent1.id,
            isPrimary: true,
          },
        });

        // 2. Handle optional second parent
        if (
          createStudentDto.parent2Email &&
          createStudentDto.parent2Name &&
          createStudentDto.parent2Phone
        ) {
          const parent2 = await this.getOrCreateParent(tx, tenantId, {
            name: createStudentDto.parent2Name,
            email: createStudentDto.parent2Email,
            phone: createStudentDto.parent2Phone,
            relationship: createStudentDto.parent2Relationship,
            occupation: createStudentDto.parent2Occupation,
          });

          // Avoid duplicate link if it's the same person
          if (parent2.id !== parent1.id) {
            await tx.studentParent.create({
              data: {
                studentId: student.id,
                parentId: parent2.id,
                isPrimary: false,
              },
            });
          }
        }

        return student;
      });
      // 2. Handle photo upload AFTER successful transaction (no rollback if it fails)
      let photoUrl: string | null = null;

      if (photo) {
        try {
          const fileExt = photo.originalname.split('.').pop() || 'jpg';
          const fileName = `profile.${fileExt}`;
          const filePath = `${tenantId}/students/${result.id}/${fileName}`;

          const { error: uploadError } = await this.supabase.client.storage
            .from('atlas-profiles')
            .upload(filePath, photo.buffer, {
              contentType: photo.mimetype,
              upsert: true,
              cacheControl: '3600',
            });

          if (uploadError) {
            // Just log the error — student remains without photo
            console.error(
              `Photo upload failed for student ${result.id}:`,
              uploadError.message,
            );
            // Optionally: notify admin/sentry, but do NOT throw
          } else {
            // Get public URL
            const { data: urlData } = this.supabase.client.storage
              .from('atlas-profiles')
              .getPublicUrl(filePath);

            photoUrl = urlData.publicUrl;

            // Update student with photoUrl
            await this.prisma.student.update({
              where: { id: result.id },
              data: { photoUrl },
            });
          }
        } catch (uploadErr) {
          // Catch any unexpected errors during upload/update (e.g. network)
          console.error(
            `Unexpected error during photo processing for student ${result.id}:`,
            uploadErr,
          );
          // Student stays without photo — no throw
        }
      }

      // 3. Return the complete student (photoUrl will be set if successful, null otherwise)
      return this.findOne(result.id, tenantId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[]) || [];
          if (target.includes('email')) {
            throw new ConflictException(
              'Student with this email already exists',
            );
          }
          if (target.includes('studentId')) {
            throw new ConflictException(
              'A student with this ID already exists in this school',
            );
          }
          throw new ConflictException(
            `Duplicate record found: ${target.join(', ')}`,
          );
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid grade or section ID');
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

    // Pre-fetch grades and sections for lookup
    const grades = await this.prisma.grade.findMany({
      where: { tenantId },
    });
    const sections = await this.prisma.section.findMany({
      where: { tenantId },
    });

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

        const gradeName = getVal('Grade');
        const sectionName = getVal('Section'); // Or 'Class'

        const grade = grades.find((g) => g.name === gradeName);
        if (!grade) {
          throw new Error(`Grade not found: ${gradeName}`);
        }

        const section = sections.find((s) => s.name === sectionName);
        if (!section) {
          throw new Error(`Section not found: ${sectionName}`);
        }

        const dto = new CreateStudentDto();
        dto.firstName = String(getVal('FirstName') || '');
        dto.lastName = String(getVal('LastName') || '');
        dto.email = String(getVal('Email') || '');
        dto.phone = getVal('Phone') ? String(getVal('Phone')) : undefined;

        const dob = getVal('DateofBirth');
        dto.dateOfBirth =
          dob instanceof Date ? dob.toISOString() : String(dob || '');

        dto.gender = getVal('Gender') as Gender;
        dto.nationality = getVal('Nationality')
          ? String(getVal('Nationality'))
          : undefined;
        dto.address = getVal('Address') ? String(getVal('Address')) : undefined;
        dto.bloodGroup = getVal('BloodGroup')
          ? String(getVal('BloodGroup'))
          : undefined;
        dto.gradeId = grade.id;
        dto.sectionId = section.id;

        const admDate = getVal('AdmissionDate');
        dto.admissionDate =
          admDate instanceof Date
            ? admDate.toISOString()
            : String(admDate || new Date().toISOString());

        // Parent info
        dto.parentName = String(getVal('ParentName') || '');
        dto.parentEmail = String(getVal('ParentEmail') || '');
        dto.parentPhone = String(getVal('ParentPhone') || '');
        dto.relationship = getVal('Relationship')
          ? String(getVal('Relationship'))
          : undefined;
        dto.occupation = getVal('Occupation')
          ? String(getVal('Occupation'))
          : undefined;

        // Parent 2 info
        dto.parent2Name = getVal('Parent2Name')
          ? String(getVal('Parent2Name'))
          : undefined;
        dto.parent2Email = getVal('Parent2Email')
          ? String(getVal('Parent2Email'))
          : undefined;
        dto.parent2Phone = getVal('Parent2Phone')
          ? String(getVal('Parent2Phone'))
          : undefined;
        dto.parent2Relationship = getVal('Parent2Relationship')
          ? String(getVal('Parent2Relationship'))
          : undefined;
        dto.parent2Occupation = getVal('Parent2Occupation')
          ? String(getVal('Parent2Occupation'))
          : undefined;

        // Basic validation before calling create to save DB calls if obviously wrong
        if (
          !dto.firstName ||
          !dto.lastName ||
          !dto.email ||
          !dto.parentEmail ||
          !dto.parentPhone
        ) {
          throw new Error(
            'Missing required fields (First Name, Last Name, Email, Parent Email, Parent Phone)',
          );
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

  getBulkUploadTemplate(): Buffer {
    const columns = [
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Date of Birth',
      'Gender',
      'Nationality',
      'Address',
      'Blood Group',
      'Grade',
      'Section',
      'Admission Date',
      'Parent Name',
      'Parent Email',
      'Parent Phone',
      'Relationship',
      'Occupation',
      'Parent2 Name',
      'Parent2 Email',
      'Parent2 Phone',
      'Parent2 Relationship',
      'Parent2 Occupation',
    ];

    const data = [
      {
        'First Name': 'John',
        'Last Name': 'Doe',
        Email: 'john.doe@example.com',
        Phone: '1234567890',
        'Date of Birth': '2010-01-01',
        Gender: 'MALE',
        Nationality: 'American',
        Address: '123 Main St',
        'Blood Group': 'O+',
        Grade: 'Senior 1',
        Section: 'S1A',
        'Admission Date': '2024-01-01',
        'Parent Name': 'Jane Doe',
        'Parent Email': 'jane.doe@example.com',
        'Parent Phone': '0987654321',
        Relationship: 'Mother',
        Occupation: 'Engineer',
      },
      {
        'First Name': 'Alice',
        'Last Name': 'Smith',
        Email: 'alice.smith@example.com',
        Phone: '2345678901',
        'Date of Birth': '2007-05-15',
        Gender: 'FEMALE',
        Nationality: 'British',
        Address: '456 Oak Ave',
        'Blood Group': 'A+',
        Grade: 'Senior 4',
        Section: 'S4MPGE',
        'Admission Date': '2024-01-01',
        'Parent Name': 'Bob Smith',
        'Parent Email': 'bob.smith@example.com',
        'Parent Phone': '3456789012',
        Relationship: 'Father',
        Occupation: 'Doctor',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async findAll(
    queryDto: QueryStudentsDto,
    tenantId: string,
  ): Promise<{
    data: StudentResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      search,
      gradeId,
      sectionId,
      promotionId,
      gender,
      page = 1,
      limit = 10,
    } = queryDto;

    const where: Prisma.StudentWhereInput = {
      tenantId,
      ...(gradeId && { gradeId }),
      ...(sectionId && { sectionId }),
      ...(promotionId && { promotionId }),
      ...(gender && { gender }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { studentId: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          // Support searching by full name (splitting terms)
          {
            AND: search
              .split(/\s+/)
              .filter(Boolean)
              .map((term) => ({
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                ],
              })),
          },
        ],
      }),
    };

    const [students, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: {
          grade: true,
          section: {
            include: { promotion: { select: { id: true, name: true, entryYear: true } } },
          },
          promotion: { select: { id: true, name: true, entryYear: true } },
          card: true,
          parents: {
            include: {
              parent: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    const data = students.map((student) => this.transformToResponse(student));

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, tenantId: string): Promise<StudentResponseDto> {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      include: {
        grade: true,
        section: true,
        card: true,
        parents: {
          include: {
            parent: {
              include: {
                user: true,
              },
            },
          },
        },
        conductPoints: true,
        borrowedBooks: {
          where: { returnDate: null },
        },
        attendances: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.transformToResponse(student);
  }

  async findByStudentId(
    studentId: string,
    tenantId: string,
  ): Promise<StudentResponseDto> {
    const student = await this.prisma.student.findUnique({
      where: {
        tenantId_studentId: {
          tenantId,
          studentId,
        },
      },
      include: {
        grade: true,
        section: true,
        card: true,
        parents: {
          include: {
            parent: {
              include: {
                user: true,
              },
            },
          },
        },
        conductPoints: true,
        borrowedBooks: {
          where: { returnDate: null },
        },
        attendances: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.transformToResponse(student);
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
    tenantId: string,
    photo?: Express.Multer.File,
  ): Promise<StudentResponseDto> {
    // Check if student exists
    const existingStudent = await this.prisma.student.findFirst({
      where: { id, tenantId },
    });

    if (!existingStudent) {
      throw new NotFoundException('Student not found');
    }

    try {
      // 1. Perform all updates in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Prepare update data for non-photo fields
        const studentUpdateData: Prisma.StudentUpdateInput = {};

        if (updateStudentDto.firstName !== undefined)
          studentUpdateData.firstName = updateStudentDto.firstName;
        if (updateStudentDto.lastName !== undefined)
          studentUpdateData.lastName = updateStudentDto.lastName;
        if (updateStudentDto.email !== undefined)
          studentUpdateData.email = updateStudentDto.email || null;
        if (updateStudentDto.phone !== undefined)
          studentUpdateData.phone = updateStudentDto.phone || null;
        if (updateStudentDto.dateOfBirth !== undefined)
          studentUpdateData.dateOfBirth = new Date(
            updateStudentDto.dateOfBirth,
          );
        if (updateStudentDto.gender !== undefined)
          studentUpdateData.gender = updateStudentDto.gender;
        if (updateStudentDto.nationality !== undefined)
          studentUpdateData.nationality = updateStudentDto.nationality || null;
        if (updateStudentDto.address !== undefined)
          studentUpdateData.address = updateStudentDto.address || null;
        if (updateStudentDto.bloodGroup !== undefined)
          studentUpdateData.bloodGroup = updateStudentDto.bloodGroup || null;
        if (updateStudentDto.rollNumber !== undefined)
          studentUpdateData.rollNumber = updateStudentDto.rollNumber || null;
        if (updateStudentDto.gradeId) {
          studentUpdateData.grade = {
            connect: { id: updateStudentDto.gradeId },
          };
        }
        if (updateStudentDto.sectionId) {
          studentUpdateData.section = {
            connect: { id: updateStudentDto.sectionId },
          };
        }
        if (updateStudentDto.admissionDate !== undefined)
          studentUpdateData.admissionDate = new Date(
            updateStudentDto.admissionDate,
          );

        if (Object.keys(studentUpdateData).length > 0) {
          await tx.student.update({
            where: { id },
            data: studentUpdateData,
          });
        }

        // 2. Handle Primary Parent Update/Link
        if (
          updateStudentDto.parentEmail &&
          updateStudentDto.parentName &&
          updateStudentDto.parentPhone
        ) {
          const p1 = await this.getOrCreateParent(tx, tenantId, {
            name: updateStudentDto.parentName,
            email: updateStudentDto.parentEmail,
            phone: updateStudentDto.parentPhone,
            relationship: updateStudentDto.relationship,
            occupation: updateStudentDto.occupation,
          });

          const existingP1Link = await tx.studentParent.findFirst({
            where: { studentId: id, isPrimary: true },
          });

          if (existingP1Link) {
            if (existingP1Link.parentId !== p1.id) {
              await tx.studentParent.update({
                where: { id: existingP1Link.id },
                data: { parentId: p1.id },
              });
            }
          } else {
            await tx.studentParent.create({
              data: { studentId: id, parentId: p1.id, isPrimary: true },
            });
          }
        }

        // 3. Handle Second Parent Update/Link/Remove
        if (
          updateStudentDto.parent2Email &&
          updateStudentDto.parent2Name &&
          updateStudentDto.parent2Phone
        ) {
          const p2 = await this.getOrCreateParent(tx, tenantId, {
            name: updateStudentDto.parent2Name,
            email: updateStudentDto.parent2Email,
            phone: updateStudentDto.parent2Phone,
            relationship: updateStudentDto.parent2Relationship,
            occupation: updateStudentDto.parent2Occupation,
          });

          const existingP2Link = await tx.studentParent.findFirst({
            where: { studentId: id, isPrimary: false },
          });

          if (existingP2Link) {
            if (existingP2Link.parentId !== p2.id) {
              await tx.studentParent.update({
                where: { id: existingP2Link.id },
                data: { parentId: p2.id },
              });
            }
          } else {
            await tx.studentParent.create({
              data: { studentId: id, parentId: p2.id, isPrimary: false },
            });
          }
        } else if (updateStudentDto.parent2Email === '') {
          // Explicitly cleared secondary parent
          await tx.studentParent.deleteMany({
            where: { studentId: id, isPrimary: false },
          });
        }
      });

      // 4. Handle photo update (if provided)
      if (photo) {
        try {
          if (
            photo.size <= 5 * 1024 * 1024 &&
            ['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimetype)
          ) {
            const fileExt = photo.originalname.split('.').pop() || 'jpg';
            const fileName = `profile.${fileExt}`;
            const filePath = `${tenantId}/students/${id}/${fileName}`;

            const { error: uploadError } = await this.supabase.client.storage
              .from('atlas-profiles')
              .upload(filePath, photo.buffer, {
                contentType: photo.mimetype,
                upsert: true,
                cacheControl: '3600',
              });

            if (!uploadError) {
              const { data: urlData } = this.supabase.client.storage
                .from('atlas-profiles')
                .getPublicUrl(filePath);

              await this.prisma.student.update({
                where: { id },
                data: { photoUrl: urlData.publicUrl },
              });
            }
          }
        } catch (uploadErr) {
          console.error(`Unexpected error processing photo:`, uploadErr);
        }
      }

      return this.findOne(id, tenantId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[]) || [];
          if (target.includes('email')) {
            throw new ConflictException(
              'Email already exists (student or parent)',
            );
          }
          if (target.includes('phone')) {
            throw new ConflictException('Phone number already exists');
          }
          if (target.includes('studentId')) {
            throw new ConflictException(
              'Student ID already exists in this school',
            );
          }
          throw new ConflictException(
            `Duplicate record found: ${target.join(', ')}`,
          );
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid grade or section ID');
        }
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string): Promise<{ message: string }> {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Delete student
    await this.prisma.student.delete({
      where: { id },
    });

    return { message: 'Student deleted successfully' };
  }

  private transformToResponse(student: any): StudentResponseDto {
    return {
      id: student.id,
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`,
      email: student.email,
      phone: student.phone,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      nationality: student.nationality,
      address: student.address,
      bloodGroup: student.bloodGroup,
      rollNumber: student.rollNumber,
      admissionDate: student.admissionDate,
      photoUrl: student.photoUrl,
      status: Status.ACTIVE, // Students don't have user accounts, so always active
      grade: {
        id: student.grade.id,
        name: student.grade.name,
        level: student.grade.level,
        educationLevel: student.grade.educationLevel,
      },
      section: {
        id: student.section.id,
        name: student.section.name,
      },
      parents:
        student.parents?.map((sp: any) => ({
          id: sp.parent.id,
          firstName: sp.parent.firstName,
          lastName: sp.parent.lastName,
          fullName: `${sp.parent.firstName} ${sp.parent.lastName}`,
          userId: sp.parent.user.id,
          email: sp.parent.user.email,
          phone: sp.parent.user.phone,
          relationship: sp.parent.relationship,
          occupation: sp.parent.occupation,
          isPrimary: sp.isPrimary,
        })) || [],
      card: student.card
        ? {
            id: student.card.id,
            cardNumber: student.card.cardNumber,
            status: student.card.status,
          }
        : null,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      stats: {
        attendancePercentage:
          student.attendances?.length > 0
            ? Math.round(
                (student.attendances.filter(
                  (a) => a.status === 'PRESENT' || a.status === 'LATE',
                ).length /
                  student.attendances.length) *
                  100,
              )
            : 0,
        conductPoints: student.conductPoints?.currentPoints ?? 100,
        booksBorrowed: student.borrowedBooks?.length || 0,
      },
    };
  }

  async getStatistics(tenantId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate date 7 days ago for week-over-week comparison
    // Set to start of day 7 days ago to include all students from that day onwards
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [totalEnrolled, newAdmissionsThisMonth, studentsAddedThisWeek] =
      await Promise.all([
        // Total enrolled students
        this.prisma.student.count({
          where: { tenantId },
        }),
        // New admissions this month (by admission date)
        this.prisma.student.count({
          where: {
            tenantId,
            admissionDate: {
              gte: firstDayOfMonth,
            },
          },
        }),
        // Students created/added in the last 7 days (by createdAt timestamp)
        // This is more accurate as it shows when students were actually added to the system
        this.prisma.student.count({
          where: {
            tenantId,
            createdAt: {
              gte: sevenDaysAgo,
            },
          },
        }),
      ]);

    // Since students don't have status field in the database, all enrolled students are considered active
    // Use studentsAddedThisWeek (based on createdAt) for the weekly count
    // This shows students actually added to the system this week, regardless of their admission date
    return {
      totalEnrolled,
      activeStudents: totalEnrolled, // All students are active
      newAdmissionsThisMonth,
      pendingReviews: 0, // No pending reviews since students are auto-approved
      inactiveStudents: 0,
      suspendedStudents: 0,
      newAdmissionsThisWeek: studentsAddedThisWeek, // Use createdAt for accurate weekly count
    };
  }

  /**
   * Generate a JWT token for a student's card QR code
   * The token contains the student ID and tenant ID for verification
   */
  async generateCardQrToken(
    studentId: string,
    tenantId: string,
  ): Promise<StudentCardQrResponseDto> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });

    if (!student) throw new NotFoundException('Student not found');

    const payload = {
      type: 'student_card',
      sub: student.id,
      tenantId: tenantId,
    };

    // Keep the token secure
    const token = this.jwtService.sign(payload, { expiresIn: '2d' });

    // WRAP THE TOKEN IN A URL
    // Replace 'https://limitify.crw/verify' with your actual web domain
    const deepLinkUrl = `https://limitify.rw/verify?data=${token}`;

    return {
      token: deepLinkUrl, // Return the URL instead of the raw JWT
      studentId: student.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
    };
  }

  /**
   * Verify a scanned student card QR token and return student info with active permissions
   */
  async scanStudentCard(
    token: string,
    scannerTenantId: string,
  ): Promise<StudentCardInfoDto> {
    // Verify and decode the JWT token
    let payload: { type: string; sub: string; tenantId: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired QR code');
    }

    // Validate token type
    if (payload.type !== 'student_card') {
      throw new BadRequestException('Invalid QR code type');
    }

    // Validate tenant (scanner must be from same tenant as the card)
    if (payload.tenantId !== scannerTenantId) {
      throw new UnauthorizedException(
        'This student card belongs to a different organization',
      );
    }

    // Find the student with their grade and section
    const student = await this.prisma.student.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
      },
      include: {
        grade: true,
        section: true,
        card: true,
        parents: {
          include: {
            parent: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found or has been removed');
    }

    // Fetch tenant (school) information
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      select: { id: true, name: true, logo: true },
    });

    // Get active permissions for this student
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:mm

    const activePermissions = await this.prisma.permission.findMany({
      where: {
        studentId: student.id,
        tenantId: payload.tenantId,
        status: PermissionStatus.APPROVED,
        fromDate: { lte: now },
        toDate: { gte: now },
        // For ONE_TIME permissions, check if not already used
        OR: [
          { permissionType: 'RECURRING' },
          { permissionType: 'ONE_TIME', qrCodeUsed: false },
        ],
      },
      orderBy: { fromDate: 'asc' },
    });

    // Filter permissions that are valid at the current time (if time restrictions exist)
    const validPermissions = activePermissions.filter((p) => {
      // If no time restrictions, permission is valid all day
      if (!p.fromTime || !p.toTime) return true;

      // Check if current time is within the allowed window
      return currentTime >= p.fromTime && currentTime <= p.toTime;
    });
    const data = this.transformToResponse(student);
    return {
      school: {
        id: tenant?.id || payload.tenantId,
        name: tenant?.name || 'Unknown School',
        logo: tenant?.logo || null,
      },
      student: data,
      activePermissions: validPermissions.map((p) => ({
        id: p.id,
        title: p.title,
        reason: p.reason,
        permissionType: p.permissionType,
        fromDate: p.fromDate,
        toDate: p.toDate,
        fromTime: p.fromTime,
        toTime: p.toTime,
        status: p.status,
      })),
      hasActivePermission: validPermissions.length > 0,
    };
  }

  private async getOrCreateParent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    parentData: {
      name: string;
      email: string;
      phone: string;
      relationship?: string;
      occupation?: string;
    },
  ) {
    let user = await tx.user.findUnique({
      where: { email: parentData.email },
      include: { parent: true },
    });

    if (!user) {
      const parentUsername =
        parentData.email.split('@')[0] +
        Math.random().toString(36).substring(2, 6);
      const parentPassword = 'Parent@123';
      const hashedParentPassword = await bcrypt.hash(parentPassword, 10);

      user = await tx.user.create({
        data: {
          tenantId,
          email: parentData.email,
          name: parentData.name,
          username: parentUsername,
          password: hashedParentPassword,
          phone: parentData.phone,
          role: Role.PARENT,
          userType: UserType.PARENT,
          status: Status.ACTIVE,
        },
        include: { parent: true },
      });

      const parentFirstName = parentData.name.split(' ')[0];
      const parentLastName =
        parentData.name.split(' ').slice(1).join(' ') || parentFirstName;

      await tx.parent.create({
        data: {
          tenantId,
          userId: user.id,
          firstName: parentFirstName,
          lastName: parentLastName,
          relationship: parentData.relationship || null,
          occupation: parentData.occupation || null,
        },
      });

      user = await tx.user.findUnique({
        where: { id: user.id },
        include: { parent: true },
      });
    } else {
      // Sync info if it exists
      const parentFirstName = parentData.name.split(' ')[0];
      const parentLastName =
        parentData.name.split(' ').slice(1).join(' ') || parentFirstName;

      await tx.user.update({
        where: { id: user.id },
        data: {
          name: parentData.name,
          phone: parentData.phone,
        },
      });

      await tx.parent.update({
        where: { userId: user.id },
        data: {
          firstName: parentFirstName,
          lastName: parentLastName,
          relationship: parentData.relationship || undefined,
          occupation: parentData.occupation || undefined,
        },
      });

      user = await tx.user.findUnique({
        where: { id: user.id },
        include: { parent: true },
      });
    }

    return user!.parent!;
  }
}
