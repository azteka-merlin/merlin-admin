export const PAGE_SIZE = 7;

export const VIEW_PATHS = {
  overview: "/overview",
  licenses: "/licenses",
  usage: "/usage",
  activity: "/activity",
  audit: "/audit",
  "catalog-queue": "/catalog-queue",
  settings: "/settings",
  overrides: "/overrides",
  premium: "/premium",
  "premium-activations": "/premium/activations",
  polls: "/polls",
  announcements: "/announcements",
  payments: "/payments",
  "public-signup": "/public-signup",
  "public-feedbacks": "/public-feedbacks",
  partners: "/partners"
};

export function getViewFromPath(pathname) {
  if (pathname === "/overview") return "overview";
  if (pathname === "/licenses") return "licenses";
  if (pathname === "/usage") return "usage";
  if (pathname === "/activity") return "activity";
  if (pathname === "/audit") return "audit";
  if (pathname === "/catalog-queue") return "catalog-queue";
  if (pathname === "/settings") return "settings";
  if (pathname === "/overrides") return "overrides";
  if (pathname === "/premium") return "premium";
  if (pathname === "/premium/activations") return "premium-activations";
  if (pathname === "/polls") return "polls";
  if (pathname === "/announcements") return "announcements";
  if (pathname === "/payments") return "payments";
  if (pathname === "/public-signup") return "public-signup";
  if (pathname === "/public-feedbacks") return "public-feedbacks";
  if (pathname === "/partners") return "partners";
  return "overview";
}
