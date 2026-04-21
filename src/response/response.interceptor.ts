import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { StructuredResponse } from './structured-response';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((responseData) => {
        if (responseData instanceof StructuredResponse) {
          return {
            status: responseData.status === false ? false : true,
            message: responseData.message || 'Action Completed',
            data: responseData.data ?? null,
          };
        }

        return {
          status: true,
          message: 'Action Completed',
          data: responseData,
        };
      }),
    );
  }
}
