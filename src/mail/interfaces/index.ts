export interface EmailTemplateData {
  title: string;
  messages: string[];
  ctaText: string;
  ctaLink: string;
  footerText?: string;
  address?: string;
}

export interface OTPTemplateData {
  otpCode: string;
  expiryTime: string; // e.g., "10 minutes"
  ctaLink?: string; // Optional CTA link
  footerCopyright?: string; // Optional custom copyright text
}
