import { processEmailOutbox } from "../lib/email-outbox";

const result = await processEmailOutbox();
process.stdout.write(`Email outbox processed: ${result.delivered} delivered, ${result.failed} failed, ${result.deferred} deferred, ${result.expired} expired.\n`);
if (result.failed) process.exitCode = 1;
