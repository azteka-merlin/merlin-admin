export const PAGE_SIZE = 7;

export const VIEW_PATHS = {
  overview: "/",
  licenses: "/licenses",
  activity: "/activity",
  audit: "/audit",
  settings: "/settings",
  overrides: "/overrides",
  premium: "/premium",
  polls: "/polls"
};

export function getViewFromPath(pathname) {
  if (pathname === "/licenses") return "licenses";
  if (pathname === "/activity") return "activity";
  if (pathname === "/audit") return "audit";
  if (pathname === "/settings") return "settings";
  if (pathname === "/overrides") return "overrides";
  if (pathname === "/premium") return "premium";
  if (pathname === "/polls") return "polls";
  return "overview";
}
