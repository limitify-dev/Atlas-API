import { IsString, IsNotEmpty, IsOptional, IsInt, IsNumber, Min, IsEnum } from 'class-validator';
import { BookStatus } from '../../../../prisma/generated/client';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  author: string;

  @IsString()
  @IsNotEmpty()
  isbn: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsInt()
  @IsOptional()
  publicationYear?: number;

  @IsString()
  @IsNotEmpty()
  category: string;
  
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  numberOfCopies?: number;
}

export class GenerateCopiesDto {
    @IsString()
    @IsNotEmpty()
    tenantId: string;

    @IsInt()
    @Min(1)
    count: number;
}

export class CreateBookCopyDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  bookId: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  shelf?: string;

  @IsEnum(BookStatus)
  @IsOptional()
  status?: BookStatus;
}

export class UpdateBookDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsOptional()
  isbn?: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsInt()
  @IsOptional()
  publicationYear?: number;

  @IsString()
  @IsOptional()
  category?: string;
  
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(BookStatus)
  @IsOptional()
  status?: BookStatus;
}
