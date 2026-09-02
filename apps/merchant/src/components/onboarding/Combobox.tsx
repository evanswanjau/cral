import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { O } from "./styles.js";
import { TextInput } from "./primitives.js";

/**
 * Free-text input with suggestions.
 *
 * Deliberately *not* a select: the typed value is always what gets stored,
 * and the list only offers shortcuts. A merchant whose vehicle isn't in the
 * catalogue just keeps typing - the logbook is the authority, not our list.
 */
export function Combobox({
  value,
  onChange,
  options,
  defaultOptions,
  placeholder,
  error,
  emptyHint,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /**
   * Shown before anything is typed, instead of the first 8 of `options`.
   * Falls back to `options` itself when not given.
   */
  defaultOptions?: string[];
  placeholder?: string;
  error?: boolean;
  /** Shown when nothing matches, to make clear free text is accepted. */
  emptyHint?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) {
      // Nothing typed yet: the curated list, alphabetical, not a slice of
      // whatever happens to sort first in the full catalogue.
      return [...(defaultOptions ?? options)].sort((a, b) => a.localeCompare(b)).slice(0, 8);
    }
    const pool = options.filter((o) => o.toLowerCase().includes(q));
    // Prefix matches first - typing "co" should surface Corolla before Probox.
    return [...pool]
      .sort((a, b) => {
        const ap = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.localeCompare(b);
      })
      .slice(0, 8);
  }, [value, options, defaultOptions]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        setOpen(true);
        return;
      }
      e.preventDefault();
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + matches.length) % Math.max(matches.length, 1);
      });
    } else if (e.key === "Enter") {
      // Only steal Enter when a suggestion is genuinely highlighted, so
      // typing a custom value and pressing Enter doesn't overwrite it.
      if (open && matches[active]) {
        e.preventDefault();
        commit(matches[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <TextInput
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        error={error}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {open && (
        <ul id={listId} role="listbox" style={O.comboList}>
          {matches.length > 0 ? (
            matches.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  // mousedown, not click - the input's blur would close the
                  // list before a click ever lands.
                  e.preventDefault();
                  commit(o);
                }}
                style={{ ...O.comboOption, ...(i === active ? O.comboOptionActive : {}) }}
              >
                {o}
              </li>
            ))
          ) : (
            <li style={O.comboEmpty}>{emptyHint ?? "No match - your typed value is kept."}</li>
          )}
        </ul>
      )}
    </div>
  );
}
