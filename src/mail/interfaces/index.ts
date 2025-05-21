export interface EmailTemplateData {
  title: string;
  messages: string[];
  ctaText: string;
  ctaLink: string;
  footerText?: string;
  address?: string;
}

export interface OTPTemplateData {
  title: string; // Customizable title
  messages: string[]; // Body messages as paragraphs
  otpCode: string; // The OTP code
  expiryTime: string;
  ctaText?: string;
  ctaLink?: string;
  footerCopyright?: string;
}
