import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
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
  SchoolProgram,
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
    private readonly cache: CacheService,
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
        // gradeId/sectionId are client-supplied FKs — verify they belong to
        // this tenant before linking a student to them (otherwise a crafted
        // id from another tenant would silently attach cross-tenant).
        const [grade, section] = await Promise.all([
          tx.grade.findFirst({
            where: { id: createStudentDto.gradeId, tenantId },
            select: { id: true },
          }),
          tx.section.findFirst({
            where: { id: createStudentDto.sectionId, tenantId },
            select: { id: true, promotionId: true },
          }),
        ]);
        if (!grade) {
          throw new NotFoundException(
            `Grade ${createStudentDto.gradeId} not found.`,
          );
        }
        if (!section) {
          throw new NotFoundException(
            `Section ${createStudentDto.sectionId} not found.`,
          );
        }

        // Auto-resolve promotionId from the section if not explicitly provided
        const resolvedPromotionId =
          createStudentDto.promotionId || section.promotionId || null;

        // Create student (no user account needed)
        const student = await tx.student.create({
          data: {
            tenantId,
            studentId,
            firstName: createStudentDto.firstName,
            lastName: createStudentDto.lastName,
            email: createStudentDto.email || null,
            phone: createStudentDto.phone || null,
            dateOfBirth: createStudentDto.dateOfBirth
              ? new Date(createStudentDto.dateOfBirth)
              : null,
            gender: createStudentDto.gender,
            program: createStudentDto.program || null,
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

        // 1. Handle primary parent — optional. Parents can be linked later
        //    via POST /students/:id/parents.
        let parent1Id: string | null = null;
        if (
          createStudentDto.parentName &&
          createStudentDto.parentEmail &&
          createStudentDto.parentPhone
        ) {
          const parent1 = await this.getOrCreateParent(tx, tenantId, {
            name: createStudentDto.parentName,
            email: createStudentDto.parentEmail,
            phone: createStudentDto.parentPhone,
            relationship: createStudentDto.relationship,
            occupation: createStudentDto.occupation,
          });
          parent1Id = parent1.id;

          await tx.studentParent.create({
            data: {
              studentId: student.id,
              parentId: parent1.id,
              isPrimary: true,
            },
          });
        }

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

          // Avoid duplicate link if it's the same person; if there's no
          // primary parent yet, promote this one to primary.
          if (parent2.id !== parent1Id) {
            await tx.studentParent.create({
              data: {
                studentId: student.id,
                parentId: parent2.id,
                isPrimary: parent1Id === null,
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

  /**
   * Bulk-import students from a multi-sheet workbook where **each sheet is a
   * classroom** (sheet name = "<grade> <section>", e.g. "S1A", "S4 MS1",
   * "S6A"). Header-tolerant: accepts a single "Names" column or split
   * "lastname"/"firstname", plus "Gender", "Program" (Board/Day), an
   * optional "Comb" combination code, and an optional "student_ID".
   *
   * Additive: a row that matches an existing student (by student_ID, else by
   * normalised full name within the section) is UPDATED on the fields the
   * sheet carries; unmatched rows are created with a generated ST-id, a null
   * date of birth and today's admission date. Missing sections (including
   * combination classes like "S6 HLP") are created on the fly.
   */
  async processBulkUpload(
    file: Express.Multer.File,
    tenantId: string,
    promotionId?: string,
  ): Promise<{
    success: number;
    created: number;
    updated: number;
    failed: number;
    errors: any[];
    cohort?: { id: string; name: string } | null;
    classroomsLinked?: number;
    bySheet?: {
      sheet: string;
      created: number;
      updated: number;
      failed: number;
    }[];
  }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });

    const results = {
      success: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as any[],
      cohort: null as { id: string; name: string } | null,
      classroomsLinked: 0,
      bySheet: [] as {
        sheet: string;
        created: number;
        updated: number;
        failed: number;
      }[],
    };

    // ── Resolve the target cohort (explicit, else the active promotion) ──
    let targetCohort: { id: string; name: string } | null = null;
    if (promotionId) {
      const promo = await this.prisma.promotion.findFirst({
        where: { id: promotionId, tenantId },
        select: { id: true, name: true },
      });
      if (!promo) {
        throw new BadRequestException('Selected cohort (promotion) not found.');
      }
      targetCohort = promo;
    } else {
      targetCohort = await this.prisma.promotion.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { entryYear: 'desc' },
      });
    }
    results.cohort = targetCohort;

    const grades = await this.prisma.grade.findMany({ where: { tenantId } });
    const sections = await this.prisma.section.findMany({
      where: { tenantId },
    });
    const combinations = await this.prisma.combination.findMany({
      where: { tenantId },
    });
    const linkedSectionIds = new Set<string>();

    // Cell values from the sheet are `unknown` — coerce safely to a string.
    const str = (v: unknown): string => {
      if (v == null) return '';
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'object') return '';
      return `${v as string | number | boolean}`;
    };
    const norm = (v: unknown) =>
      str(v).trim().toLowerCase().replace(/\s+/g, ' ');
    const tight = (v: unknown) => norm(v).replace(/[\s._-]+/g, '');

    // Running ST-id sequence for created students.
    let seq = await this.prisma.student.count({ where: { tenantId } });
    const nextStudentId = () => `ST${String(++seq).padStart(3, '0')}`;

    // Find or create a "label" combination (no subject list).
    const ensureCombination = async (code: string) => {
      const c = code.trim();
      if (!c) return null;
      const hit = combinations.find((x) => tight(x.code) === tight(c));
      if (hit) return hit;
      const created = await this.prisma.combination.create({
        data: {
          tenantId,
          name: c.toUpperCase(),
          code: c.toUpperCase(),
          subjectIds: [],
        },
      });
      combinations.push(created);
      return created;
    };

    // Find or create the grade for a sheet-name token like "S4" / "P3".
    const ensureGrade = async (token: string) => {
      const t = token.trim().toUpperCase();
      const hit = grades.find(
        (g) => tight(g.code) === tight(t) || tight(g.name) === tight(t),
      );
      if (hit) return hit;
      const m = t.match(/^([SP])\s*(\d+)$/);
      if (!m) return null; // don't invent a grade we can't classify
      const kind = m[1];
      const level = parseInt(m[2], 10);
      const created = await this.prisma.grade.create({
        data: {
          tenantId,
          code: `${kind}${level}`,
          name: `${kind === 'P' ? 'Primary' : 'Senior'} ${level}`,
          level,
          schoolLevel: kind === 'P' ? 'PRIMARY' : 'SENIOR',
          educationLevel:
            kind === 'P' ? 'PRIMARY' : level >= 4 ? 'ADVANCED' : 'ORDINARY',
        },
      });
      grades.push(created);
      return created;
    };

    // Find or create a grade-scoped section (combination classes included).
    const ensureSection = async (
      grade: { id: string; code: string },
      rawName: string,
      isCombination: boolean,
    ) => {
      const target = tight(rawName);
      const found = sections.find(
        (s) =>
          s.gradeId === grade.id &&
          (target === tight(s.name) ||
            target === tight(`${grade.code}${s.name}`) ||
            target === tight(`${grade.code} ${s.name}`)),
      );
      if (found) return found;
      const combo = isCombination ? await ensureCombination(rawName) : null;
      const created = await this.prisma.section.create({
        data: {
          tenantId,
          gradeId: grade.id,
          name: rawName.trim().toUpperCase(),
          capacity: 40,
          isActive: true,
          combinationId: combo?.id ?? null,
          promotionId: targetCohort?.id ?? null,
        },
      });
      sections.push(created);
      if (targetCohort) linkedSectionIds.add(created.id);
      return created;
    };

    // "S4 MS1 STUDENTS/2026-2027" → { gradeToken: "S4", sectionToken: "MS1" }
    const parseSheetName = (name: string) => {
      const cleaned = name
        .replace(/students?.*$/i, '')
        .replace(/\/.*$/, '')
        .replace(/^kcs-?/i, '')
        .trim();
      const m = cleaned.match(
        /^\s*(s\s*\d+|p\s*\d+|senior\s*\d+|primary\s*\d+|\d+)\s*(.*)$/i,
      );
      if (!m) return null;
      return {
        gradeToken: m[1].replace(/\s+/g, '').toUpperCase(),
        sectionToken: (m[2] || '').replace(/\s+/g, ' ').trim(),
      };
    };

    for (const sheetName of workbook.SheetNames) {
      if (!sheetName.trim() || norm(sheetName) === 'summary') continue;
      const stat = { sheet: sheetName, created: 0, updated: 0, failed: 0 };

      try {
        const sheet = workbook.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          blankrows: false,
          defval: '',
        });

        const headerIdx = rows.findIndex(
          (r) =>
            Array.isArray(r) &&
            r.some((c) =>
              [
                'names',
                'name',
                'lastname',
                'last name',
                'firstname',
                'first name',
              ].includes(norm(c)),
            ),
        );
        if (headerIdx === -1) {
          results.errors.push({ sheet: sheetName, error: 'No header row' });
          results.bySheet.push(stat);
          continue;
        }
        const header = rows[headerIdx].map((c) => norm(c));
        const col = (...cands: string[]) => {
          for (const c of cands) {
            const i = header.indexOf(c);
            if (i !== -1) return i;
          }
          return -1;
        };
        const iNo = col('no', 'n°', '#');
        const iNames = col('names', 'name');
        const iLast = col('lastname', 'last name', 'surname');
        const iFirst = col('firstname', 'first name', 'other names');
        const iGender = col('gender', 'sex');
        const iProgram = col('program', 'programme');
        const iComb = col('comb', 'combination', 'option');
        const iSid = col('student_id', 'studentid', 'student id', 'id');

        const parsed = parseSheetName(sheetName);
        const grade = parsed ? await ensureGrade(parsed.gradeToken) : null;
        if (!grade) {
          results.errors.push({
            sheet: sheetName,
            error: `Could not resolve a grade from the sheet name`,
          });
          results.bySheet.push(stat);
          continue;
        }
        const isAdvanced = grade.educationLevel === 'ADVANCED';

        for (let r = headerIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          try {
            const oneName = (i: number) =>
              i === -1 ? '' : str(row[i]).trim().replace(/\s+/g, ' ');

            const nameCell =
              iNames !== -1
                ? oneName(iNames)
                : `${oneName(iLast)} ${oneName(iFirst)}`.trim();
            if (!nameCell) continue;
            if (iNo !== -1 && !/^\d+$/.test(str(row[iNo]).trim())) {
              continue; // skip totals / spacer rows
            }

            let firstName = '';
            let lastName = '';
            if (iNames !== -1) {
              firstName = oneName(iNames);
            } else {
              lastName = oneName(iLast);
              firstName = oneName(iFirst);
            }
            if (!firstName && !lastName) continue;

            const gRaw = norm(iGender === -1 ? '' : row[iGender]);
            const gender: Gender | null = gRaw.startsWith('m')
              ? Gender.MALE
              : gRaw.startsWith('f')
                ? Gender.FEMALE
                : null;
            if (!gender) {
              throw new Error(`Unrecognised gender "${str(row[iGender])}"`);
            }

            const pRaw = norm(iProgram === -1 ? '' : row[iProgram]);
            const program: SchoolProgram | null =
              pRaw.startsWith('board') || pRaw.startsWith('bord')
                ? SchoolProgram.BOARDING
                : pRaw.startsWith('day')
                  ? SchoolProgram.DAY
                  : null;

            const combCode = iComb === -1 ? '' : str(row[iComb]).trim();
            const sectionRaw = combCode || parsed!.sectionToken || 'A';
            const section = await ensureSection(
              grade,
              sectionRaw,
              !!combCode || isAdvanced,
            );

            if (
              targetCohort &&
              section.promotionId !== targetCohort.id &&
              !linkedSectionIds.has(section.id)
            ) {
              await this.prisma.section.update({
                where: { id: section.id },
                data: { promotionId: targetCohort.id },
              });
              section.promotionId = targetCohort.id;
              linkedSectionIds.add(section.id);
            }

            const sidCell = iSid === -1 ? '' : str(row[iSid]).trim();
            let existing: { id: string } | null = null;
            if (sidCell) {
              existing = await this.prisma.student.findFirst({
                where: { tenantId, studentId: sidCell },
                select: { id: true },
              });
            }
            if (!existing) {
              const want = tight(`${firstName}${lastName}`);
              const inSection = await this.prisma.student.findMany({
                where: { tenantId, sectionId: section.id },
                select: { id: true, firstName: true, lastName: true },
              });
              existing =
                inSection.find(
                  (c) => tight(`${c.firstName}${c.lastName}`) === want,
                ) ?? null;
            }

            const data = {
              firstName,
              lastName,
              gender,
              gradeId: grade.id,
              sectionId: section.id,
              ...(program ? { program } : {}),
              ...(targetCohort ? { promotionId: targetCohort.id } : {}),
            };

            if (existing) {
              await this.prisma.student.update({
                where: { id: existing.id },
                data,
              });
              results.updated++;
              stat.updated++;
            } else {
              await this.prisma.student.create({
                data: {
                  tenantId,
                  studentId: sidCell || nextStudentId(),
                  admissionDate: new Date(),
                  dateOfBirth: null,
                  ...data,
                },
              });
              results.created++;
              stat.created++;
            }
          } catch (e) {
            results.failed++;
            stat.failed++;
            results.errors.push({
              sheet: sheetName,
              row: r + 1,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      } catch (e) {
        results.errors.push({
          sheet: sheetName,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      results.bySheet.push(stat);
    }

    results.success = results.created + results.updated;
    results.classroomsLinked = linkedSectionIds.size;
    return results;
  }

  getBulkUploadTemplate(): Buffer {
    // Mirrors the school's own class lists: one sheet per classroom, the
    // sheet name is "<grade> <section>". Names may be one column or split.
    const columns = [
      'No',
      'student_ID',
      'Last Name',
      'First Name',
      'Gender',
      'Program',
      'Comb',
    ];

    const rowsFor = (
      names: [string, string, 'M' | 'F', 'Board' | 'Day', string][],
    ) =>
      names.map(([last, first, gender, program, comb], i) => ({
        No: i + 1,
        student_ID: '',
        'Last Name': last,
        'First Name': first,
        Gender: gender,
        Program: program,
        Comb: comb,
      }));

    const workbook = XLSX.utils.book_new();

    const s1a = XLSX.utils.json_to_sheet(
      rowsFor([
        ['DOE', 'John', 'M', 'Board', ''],
        ['SMITH', 'Alice', 'F', 'Day', ''],
      ]),
      { header: columns },
    );
    XLSX.utils.book_append_sheet(workbook, s1a, 'S1A');

    const s6 = XLSX.utils.json_to_sheet(
      rowsFor([
        ['KAMANZI', 'Armand', 'M', 'Board', 'HGL'],
        ['ISHIMWE', 'Grace', 'F', 'Day', 'MCB'],
      ]),
      { header: columns },
    );
    XLSX.utils.book_append_sheet(workbook, s6, 'S6A');

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
      combination,
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
      ...(combination && {
        section: {
          is: {
            combination: {
              is: {
                OR: [
                  { id: combination },
                  { code: { equals: combination, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      }),
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
            include: {
              promotion: { select: { id: true, name: true, entryYear: true } },
              combination: { select: { id: true, code: true, name: true } },
            },
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
        section: {
          include: {
            combination: { select: { id: true, code: true, name: true } },
          },
        },
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
        schoolEntries: true,
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
        schoolEntries: true,
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
          studentUpdateData.dateOfBirth = updateStudentDto.dateOfBirth
            ? new Date(updateStudentDto.dateOfBirth)
            : null;
        if (updateStudentDto.gender !== undefined)
          studentUpdateData.gender = updateStudentDto.gender;
        if (updateStudentDto.program !== undefined)
          studentUpdateData.program = updateStudentDto.program || null;
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
      } else if (
        updateStudentDto.removePhoto === 'true' ||
        updateStudentDto.photoUrl === ''
      ) {
        // Explicit photo removal — null the column, best-effort delete the object.
        try {
          await this.supabase.client.storage
            .from('atlas-profiles')
            .remove([
              `${tenantId}/students/${id}/profile.jpg`,
              `${tenantId}/students/${id}/profile.png`,
              `${tenantId}/students/${id}/profile.webp`,
            ]);
        } catch {
          // ignore storage errors — the DB is the source of truth
        }
        await this.prisma.student.update({
          where: { id },
          data: { photoUrl: null },
        });
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
      program: student.program ?? null,
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
        code: student.grade.code,
        level: student.grade.level,
        educationLevel: student.grade.educationLevel,
      },
      section: {
        id: student.section.id,
        name: student.section.name,
      },
      combination: student.section?.combination
        ? {
            id: student.section.combination.id,
            code: student.section.combination.code,
            name: student.section.combination.name,
          }
        : null,
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
          student.schoolEntries?.length > 0
            ? Math.round(
                (student.schoolEntries.filter(
                  (a) => a.status === 'PRESENT' || a.status === 'LATE',
                ).length /
                  student.schoolEntries.length) *
                  100,
              )
            : 0,
        conductPoints: student.conductPoints?.currentPoints ?? 100,
        booksBorrowed: student.borrowedBooks?.length || 0,
      },
    };
  }

  async getStatistics(tenantId: string) {
    return this.cache.getOrSet(`students:statistics:${tenantId}`, 30, () =>
      this.computeStatistics(tenantId),
    );
  }

  private async computeStatistics(tenantId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate date 7 days ago for week-over-week comparison
    // Set to start of day 7 days ago to include all students from that day onwards
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalEnrolled,
      newAdmissionsThisMonth,
      studentsAddedThisWeek,
      maleCount,
      femaleCount,
      boardingCount,
      dayCount,
    ] = await Promise.all([
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
      // Gender breakdown — surfaced so the list header's male/female tiles
      // stay accurate once the list itself is server-paginated.
      this.prisma.student.count({ where: { tenantId, gender: Gender.MALE } }),
      this.prisma.student.count({
        where: { tenantId, gender: Gender.FEMALE },
      }),
      // Boarding / day-scholar split — surfaced on the Students list header.
      this.prisma.student.count({
        where: { tenantId, program: SchoolProgram.BOARDING },
      }),
      this.prisma.student.count({
        where: { tenantId, program: SchoolProgram.DAY },
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
      male: maleCount,
      female: femaleCount,
      boarding: boardingCount,
      day: dayCount,
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
    let user = await tx.user.findFirst({
      where: { email: parentData.email, tenantId },
      include: { parent: true },
    });

    if (!user) {
      // `User.email` is globally unique across the whole platform, not
      // per-tenant, so a match here means this email is already claimed by
      // a different school. Creating a new user would hit that unique
      // constraint anyway — but worse, silently reusing the other tenant's
      // user (the old behavior) links this student to a parent account
      // that chat and every other tenant-scoped lookup can't see, which
      // fails confusingly much later instead of here.
      const existingElsewhere = await tx.user.findUnique({
        where: { email: parentData.email },
      });
      if (existingElsewhere) {
        throw new ConflictException(
          `A parent account with email "${parentData.email}" already exists under a different school. Please use a different email or contact support.`,
        );
      }

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

      await tx.parent.upsert({
        where: { userId: user.id },
        create: {
          tenantId,
          userId: user.id,
          firstName: parentFirstName,
          lastName: parentLastName,
          relationship: parentData.relationship || null,
          occupation: parentData.occupation || null,
        },
        update: {
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

  async linkParent(
    studentId: string,
    tenantId: string,
    dto: {
      name: string;
      email: string;
      phone: string;
      relationship?: string;
      isPrimary?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: studentId, tenantId },
      });
      if (!student) throw new NotFoundException('Student not found.');

      const parent = await this.getOrCreateParent(tx, tenantId, dto);

      await tx.studentParent.upsert({
        where: { studentId_parentId: { studentId, parentId: parent.id } },
        create: {
          studentId,
          parentId: parent.id,
          isPrimary: dto.isPrimary ?? false,
        },
        update: { isPrimary: dto.isPrimary ?? false },
      });

      return this.findOne(studentId, tenantId);
    });
  }

  async unlinkParent(
    studentId: string,
    tenantId: string,
    parentUserId: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) throw new NotFoundException('Student not found.');

    const parent = await this.prisma.parent.findFirst({
      where: { userId: parentUserId, tenantId },
    });
    if (!parent) throw new NotFoundException('Parent not found.');

    const link = await this.prisma.studentParent.findUnique({
      where: { studentId_parentId: { studentId, parentId: parent.id } },
    });
    if (!link)
      throw new NotFoundException('Parent is not linked to this student.');

    const count = await this.prisma.studentParent.count({
      where: { studentId },
    });
    if (count <= 1)
      throw new BadRequestException(
        'Cannot remove the only parent linked to this student.',
      );

    await this.prisma.studentParent.delete({
      where: { studentId_parentId: { studentId, parentId: parent.id } },
    });

    return { message: 'Parent unlinked successfully.' };
  }
}
