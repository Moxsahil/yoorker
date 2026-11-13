import { Injectable, Logger } from "@nestjs/common";

export const OTP_SENDER = Symbol("OTP_SENDER");

/** Delivers a sign-in code. The WhatsApp and SMS senders plug in here once approved. */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

/**
 * Development sender: writes the code to the API log instead of sending it.
 * Used until the WhatsApp template and SMS DLT registration are approved (TURF-007).
 */
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
