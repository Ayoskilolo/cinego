import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv } from 'crypto';
import { UAParser } from 'ua-parser-js';

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

  async decodeUserAgent(userAgent: string) {
    const result = UAParser(userAgent);
    const { browser, device, engine, os } = result;
    const browserName = browser.name;
    const browserVersion = browser.version;
    const deviceType = device.type;
    const deviceVendor = device.vendor;
    const deviceModel = device.model;
    return result;
  }

  getSimpleDeviceInfo(userAgent: string) {
    const result = UAParser(userAgent);
    const { browser, device, os } = result;

    // Determine if it's a mobile browser or native app
    const isMobileBrowser =
      (device.type === 'mobile' || device.type === 'tablet') &&
      // Standard mobile browsers
      ((browser.name &&
        ['Chrome', 'Safari', 'Firefox', 'Edge', 'Opera'].includes(
          browser.name,
        )) ||
        // Mobile Safari (shows as "Mobile Safari" or has Safari indicators)
        (browser.name && browser.name.toLowerCase().includes('safari')) ||
        // Chrome Mobile
        (browser.name && browser.name.toLowerCase().includes('chrome')) ||
        // Check UA string for browser indicators
        (userAgent.includes('Safari/') && userAgent.includes('Version/')) ||
        (userAgent.includes('Chrome/') && userAgent.includes('Safari/')) ||
        userAgent.includes('Firefox/') ||
        userAgent.includes('Edge/')) &&
      // Exclude native apps that might have browser engines but aren't browsers
      !userAgent.includes('FBAN/') && // Facebook app
      !userAgent.includes('FBAV/') && // Facebook app
      !userAgent.includes('Instagram') &&
      !userAgent.includes('WhatsApp') &&
      !userAgent.includes('Dalvik/') && // Android native
      !userAgent.includes('CFNetwork/'); // iOS native

    // Get device name
    let deviceName = '';
    if (device.vendor && device.model) {
      deviceName = `${device.vendor} ${device.model}`;
    } else if (device.vendor) {
      deviceName = device.vendor;
    } else if (device.model) {
      deviceName = device.model;
    } else if (device.type === 'mobile') {
      deviceName = 'Mobile Device';
    } else if (device.type === 'tablet') {
      deviceName = 'Tablet';
    } else {
      // Fallback to OS-based detection
      const osName = (os.name || '').toLowerCase();
      if (osName.includes('android')) {
        deviceName = 'Android Device';
      } else if (osName.includes('ios') || osName.includes('iphone')) {
        deviceName = 'iPhone';
      } else if (osName.includes('ipad')) {
        deviceName = 'iPad';
      } else {
        deviceName = 'Desktop';
      }
    }

    // Return format based on type
    if (device.type === 'mobile' || device.type === 'tablet') {
      if (isMobileBrowser) {
        return `Browser: ${deviceName}`;
      } else {
        return `Mobile: ${deviceName}`;
      }
    }

    // For desktop - include browser info since it's always from browser
    const browserName = browser.name || 'Unknown Browser';
    const browserVersion = browser.version ? ` ${browser.version}` : '';
    const osName = os.name || 'Unknown OS';

    return `Desktop: ${browserName}${browserVersion} on ${osName}`;
  }
}
