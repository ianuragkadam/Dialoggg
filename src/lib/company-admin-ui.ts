import type { CompanyOperationalMetadata } from "@/lib/company-administration";

export type CompanyAdminUiItem = CompanyOperationalMetadata & {
  createdLabel: string;
};

export const COMPANY_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
  "UTC",
];

export function toCompanyAdminUiItem(company: CompanyOperationalMetadata): CompanyAdminUiItem {
  const sqliteTimestamp = company.createdAt.includes("T")
    ? company.createdAt
    : `${company.createdAt.replace(" ", "T")}Z`;
  const date = new Date(sqliteTimestamp);
  return {
    ...company,
    createdLabel: Number.isNaN(date.getTime())
      ? company.createdAt
      : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date),
  };
}
