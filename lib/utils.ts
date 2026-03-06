export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatSectionTitle(pathname: string) {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "");
  const section = cleanPath.split("/").filter(Boolean)[0] ?? "dashboard";

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    vendors: "Vendors",
    partners: "Partners",
    assessments: "Assessments",
    reviews: "Reviews",
    settings: "Settings",
  };

  return titles[section] ?? "Dashboard";
}
