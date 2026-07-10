import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  COURSE_NOT_FOUND: HttpStatus.NOT_FOUND,
  LESSON_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_CONTENT: HttpStatus.UNPROCESSABLE_ENTITY
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.BAD_REQUEST;
    response.status(status).json({ code: exception.code, message: exception.message });
  }
}
