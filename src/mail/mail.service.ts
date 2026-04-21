import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailTemplateData,
  MovieRecommendationData,
  OTPTemplateData,
} from './interfaces';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly oneSignalApiUrl =
    this.configService.get('ONESIGNAL_BASE_URL');

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}
  private async _sendMail({
    recipients,
    subject,
    htmlBody,
  }: {
    recipients: string[];
    subject: string;
    htmlBody: string;
  }): Promise<boolean> {
    const appId = this.configService.get<string>('ONESIGNAL_APP_ID');
    const apiKey = this.configService.get<string>('ONESIGNAL_API_KEY');

    if (!appId || !apiKey) {
      this.logger.error('OneSignal App ID or API Key not configured.');
      throw new InternalServerErrorException('Email configuration error.');
    }

    const payload = {
      app_id: appId,
      include_email_tokens: recipients,
      email_subject: subject,
      email_body: htmlBody,
      include_unsubscribed: true,
      email_from_name: 'Cinego',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.oneSignalApiUrl}/notifications?c=email`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              Authorization: `Key ${apiKey}`,
            },
          },
        ),
      );
      this.logger.log(
        `OneSignal email sent response: ${JSON.stringify(response.data)}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email via OneSignal: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`,
      );
      return false;
    }
  }

  async sendOTPMail(
    recipientEmail: string,
    otp: string,
    expiryMinutes: number,
    details: {
      title: string;
      messages: string[];
      ctaText?: string;
      ctaLink?: string;
      footerCopyright?: string;
    },
  ): Promise<boolean> {
    const templateData: OTPTemplateData = {
      title: details.title,
      messages: details.messages,
      otpCode: otp,
      expiryTime: `${expiryMinutes} minutes`,
      ctaText: details.ctaText,
      ctaLink: details.ctaLink,
      footerCopyright: details.footerCopyright,
    };

    try {
      const mailHtmlBody = await this._generateOTPTemplate(templateData);
      return await this._sendMail({
        recipients: [recipientEmail],
        subject: details.title,
        htmlBody: mailHtmlBody,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate or send OTP email: ${error.message}`,
      );
      return false;
    }
  }

  async sendGeneralTemplatedMail({
    recipients,
    subject,
    templateData,
  }: {
    recipients: string[];
    subject: string;
    templateData: EmailTemplateData;
  }): Promise<boolean> {
    try {
      const mailHtmlBody = await this._generateEmailTemplate(templateData);
      return await this._sendMail({
        recipients,
        subject,
        htmlBody: mailHtmlBody,
      });
    } catch (error) {
      this.logger.error(
        `Failed to generate or send general templated email: ${error.message}`,
      );
      return false;
    }
  }

  private async _generateEmailTemplate(data: EmailTemplateData) {
    // Generate HTML for all message paragraphs
    const messageHtml = data.messages
      .map(
        (message) => `
    <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 24px; color: #ffffff;">
      ${message}
    </p>
  `,
      )
      .join('');

    const currentYear = new Date().getFullYear();
    const footerText =
      data.footerText || `© ${currentYear} Cinego. All rights reserved.`;

    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cinego</title>
  <style type="text/css">
    body, p, td, th {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
    }
    body {
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: none;
      -ms-text-size-adjust: none;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .content-block {
        padding: 20px !important;
      }
      .cta-button {
        display: block !important;
        width: 80% !important;
        margin: 0 auto !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5;">
  <center>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5">
      <tr>
        <td align="center">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;" class="email-container">
            <!-- Header -->
            <tr>
              <td align="center" bgcolor="#333333" style="padding: 30px 0;">
                <h1 style="margin: 0; font-size: 36px; font-weight: bold; color: #fbbe25; letter-spacing: 1px;">
                  CINEGO
                </h1>
              </td>
            </tr>

            <!-- Main Content -->
            <tr>
              <td bgcolor="#333333" style="padding: 40px 30px;" class="content-block">
                <h2 style="margin: 0 0 20px 0; font-size: 28px; line-height: 36px; color: #fbbe25; font-weight: bold; text-align: center;">
                  ${data.title}
                </h2>

               ${messageHtml}

                <!-- CTA Button -->
                <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 40px auto 40px auto;">
                  <tr>
                    <td align="center" bgcolor="#FBBE25" style="border-radius: 12px; padding: 16px 30px;">
                      <a
                        href="${data.ctaLink}"
                        target="_blank"
                        style="font-size: 18px; font-weight: bold; color: #333333; text-decoration: none; text-transform: uppercase; display: inline-block;"
                        class="cta-button"
                      >
                        ${data.ctaText}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin: 0; font-size: 16px; line-height: 24px; color: #ffffff; text-align: center;">
                  If you have any questions, please don't hesitate to contact our customer service team.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td bgcolor="#222222" style="padding: 30px 30px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="color: #ffffff; font-size: 14px; line-height: 20px; text-align: center;">
                      <p style="margin: 0 0 10px 0;">
                        ${footerText}
                      </p>
                      <p style="margin: 0 0 10px 0;">
                        ${data.address || ''}
                      </p>
                      <p style="margin: 0;">
                        <a href="#" style="color: #fbbe25; text-decoration: underline; margin: 0 5px;">Unsubscribe</a>
                        |
                        <a href="#" style="color: #fbbe25; text-decoration: underline; margin: 0 5px;">Contact Us</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
  `;
  }

  async sendMovieRecommendationMail(
    recipientEmail: string,
    data: MovieRecommendationData,
  ): Promise<boolean> {
    try {
      const htmlBody =
        await this._generateMovieRecommendationTemplate(data);
      const safeName = data.recipientName.replace(/[\r\n\t]/g, '');
      return await this._sendMail({
        recipients: [recipientEmail],
        subject: `${safeName}, here are your personalized picks!`,
        htmlBody,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send movie recommendation email: ${error.message}`,
      );
      return false;
    }
  }

  private async _generateMovieRecommendationTemplate(
    data: MovieRecommendationData,
  ): Promise<string> {
    const currentYear = new Date().getFullYear();

    const safeName = this.escapeHtml(data.recipientName);

    const movieCardsHtml = data.movies
      .map((movie) => {
        const safeTitle = this.escapeHtml(movie.title);
        const safeSynopsis = this.escapeHtml(
          movie.synopsis.length > 120
            ? movie.synopsis.substring(0, 120) + '...'
            : movie.synopsis,
        );
        const safeGenres = movie.genres
          .slice(0, 3)
          .map((g) => this.escapeHtml(g))
          .join(' &bull; ');
        const safeYear = this.escapeHtml(movie.productionYear);
        const safeDuration = this.escapeHtml(movie.duration);
        const safeRating = this.escapeHtml(movie.marketRating);
        const safePosterUrl = this.escapeHtml(movie.posterUrl || '');

        return `
            <tr>
              <td style="padding: 0 0 20px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #444444; border-radius: 8px; overflow: hidden;">
                  <tr>
                    <td style="width: 140px; vertical-align: top;">
                      <img
                        src="${safePosterUrl}"
                        alt="${safeTitle}"
                        width="140"
                        style="display: block; width: 140px; height: 200px; object-fit: cover; border-radius: 8px 0 0 8px;"
                      />
                    </td>
                    <td style="vertical-align: top; padding: 15px;">
                      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #FBBE25; font-weight: bold;">
                        ${safeTitle}
                      </h3>
                      <p style="margin: 0 0 6px 0; font-size: 13px; color: #cccccc;">
                        ${safeGenres} &bull; ${safeYear} &bull; ${safeDuration}
                      </p>
                      <p style="margin: 0 0 8px 0; font-size: 13px; color: #cccccc;">
                        Rating: <strong style="color: #FBBE25;">${safeRating}</strong>
                      </p>
                      <p style="margin: 0; font-size: 13px; line-height: 18px; color: #dddddd;">
                        ${safeSynopsis}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
      })
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cinego - Your Personalized Picks</title>
  <style type="text/css">
    body, p, td, th { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    body { background-color: #f5f5f5; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-block { padding: 20px !important; }
      .movie-poster { width: 100px !important; height: 150px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
  <center>
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;" class="email-container">
      <!-- Header -->
      <tr>
        <td align="center" bgcolor="#333333" style="padding:30px 0;">
          <h1 style="margin:0;font-size:36px;font-weight:bold;color:#FBBE25;letter-spacing:1px;">CINEGO</h1>
        </td>
      </tr>

      <!-- Main Content -->
      <tr>
        <td bgcolor="#333333" style="padding:40px 30px;" class="content-block">
          <h2 style="margin:0 0 10px 0;font-size:24px;line-height:32px;color:#FBBE25;font-weight:bold;text-align:center;">
            Hey ${safeName}, we picked these for you!
          </h2>
          <p style="margin:0 0 30px 0;font-size:15px;line-height:22px;color:#ffffff;text-align:center;">
            Based on your viewing history and preferences, we think you'll love these titles.
          </p>

          <!-- Movie Cards -->
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            ${movieCardsHtml}
          </table>

          <!-- CTA Button -->
          <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 30px auto;">
            <tr>
              <td align="center" bgcolor="#FBBE25" style="border-radius: 12px; padding: 16px 30px;">
                <a
                  href="https://cinego.com"
                  target="_blank"
                  style="font-size: 16px; font-weight: bold; color: #333333; text-decoration: none; text-transform: uppercase; display: inline-block;"
                >
                  Start Watching Now
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td bgcolor="#222222" style="padding:25px 30px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="color:#FFFFFF;font-size:12px;line-height:18px;text-align:center;">
                <p style="margin:0 0 5px 0;">&copy; ${currentYear} Cinego. All rights reserved.</p>
                <p style="margin:0 0 10px 0;">You're receiving this because you have a Cinego account.</p>
                <p style="margin:0;">
                  <a href="#" style="color: #fbbe25; text-decoration: underline; margin: 0 5px;">Unsubscribe</a>
                  |
                  <a href="#" style="color: #fbbe25; text-decoration: underline; margin: 0 5px;">Contact Us</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
    `;
  }

  // Kept the updated template generation logic
  private async _generateOTPTemplate(data: OTPTemplateData) {
    // Generate HTML for all message paragraphs
    const messageHtml = data.messages
      .map(
        (msg) => `
    <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #ffffff; text-align: center;">
      ${msg}
    </p>
  `,
      )
      .join('');

    // Optional CTA button section -- only include if ctaLink is provided
    const ctaButton =
      data.ctaLink && data.ctaText
        ? `
    <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 30px auto; max-width: 240px;">
      <tr>
        <td align="center" bgcolor="#FBBE25" style="border-radius: 8px;">
          <a href="${data.ctaLink}" target="_blank" style="display: block; font-size: 16px; font-weight: bold; color: #333333; text-decoration: none; text-transform: uppercase; padding: 14px 20px; border-radius: 8px;" class="cta-button">
            ${data.ctaText}
          </a>
        </td>
      </tr>
    </table>
  `
        : '';

    const currentYear = new Date().getFullYear();
    const copyright =
      data.footerCopyright || `© ${currentYear} Cinego. All rights reserved.`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cinego - ${data.title}</title>
  <style type="text/css">
    body, p, td, th { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    body { background-color: #f5f5f5; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .content-block { padding: 20px !important; }
      .otp-code { font-size: 32px !important; letter-spacing: 3px !important; }
      .cta-button { display: block !important; width: 80% !important; margin: 0 auto !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
  <center>
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;" class="email-container">
      <!-- Header -->
      <tr>
        <td align="center" bgcolor="#333333" style="padding:30px 0;">
          <h1 style="margin:0;font-size:36px;font-weight:bold;color:#FBBE25;letter-spacing:1px;">CINEGO</h1>
        </td>
      </tr>

      <!-- Main Content -->
      <tr>
        <td bgcolor="#333333" style="padding:40px 30px;" class="content-block">
          <h2 style="margin:0 0 20px 0;font-size:28px;line-height:36px;color:#FBBE25;font-weight:bold;text-align:center;">
            ${data.title}
          </h2>

          ${messageHtml}

          <!-- OTP Code Box -->
          <div style="background-color:#444444;border-radius:8px;padding:25px;margin:20px auto;text-align:center;max-width:400px;">
            <p class="otp-code" style="margin:0;font-size:42px;font-weight:bold;letter-spacing:5px;color:#FFFFFF;font-family:monospace;">${data.otpCode}</p>
          </div>

          <p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:#FFFFFF;text-align:center;">
            It expires in <strong>${data.expiryTime}</strong>.
          </p>

          ${ctaButton}

          <p style="margin:30px 0 0 0;font-size:14px;line-height:20px;color:#FFFFFF;text-align:center;">
            Didn't request this code? Please ignore this email.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td bgcolor="#222222" style="padding:25px 30px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="color:#FFFFFF;font-size:12px;line-height:18px;text-align:center;">
                <p style="margin:0 0 5px 0;">${copyright}</p>
                <p style="margin:0;">This is an automated message, please do not reply.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
  `;
  }
}
