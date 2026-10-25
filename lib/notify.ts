import { prisma } from "./db";

export type NotifyEvent =
  | "ORDER_RECEIVED"
  | "STAGE_COMPLETE"
  | "ORDER_READY"
  | "DELAY"
  | "INVOICE";

/**
 * Customer notification interface.
 *
 * Dev mode (no SMTP provider configured): every notification is recorded in
 * the NotificationLog table with status LOGGED and is visible in Settings →
 * Notifications and on the order page. Nothing is emailed, and we never
 * pretend it was.
 *
 * To wire a real provider later, implement sending inside this function and
 * set status to SENT/FAILED accordingly. A notification failure must never
 * roll back the production update that triggered it, so failures are caught
 * and logged, never thrown to the caller.
 */
export async function notifyCustomer(opts: {
  orderId: string;
  lotId?: string;
  event: NotifyEvent;
  subject: string;
  body: string;
}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      include: { customer: true },
    });
    await prisma.notificationLog.create({
      data: {
        orderId: opts.orderId,
        lotId: opts.lotId,
        event: opts.event,
        channel: "EMAIL",
        recipient: order?.customer?.email ?? null,
        subject: opts.subject,
        body: opts.body,
        status: "LOGGED", // dev mode: recorded, not sent
      },
    });
  } catch (err) {
    console.error("[notify] failed to record notification", err);
  }
}
