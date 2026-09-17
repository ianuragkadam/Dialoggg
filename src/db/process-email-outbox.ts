import { processEmailOutbox, resendEmailSender } from "../lib/email-outbox";

const result = await processEmailOutbox(resendEmailSender());
process.stdout.write(`Email outbox processed: ${result.delivered} delivered, ${result.failed} deferred or failed.\n`);
if (result.failed) process.exitCode = 1;
