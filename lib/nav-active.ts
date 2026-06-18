export function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0].split("#")[0];
  if (path !== "/" && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function resolveNavPathname(
  clientPathname: string | null,
  initialPathname: string
): string {
  return normalizePathname(clientPathname?.trim() ? clientPathname : initialPathname);
}
