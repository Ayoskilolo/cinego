/**
 * Wrap a controller return value in this class to explicitly control
 * the response envelope produced by ResponseInterceptor.
 *
 * Usage:
 *   return new StructuredResponse({ message: 'Created', data: result });
 *   return new StructuredResponse({ data: result });
 *   return new StructuredResponse({ message: 'Done' });
 */
export class StructuredResponse {
  status?: boolean;
  message?: string;
  data?: any;

  constructor(partial: { status?: boolean; message?: string; data?: any }) {
    this.status = partial.status;
    this.message = partial.message;
    this.data = partial.data;
  }
}
