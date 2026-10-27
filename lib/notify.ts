import { prisma } from "./db";

export type NotifyEvent =
  | "ORDER_RECEIVED"
  | "STAGE_COMPLETE"
  | "ORDER_READY"
  | "DELAY"
  | "INVOICE_READY";

/**
 * Customer notification interface.
 *
 * When RESEND_API_KEY and MAIL_FROM are configured, emails are sent via the
 * Resend HTTP API (no SDK dependency) and logged as SENT or FAILED.
 * Otherwise every notification is recorded in the NotificationLog with
 * status LOGGED (dev mode) and is visible in Settings → Notifications.
 *
 * A notification failure must never roll back the production update that
 * triggered it, so errors are caught and logged, never thrown.
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
    const recipient = order?.customer?.email ?? null;

    let status = "LOGGED";
    let error: string | null = null;
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM && recipient) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [recipient],
            subject: opts.subject,
            text: opts.body,
          }),
        });
        if (res.ok) {
          status = "SENT";
        } else {
          status = "FAILED";
          error = `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        }
      } catch (sendErr) {
        status = "FAILED";
        error = sendErr instanceof Error ? sendErr.message : String(sendErr);
      }
    }

    await prisma.notificationLog.create({
      data: {
        orderId: opts.orderId,
        lotId: opts.lotId,
        event: opts.event,
        channel: "EMAIL",
        recipient,
        subject: opts.subject,
        body: opts.body,
        status,
        error,
      },
    });
    if (error) console.error("[notify] send failed:", error);
  } catch (err) {
    console.error("[notify] failed to record notification", err);
  }
}
