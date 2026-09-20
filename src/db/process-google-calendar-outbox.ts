import { processGoogleOutbox } from "@/lib/google-calendar";

const result = await processGoogleOutbox(50);
process.stdout.write(`Google Calendar outbox processed: ${result.completed} completed, ${result.deferred} deferred, ${result.dead} dead-lettered.\n`);
if (result.dead) process.exitCode = 1;
