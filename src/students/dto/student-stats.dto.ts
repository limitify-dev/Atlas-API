import { ApiProperty } from '@nestjs/swagger';

export class StudentStatsDto {
  @ApiProperty({
    description: 'Total number of enrolled students',
    example: 1248,
  })
  totalEnrolled: number;

  @ApiProperty({
    description: 'Number of active students',
    example: 1182,
  })
  activeStudents: number;

  @ApiProperty({
    description: 'Number of new admissions this month',
    example: 45,
  })
  newAdmissionsThisMonth: number;

  @ApiProperty({
    description: 'Number of students pending review',
    example: 23,
  })
  pendingReviews: number;

  @ApiProperty({
    description: 'Number of inactive students',
    example: 43,
  })
  inactiveStudents: number;

  @ApiProperty({
    description: 'Number of suspended students',
    example: 23,
  })
  suspendedStudents: number;

  @ApiProperty({
    description: 'Number of new admissions in the last 7 days',
    example: 12,
  })
  newAdmissionsThisWeek: number;
}
