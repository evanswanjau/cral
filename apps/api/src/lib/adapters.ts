import { createSmsAdapter } from "../adapters/sms/index.js";
import { createEmailAdapter } from "../adapters/email/index.js";
import { createPaymentAdapter } from "../adapters/payment/index.js";

/** Singletons — built once from env at process start, per the Phase 0 adapter interfaces. */
export const smsAdapter = createSmsAdapter();
export const emailAdapter = createEmailAdapter();
export const paymentAdapter = createPaymentAdapter();
