export const PAGE_SIZE = 7;

export const VIEW_PATHS = {
  overview: "/overview",
  licenses: "/licenses",
  activity: "/activity",
  audit: "/audit",
  settings: "/settings",
  overrides: "/overrides",
  premium: "/premium",
  polls: "/polls",
  payments: "/payments",
  "public-signup": "/public-signup",
  "public-feedbacks": "/public-feedbacks"
};

export function getViewFromPath(pathname) {
  if (pathname === "/overview") return "overview";
  if (pathname === "/licenses") return "licenses";
  if (pathname === "/activity") return "activity";
  if (pathname === "/audit") return "audit";
  if (pathname === "/settings") return "settings";
  if (pathname === "/overrides") return "overrides";
  if (pathname === "/premium") return "premium";
  if (pathname === "/polls") return "polls";
  if (pathname === "/payments") return "payments";
  if (pathname === "/public-signup") return "public-signup";
  if (pathname === "/public-feedbacks") return "public-feedbacks";
  return "overview";
}
