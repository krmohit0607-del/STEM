/**
 * Domain types used by the React shell.
 *
 * These are intentionally minimal subsets of the .NET DTOs returned by the
 * existing API. They are typed loosely (most fields optional) because the
 * source DTOs are large and not all fields are consumed by Phase 1 UI.
 */

export interface GenericListItem {
  id: number;
  text: string;
  value?: unknown;
}

export interface CurrentUser {
  /** User row id (claims `nameid`). */
  id: number;
  /** Username (claims `name`). */
  name: string;
  /** Display name. */
  fullName?: string;
  /** Email address. */
  email?: string;
  /** Roles assigned to the user. */
  Roles?: GenericListItem[];
  /** Currently selected portal index (0-based). */
  currentPortal?: number;
  /** Free-form: anything else the API returns is preserved. */
  [key: string]: unknown;
}

/**
 * Wrapper returned by `GET /api/security/users/current`.
 *
 * The legacy controller returns `FleetViewUser.AuthenticatedUser`, which has
 * `User` (the row), `CurrentUser` (effective user when impersonating), and a
 * top-level `Roles` collection. Only the fields used by the shell are typed.
 */
export interface AuthenticatedUserDto {
  User?: CurrentUser;
  CurrentUser?: CurrentUser;
  Roles?: GenericListItem[];
  [key: string]: unknown;
}

export type LocaleDictionary = Record<string, string>;
