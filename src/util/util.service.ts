import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv } from 'crypto';

@Injectable()
export class UtilService {
  constructor(private readonly configService: ConfigService) {}

  async encrypt(textToEncrypt: string) {
    const iv = this.configService.get<string>('app.encryption.iv');
    const key = this.configService.get<string>('app.encryption.key');
    const cipher = createCipheriv('aes-256-ctr', key, iv);
    return cipher.update(textToEncrypt, 'utf-8', 'hex') + cipher.final('hex');
  }

  async decrypt(encryptedText: string) {
    const iv = this.configService.get<string>('app.encryption.iv');
    const key = this.configService.get<string>('app.encryption.key');
    const decipher = createDecipheriv('aes-256-ctr', key, iv);

    return (
      decipher.update(encryptedText, 'hex', 'utf-8') + decipher.final('hex')
    );
  }
}
