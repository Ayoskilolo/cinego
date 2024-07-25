import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data: { status: boolean; message: string; data: T }) => {
        if (!data.status) {
          data.status = true;
        }

        if (!data.message) {
          data.message = 'Action Completed';
        }

        if (!data.data) {
          data.data = null;
        }

        return { status: data.status, message: data.message, data: data.data };
      }),
    );
  }
}
