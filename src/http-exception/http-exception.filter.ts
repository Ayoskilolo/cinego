import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    let status: number;

    try {
      if (exception.getStatus()) {
        status = exception.getStatus();
      }
    } catch (error) {
      status = 400;
    }

    let errorResponse;
    let message: string | string[];

    try {
      errorResponse = exception.getResponse();
      message = errorResponse['message'];
    } catch (error) {
      message = exception.message;
    }

    response.status(status).json({ status: false, message, data: null });
  }
}
