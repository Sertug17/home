export const navigationItems = [
  { id: "home", label: "Home" },
  { id: "save", label: "Save" },
  { id: "invest", label: "Invest" },
] as const;

export type NavigationId = (typeof navigationItems)[number]["id"];

export function isNavigationId(value: string): value is NavigationId {
  return navigationItems.some((item) => item.id === value);
}
