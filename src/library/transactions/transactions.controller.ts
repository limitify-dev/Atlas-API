import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { BookTransactionsService } from './transactions.service';
import {
  IssueBookDto,
  ReturnBookDto,
  IssueBulkDto,
} from './dto/transaction.dto';

@Controller('library/transactions')
export class BookTransactionsController {
  constructor(private readonly transactionsService: BookTransactionsService) {}

  @Post('issue')
  issue(@Body() issueDto: IssueBookDto) {
    return this.transactionsService.issue(issueDto);
  }

  @Post('issue-bulk')
  issueBulk(@Body() issueBulkDto: IssueBulkDto) {
    return this.transactionsService.issueBulk(issueBulkDto);
  }

  @Post('return')
  returnBook(@Body() returnDto: ReturnBookDto) {
    return this.transactionsService.return(returnDto);
  }

  @Post('return-bulk')
  returnBulk(
    @Body() dto: { tenantId: string; copyCodes: string[]; returnDate?: string },
  ) {
    return this.transactionsService.returnBulk(dto);
  }

  @Post(':id/missing')
  reportMissing(@Param('id') id: string, @Body('tenantId') tenantId: string) {
    return this.transactionsService.reportMissing(tenantId, id);
  }

  @Get('overdue')
  getOverdue(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.transactionsService.getOverdue({
      tenantId,
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 10,
    });
  }

  @Get('active')
  getActiveLoans(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('grouped') grouped?: string,
    @Query('sectionId') sectionId?: string,
    @Query('studentId') studentId?: string,
    @Query('bookId') bookId?: string,
    @Query('excludeOverdue') excludeOverdue?: string,
    @Query('search') search?: string,
  ) {
    const filters = {
      sectionId,
      studentId,
      bookId,
      excludeOverdue: excludeOverdue === 'true',
      search,
    };
    if (grouped === 'true') {
      return this.transactionsService.getActiveLoansGrouped({
        tenantId,
        page: page ? +page : 1,
        pageSize: pageSize ? +pageSize : 10,
        ...filters,
      });
    }
    return this.transactionsService.getActiveLoans({
      tenantId,
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 10,
      ...filters,
    });
  }

  @Get('history')
  getHistory(
    @Query('tenantId') tenantId: string,
    @Query('studentId') studentId: string,
  ) {
    return this.transactionsService.getStudentHistory(tenantId, studentId);
  }

  @Get('stats')
  getStats(@Query('tenantId') tenantId: string) {
    return this.transactionsService.getStats(tenantId);
  }
}
