import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  private swaggerDocument: any;
  getHello(): string {
    return 'Hello World!';
  }

  setSwaggerDocument(doc: any) {
    this.swaggerDocument = doc;
  }

  getSwaggerDocument() {
    return this.swaggerDocument;
  }
}
