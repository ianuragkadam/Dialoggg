type ParentTask = { type?: string; is_root?: boolean; end_date?: string | null } | null | undefined;

/** Header dates are inclusive in the plan API; other entry points use the saved Project Start Date. */
export function defaultNewTaskStartDate(projectStartDate: string, parent?: ParentTask): string {
  const headerEnd = parent?.type === "project" && !parent.is_root ? parent.end_date?.slice(0, 10) : null;
  return headerEnd && /^\d{4}-\d{2}-\d{2}$/.test(headerEnd) ? headerEnd : projectStartDate;
}
