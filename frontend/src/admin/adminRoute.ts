const rawAdminPath =
  (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim() || '/gx-ctrl-9472';
const withLeadingSlash = rawAdminPath.startsWith('/') ? rawAdminPath : `/${rawAdminPath}`;
export const ADMIN_BASE_PATH =
  withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;

export function isAdminPathname(pathname: string): boolean {
  if (ADMIN_BASE_PATH === '/') return false;
  return pathname === ADMIN_BASE_PATH || pathname.startsWith(`${ADMIN_BASE_PATH}/`);
}
