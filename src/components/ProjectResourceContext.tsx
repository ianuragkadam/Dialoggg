"use client";

import { createContext } from "react";

export const ProjectResourceContext = createContext<{ projectId: number; projectName: string } | null>(null);
