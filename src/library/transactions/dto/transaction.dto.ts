import { IsString, IsNotEmpty, IsOptional, IsDateString, IsNumber, Min, IsInt } from 'class-validator';

export class IssueBulkDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  sectionId?: string;

  @IsString()
  @IsNotEmpty()
  bookId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class IssueBookDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  sectionId?: string;

  @IsString()
  @IsNotEmpty()
  bookCopyCode: string;

  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ReturnBookDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  bookCopyCode: string;

  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  fine?: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}
