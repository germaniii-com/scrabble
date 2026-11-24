/**
 * Invite links: `<origin>/?code=XXXX` — friends open one and land on Home
 * with the room code already filled in.
 */

/** Room codes are 4 chars, uppercase A–Z/0–9 (matches the server's CODE_CHARS). */
export function sanitizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/** Room code from the invite link in the current URL (`?code=`), '' if none. */
export function inviteCodeFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('code') ?? '';
  return sanitizeCode(raw);
}

/** Absolute link that opens Home with this room's code prefilled. */
export function inviteLinkFor(code: string): string {
  return `${window.location.origin}/?code=${code}`;
}
