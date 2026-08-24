export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailAdapter {
  send(input: SendEmailInput): Promise<{ providerId: string }>;
}
