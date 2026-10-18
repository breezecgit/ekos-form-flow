/** Staff email destinations keep their target through sign-in. */
export function staffEmailLink(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/auth?redirect=${encodeURIComponent(path)}`;
}