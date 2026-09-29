import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentActor } from "@/lib/auth";
import { GoogleCalendarError, googleCalendarItemPreview } from "@/lib/google-calendar";
import { requestId } from "@/lib/security";

export async function GET() {
  const id = requestId();
  const actor = await getCurrentActor();
  if (!actor) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.", id);
  if (actor.contextType !== "company") {
    return apiError(403, "COMPANY_CONTEXT_REQUIRED", "Switch to a Company before previewing a Google Calendar item.", id);
  }
  try {
    return apiSuccess(googleCalendarItemPreview(actor), id);
  } catch (error) {
    const domain = error instanceof GoogleCalendarError
      ? error
      : new GoogleCalendarError("GOOGLE_PREVIEW_FAILED", "transient", 503);
    return apiError(domain.status, domain.code, "A safe Google Calendar preview is temporarily unavailable.", id);
  }
}
