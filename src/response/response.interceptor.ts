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
      map((responseData) => {
        // Check if the responseData itself is intended to be the structured response
        if (
          responseData &&
          typeof responseData === 'object' &&
          (responseData.hasOwnProperty('data') ||
           responseData.hasOwnProperty('message') ||
           responseData.hasOwnProperty('status'))
        ) {
          // It looks like the controller already returned the desired structure (or part of it)
          return {
            status: responseData.status === false ? false : true, // Default to true unless explicitly false
            message: responseData.message || 'Action Completed',
            data: responseData.hasOwnProperty('data') ? responseData.data : null, // Use existing data if present, else null
          };
        } else {
          // Treat the entire responseData as the 'data' payload
          return {
            status: true,
            message: 'Action Completed',
            data: responseData, // Use the original response as data
          };
        }
      }),
    );
  }
}
