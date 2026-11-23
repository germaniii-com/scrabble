interface TileFaceProps {
  letter: string;
  isBlank: boolean;
}

/** The floating tile rendered by DragOverlay while dragging. */
export function TileFace({ letter, isBlank }: TileFaceProps) {
  return (
    <span className="flex h-14 w-14 select-none items-center justify-center rounded-md bg-gradient-to-b from-amber-100 to-amber-300 text-2xl font-extrabold text-stone-900 shadow-2xl">
      {isBlank ? <span className="italic underline">{letter}</span> : letter}
    </span>
  );
}
