export const PAGE_SIZE = 7;

export const VIEW_PATHS = {
  overview: "/",
  licenses: "/licenses",
  activity: "/activity",
  audit: "/audit",
  settings: "/settings",
  overrides: "/overrides"
};

export function getViewFromPath(pathname) {
  if (pathname === "/licenses") return "licenses";
  if (pathname === "/activity") return "activity";
  if (pathname === "/audit") return "audit";
  if (pathname === "/settings") return "settings";
  if (pathname === "/overrides") return "overrides";
  return "overview";
}
