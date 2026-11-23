import { Injectable, Logger } from "@nestjs/common";

export const OTP_SENDER = Symbol("OTP_SENDER");

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

@Injectable()
export class LogOtpSender implements OtpSender {
  private readonly logger = new Logger("LogOtpSender");

  async send(phone: string, code: string): Promise<void> {
    this.logger.warn(`OTP for ${maskPhone(phone)}: ${code} (log sender, nothing was sent)`);
  }
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}
