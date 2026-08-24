export interface SendSmsInput {
  to: string; // E.164, e.g. +254722418903
  body: string;
}

export interface SmsAdapter {
  send(input: SendSmsInput): Promise<{ providerId: string }>;
}
