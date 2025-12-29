import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SystemLogsService } from '../../system-logs/system-logs.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly systemLogsService: SystemLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const userId = request.user?.userId;
    const tenantId = request.user?.tenantId;
    
    const startTime = Date.now();

    return next.handle().pipe(
      tap((data) => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        const duration = Date.now() - startTime;

        // Log successful requests (only log errors and important endpoints)
        if (statusCode >= 400 || this.shouldLog(url)) {
          this.systemLogsService
            .createLog({
              level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
              message: `${method} ${url} - ${statusCode}`,
              metadata: {
                request: {
                  method,
                  url,
                  body: this.sanitizeBody(request.body),
                  query: request.query,
                },
                response: {
                  statusCode,
                },
              },
              userId,
              tenantId,
              ipAddress: ip,
              userAgent,
              endpoint: url,
              method,
              statusCode,
              duration,
            })
            .catch((err) => {
              this.logger.error('Failed to create log entry', err);
            });
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || 500;

        // Log errors
        this.systemLogsService
          .createLog({
            level: 'ERROR',
            message: `${method} ${url} - ${statusCode}: ${error.message}`,
            metadata: {
              request: {
                method,
                url,
                body: this.sanitizeBody(request.body),
                query: request.query,
              },
              error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
              },
            },
            userId,
            tenantId,
            ipAddress: ip,
            userAgent,
            endpoint: url,
            method,
            statusCode,
            duration,
          })
          .catch((err) => {
            this.logger.error('Failed to create error log entry', err);
          });

        throw error;
      }),
    );
  }

  /**
   * Determine if this endpoint should be logged
   */
  private shouldLog(url: string): boolean {
    // Log important endpoints
    const importantPatterns = [
      '/auth/',
      '/users/',
      '/tenants/',
      '/devices/',
      '/system-logs/',
    ];

    return importantPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Remove sensitive data from request body
   */
  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'apiKey', 'token', 'secret'];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
