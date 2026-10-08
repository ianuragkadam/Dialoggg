"use client";

import GlobalResourceSchedulePage from "@/app/(app)/resources/schedule/page";
import { ProjectResourceContext } from "@/components/ProjectResourceContext";

export default function ResourceSchedule({ projectId, projectName }: { projectId: number; projectName: string }) {
  return <ProjectResourceContext.Provider value={{ projectId, projectName }}><GlobalResourceSchedulePage /></ProjectResourceContext.Provider>;
}
