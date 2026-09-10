import { Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx-js-style';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  EducationLevel,
} from '../../prisma/generated/client';

type Cell = string | number | null;
type Aoa = Cell[][];

/** Everything needed to render one sheet as xlsx *or* as a JSON preview. */
interface SheetSpec {
  name: string;
  aoa: Aoa;
  roles: string[];
  merges: string[];
  cols: number[];
  pctCol: number;
}

export interface PreviewSheet {
  name: string;
  rows: (string | number)[][];
  roles: string[];
  merges: string[];
}

export interface PreviewModel {
  sheets: PreviewSheet[];
}

const PRESENT: AttendanceStatus[] = ['PRESENT', 'LATE'];

/* ─── Styling ──────────────────────────────────────────────────────────────
   Colours are Excel's "lighter 80% / 60%" of the standard Office theme
   accents, matching the fills used in the source templates. */
const CLR = {
  blue80: 'DDEBF7',
  blueMid: '9DC3E6',
  orange80: 'FCE4D6',
  green80: 'E2EFDA',
  grey: 'E7E6E6',
};
const THIN = { style: 'thin', color: { rgb: '000000' } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };

type Style = Record<string, unknown>;
const ST: Record<string, Style> = {
  title: {
    font: { bold: true, sz: 16 },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  subtitle: {
    font: { bold: true, sz: 12 },
    alignment: { horizontal: 'center' },
  },
  bold: { font: { bold: true } },
  groupHdr: {
    font: { bold: true, sz: 12 },
    fill: { patternType: 'solid', fgColor: { rgb: CLR.blueMid } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BOX,
  },
  colHdr: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: CLR.blue80 } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BOX,
  },
  data: { border: BOX, alignment: { horizontal: 'center' } },
  dataL: { border: BOX, alignment: { horizontal: 'left' } },
  subtotal: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: CLR.orange80 } },
    border: BOX,
  },
  grand: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: CLR.green80 } },
    border: BOX,
  },
};

/**
 * Paint one style per row across the used range. `roles[r]` is looked up in
 * `ST`; the empty string / undefined leaves the row unstyled. Data rows get a
 * left-aligned first column. The `pctCol` column is shown to one decimal.
 */
function paint(ws: XLSX.WorkSheet, roles: string[], pctCol: number): void {
  const range = XLSX.utils.decode_range(ws['!ref'] as string);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const role = roles[r];
    if (!role) continue;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws[addr] ??
        (ws[addr] = { t: 's', v: '' })) as XLSX.CellObject & {
        s?: unknown;
        z?: string;
      };
      cell.s =
        role === 'data' ? (c === 0 ? ST.dataL : ST.data) : (ST[role] ?? {});
      if (c === pctCol && typeof cell.v === 'number') cell.z = '0.0';
    }
  }
}

interface SectionAgg {
  className: string;
  gradeName: string;
  gradeLevel: number;
  educationLevel: EducationLevel;
  regBoys: number;
  regGirls: number;
  repBoys: number;
  repGirls: number;
}

interface Totals {
  regBoys: number;
  regGirls: number;
  repBoys: number;
  repGirls: number;
}

function emptyTotals(): Totals {
  return { regBoys: 0, regGirls: 0, repBoys: 0, repGirls: 0 };
}

function addInto(t: Totals, a: SectionAgg | Totals) {
  t.regBoys += a.regBoys;
  t.regGirls += a.regGirls;
  t.repBoys += a.repBoys;
  t.repGirls += a.repGirls;
}

const pct = (rep: number, exp: number) =>
  exp > 0 ? Math.round((rep / exp) * 1000) / 10 : 0;

function ddmmyyyy(dateKey: string): string {
  const [y, m, d] = dateKey.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Excel attendance returns matching the Rwanda school- and district-level
 * templates (same layout, fills and borders). Both are single-day snapshots:
 * "reported" = a student has an on-campus SchoolEntry (PRESENT or LATE) that
 * day. In-class attendance is not part of these returns.
 *
 * The school report lists every classroom. The district return carries this
 * school's row on one sheet per education-level category plus a district
 * summary — the district officer stacks these from every school.
 */
@Injectable()
export class AttendanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async gather(tenantId: string, dateKey: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        city: true,
        state: true,
        country: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const day = new Date(`${dateKey.slice(0, 10)}T00:00:00.000Z`);

    const sections = await this.prisma.section.findMany({
      where: { tenantId, isActive: true },
      select: {
        name: true,
        grade: {
          select: {
            name: true,
            code: true,
            level: true,
            educationLevel: true,
          },
        },
        students: { select: { id: true, gender: true } },
      },
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    });

    const studentIds = sections.flatMap((s) => s.students.map((st) => st.id));

    // "Reported" = the student is on campus that day — a SchoolEntry check-in
    // (PRESENT or LATE). In-class registers are NOT counted here.
    const campus = studentIds.length
      ? await this.prisma.schoolEntry.findMany({
          where: {
            tenantId,
            date: day,
            studentId: { in: studentIds },
            status: { in: PRESENT },
          },
          select: { studentId: true },
        })
      : [];
    const presentSet = new Set(campus.map((p) => p.studentId));

    const rows: SectionAgg[] = sections.map((s) => {
      let regBoys = 0;
      let regGirls = 0;
      let repBoys = 0;
      let repGirls = 0;
      for (const st of s.students) {
        const boy = st.gender === 'MALE';
        const girl = st.gender === 'FEMALE';
        if (boy) regBoys += 1;
        else if (girl) regGirls += 1;
        if (presentSet.has(st.id)) {
          if (boy) repBoys += 1;
          else if (girl) repGirls += 1;
        }
      }
      const code = s.grade.code || s.grade.name;
      return {
        className: /\d/.test(code) ? `${code}${s.name}` : `${code} ${s.name}`,
        gradeName: s.grade.name,
        gradeLevel: s.grade.level,
        educationLevel: s.grade.educationLevel,
        regBoys,
        regGirls,
        repBoys,
        repGirls,
      };
    });

    return { tenant, rows };
  }
  // ── Sheet specs (shared by xlsx + JSON preview) ────────────────────────

  private schoolSpec(
    tenant: { name: string },
    rows: SectionAgg[],
    dateKey: string,
  ): SheetSpec {
    const aoa: Aoa = [
      [`STUDENT ATTENDANCE ON ${ddmmyyyy(dateKey)}`],
      [tenant.name],
      ['REGISTERED', '', '', '', '', 'REPORTED', '', '', '', '', 'Total'],
      [
        'CLASS',
        'BOYS',
        'GIRLS',
        'EXPECTED',
        'TOTAL',
        'BOYS',
        'GIRLS',
        'TOTAL',
        '%',
        'Sub total',
        'Total',
      ],
    ];
    const roles = ['title', 'subtitle', 'groupHdr', 'colHdr'];

    const sectionRow = (r: SectionAgg): Cell[] => {
      const exp = r.regBoys + r.regGirls;
      const rep = r.repBoys + r.repGirls;
      return [
        r.className,
        r.regBoys,
        r.regGirls,
        exp,
        exp,
        r.repBoys,
        r.repGirls,
        rep,
        pct(rep, exp),
        '',
        '',
      ];
    };

    const grand = emptyTotals();
    let i = 0;
    while (i < rows.length) {
      const level = rows[i].gradeLevel;
      const block = emptyTotals();
      const label = rows[i].gradeName;
      while (i < rows.length && rows[i].gradeLevel === level) {
        aoa.push(sectionRow(rows[i]));
        roles.push('data');
        addInto(block, rows[i]);
        addInto(grand, rows[i]);
        i += 1;
      }
      const bExp = block.regBoys + block.regGirls;
      const bRep = block.repBoys + block.repGirls;
      aoa.push([
        `${label} — subtotal`,
        block.regBoys,
        block.regGirls,
        bExp,
        bExp,
        block.repBoys,
        block.repGirls,
        bRep,
        pct(bRep, bExp),
        bRep,
        bExp,
      ]);
      roles.push('subtotal');
    }

    const gExp = grand.regBoys + grand.regGirls;
    const gRep = grand.repBoys + grand.repGirls;
    aoa.push([
      'GRAND TOTAL',
      grand.regBoys,
      grand.regGirls,
      gExp,
      gExp,
      grand.repBoys,
      grand.repGirls,
      gRep,
      pct(gRep, gExp),
      gRep,
      gExp,
    ]);
    roles.push('grand');

    return {
      name: ddmmyyyy(dateKey).replace(/\//g, '-'),
      aoa,
      roles,
      merges: ['A1:K1', 'A2:K2', 'A3:E3', 'F3:J3', 'K3:K4'],
      cols: [18, 7, 7, 10, 8, 7, 7, 8, 8, 10, 8],
      pctCol: 8,
    };
  }

  private districtSpecs(
    tenant: {
      name: string;
      city: string | null;
      state: string | null;
      country: string | null;
    },
    rows: SectionAgg[],
    dateKey: string,
    opts: { secondary?: 'day' | 'boarding' },
  ): SheetSpec[] {
    const sector = tenant.city || tenant.state || '';
    const secondaryLabel =
      opts.secondary === 'boarding'
        ? 'SECONDARY - BOARDING'
        : 'SECONDARY - DAY';

    const categoryOf = (e: EducationLevel): string => {
      if (e === 'NURSERY') return 'NURSERY';
      if (e === 'PRIMARY') return 'PRIMARY';
      return secondaryLabel;
    };

    const byCat = new Map<string, Totals>();
    for (const r of rows) {
      const key = categoryOf(r.educationLevel);
      const t = byCat.get(key) ?? emptyTotals();
      addInto(t, r);
      byCat.set(key, t);
    }

    const prettyDate = ddmmyyyy(dateKey);
    const specs: SheetSpec[] = [];

    const catSpec = (label: string, t: Totals): SheetSpec => {
      const eG = t.regGirls;
      const eB = t.regBoys;
      const eT = eG + eB;
      const rG = t.repGirls;
      const rB = t.repBoys;
      const rT = rG + rB;
      return {
        name: label.slice(0, 31),
        aoa: [
          [tenant.country || 'REPUBLIC OF RWANDA'],
          [sector ? sector.toUpperCase() : ''],
          [],
          [`${label} STUDENTS ATTENDANCE BY ${prettyDate}`],
          [],
          [
            'Sector',
            'SCHOOL',
            'EXPECTED NUMBER OF STUDENTS',
            '',
            '',
            'REPORTED STUDENTS',
            '',
            '',
            '%',
            'NOT YET REPORTED',
          ],
          ['', '', 'Girls', 'Boys', 'Total', 'GIRLS', 'BOYS', 'Total', '', ''],
          [sector, tenant.name, eG, eB, eT, rG, rB, rT, pct(rT, eT), eT - rT],
          ['', 'TOTAL', eG, eB, eT, rG, rB, rT, pct(rT, eT), eT - rT],
        ],
        roles: [
          'bold',
          'bold',
          '',
          'title',
          '',
          'groupHdr',
          'colHdr',
          'data',
          'grand',
        ],
        merges: ['A4:J4', 'C6:E6', 'F6:H6', 'A6:A7', 'B6:B7', 'I6:I7', 'J6:J7'],
        cols: [16, 30, 8, 8, 8, 8, 8, 8, 8, 16],
        pctCol: 8,
      };
    };

    // Always emit every category sheet — a level with no students gets a zero
    // row (the district officer expects the sheet to be present).
    const order = [
      'NURSERY',
      'PRIMARY',
      'SECONDARY - DAY',
      'SECONDARY - BOARDING',
    ];
    for (const label of order) {
      specs.push(catSpec(label, byCat.get(label) ?? emptyTotals()));
    }

    const summary: Aoa = [
      [`DISTRICT - SUMMARY STATUS OF STUDENT ATTENDANCE ${prettyDate}`],
      [tenant.name],
      [],
      [
        'SN',
        'CATEGORY',
        'EXPECTED',
        '',
        '',
        'ATTENDED',
        '',
        '',
        '% OF ATTENDANCE',
        'NOT YET REPORTED',
      ],
      ['', '', 'Girls', 'Boys', 'TOTAL', 'Girls', 'Boys', 'TOTAL', '', ''],
    ];
    const sRoles = ['title', 'subtitle', '', 'groupHdr', 'colHdr'];
    const grand = emptyTotals();
    let sn = 1;
    for (const label of order) {
      const t = byCat.get(label) ?? emptyTotals();
      addInto(grand, t);
      const eT = t.regGirls + t.regBoys;
      const rT = t.repGirls + t.repBoys;
      summary.push([
        sn++,
        label,
        t.regGirls,
        t.regBoys,
        eT,
        t.repGirls,
        t.repBoys,
        rT,
        pct(rT, eT),
        eT - rT,
      ]);
      sRoles.push('data');
    }
    const gE = grand.regGirls + grand.regBoys;
    const gR = grand.repGirls + grand.repBoys;
    summary.push([
      '',
      'TOTAL',
      grand.regGirls,
      grand.regBoys,
      gE,
      grand.repGirls,
      grand.repBoys,
      gR,
      pct(gR, gE),
      gE - gR,
    ]);
    sRoles.push('grand');

    specs.push({
      name: 'DISTRICT SUMMARY',
      aoa: summary,
      roles: sRoles,
      merges: [
        'A1:J1',
        'A2:J2',
        'C4:E4',
        'F4:H4',
        'A4:A5',
        'B4:B5',
        'I4:I5',
        'J4:J5',
      ],
      cols: [5, 24, 8, 8, 8, 8, 8, 8, 16, 16],
      pctCol: 8,
    });

    return specs;
  }

  private specToSheet(spec: SheetSpec): XLSX.WorkSheet {
    const ws = XLSX.utils.aoa_to_sheet(spec.aoa);
    ws['!cols'] = spec.cols.map((wch) => ({ wch }));
    ws['!merges'] = spec.merges.map((m) => XLSX.utils.decode_range(m));
    paint(ws, spec.roles, spec.pctCol);
    return ws;
  }

  private specToModel(spec: SheetSpec): PreviewSheet {
    return {
      name: spec.name,
      rows: spec.aoa.map((r) => r.map((c) => c ?? '')),
      roles: spec.roles,
      merges: spec.merges,
    };
  }

  // ── School-level report ─────────────────────────────────────────────────

  async buildSchoolReport(tenantId: string, dateKey: string): Promise<Buffer> {
    const { tenant, rows } = await this.gather(tenantId, dateKey);
    const spec = this.schoolSpec(tenant, rows, dateKey);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, this.specToSheet(spec), spec.name);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async getSchoolReportModel(
    tenantId: string,
    dateKey: string,
  ): Promise<PreviewModel> {
    const { tenant, rows } = await this.gather(tenantId, dateKey);
    return {
      sheets: [this.specToModel(this.schoolSpec(tenant, rows, dateKey))],
    };
  }

  // ── District-level return ───────────────────────────────────────────────

  async buildDistrictReport(
    tenantId: string,
    dateKey: string,
    opts: { secondary?: 'day' | 'boarding' } = {},
  ): Promise<Buffer> {
    const { tenant, rows } = await this.gather(tenantId, dateKey);
    const wb = XLSX.utils.book_new();
    for (const spec of this.districtSpecs(tenant, rows, dateKey, opts)) {
      XLSX.utils.book_append_sheet(wb, this.specToSheet(spec), spec.name);
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async getDistrictReportModel(
    tenantId: string,
    dateKey: string,
    opts: { secondary?: 'day' | 'boarding' } = {},
  ): Promise<PreviewModel> {
    const { tenant, rows } = await this.gather(tenantId, dateKey);
    return {
      sheets: this.districtSpecs(tenant, rows, dateKey, opts).map((s) =>
        this.specToModel(s),
      ),
    };
  }
}
