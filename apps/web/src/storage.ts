export interface SavedRoom {
  code: string;
  token: string;
}

const ROOM_KEY = 'scrabble:room';
const NAME_KEY = 'scrabble:name';

export function saveRoom(room: SavedRoom): void {
  localStorage.setItem(ROOM_KEY, JSON.stringify(room));
}

export function loadRoom(): SavedRoom | null {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    return raw ? (JSON.parse(raw) as SavedRoom) : null;
  } catch {
    return null;
  }
}

export function clearRoom(): void {
  localStorage.removeItem(ROOM_KEY);
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}
