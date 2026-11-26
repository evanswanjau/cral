import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { color, font } from "@cral/ui";
import type { LiveService } from "../../lib/services.js";

/**
 * The masthead's "Hire" entry (PR H4, docs/plans/hire-search-first.md): a
 * button that opens All vehicles, Cars, Trucks, Machinery, each a link
 * straight to `/hire` results.
 *
 * - Opens on click or tap (never on hover: a phone has none, and a menu
 *   that opens as the pointer passes on the way to Drivers is a trap).
 * - Closes on Escape (focus back on the button), on a click or tap
 *   outside, on Tab out of it, and when a link is followed.
 * - Keyboard: Enter, Space or Arrow Down opens it on the first entry;
 *   Arrow Up opens it on the last; arrows move, Home and End jump.
 * - Every row is 44px tall.
 *
 * Portalled to `<body>` and placed with `position: fixed` under the
 * button: on a phone the tabs row scrolls sideways inside itself, and a
 * menu inside it would be clipped by that scroll box.
 *
 * Not from a canvas; built from tokens.ts.
 */
export function HireMenu({
  service,
  on,
  fg,
  transparent,
}: {
  service: LiveService;
  /** This entry's tab is the active one. */
  on: boolean;
  /** The tab text colour the row around it uses. */
  fg: string;
  transparent: boolean;
}): JSX.Element {
  const items = service.menu ?? [];
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const Icon = service.icon;
  const here = `${pathname}${search}`;

  // A followed link (or the back button) closes it.
  useEffect(() => setOpen(false), [pathname, search]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 232;
      setPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    // Capture: the tabs row scrolling sideways moves the button too.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Focus the first (or last) entry once the menu is in the page.
  useEffect(() => {
    if (!open || !pos) return;
    const links = menuRef.current?.querySelectorAll<HTMLAnchorElement>("a");
    if (!links?.length) return;
    (focusOnOpen.current === "last" ? links[links.length - 1] : links[0])?.focus({ preventScroll: true });
  }, [open, pos]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusOnOpen.current = e.key === "ArrowUp" ? "last" : "first";
      setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (n: number) => links[(n + links.length) % links.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(links.length - 1);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "cral-hire-menu" : undefined}
        onClick={() => {
          focusOnOpen.current = "first";
          setOpen((v) => !v);
        }}
        onKeyDown={onButtonKey}
        className="cral-mast-menu-btn"
        style={{
          position: "relative",
          flex: "none",
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 10px 0 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: fg,
          font: `${on ? 600 : 500} 14px/1 ${font.sans}`,
          whiteSpace: "nowrap",
        }}
      >
        <Icon size={18} weight={on ? "bold" : "regular"} aria-hidden="true" />
        {service.tab}
        <CaretDown
          size={13}
          weight="bold"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            right: 10,
            bottom: 0,
            height: 2,
            borderRadius: 2,
            background: on ? (transparent ? "#FFFFFF" : color.cruzBlue) : "transparent",
          }}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id="cral-hire-menu"
            role="menu"
            aria-label={service.tab}
            onKeyDown={onMenuKey}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 232,
              zIndex: 60,
              background: "#FFFFFF",
              border: `1px solid ${color.neutral[200]}`,
              borderRadius: 12,
              boxShadow: "0 20px 44px rgba(11,15,26,.22)",
              padding: 6,
            }}
          >
            {items.map((m) => {
              const current = here === m.href;
              const ItemIcon = m.icon;
              return (
                <Link
                  key={m.href}
                  to={m.href}
                  role="menuitem"
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="cral-menu-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: 44,
                    padding: "0 12px",
                    borderRadius: 8,
                    color: color.ink,
                    font: `${current ? 600 : 500} 14px/1 ${font.sans}`,
                    textDecoration: "none",
                  }}
                >
                  <ItemIcon
                    size={18}
                    weight={current ? "fill" : "regular"}
                    aria-hidden="true"
                    color={color.cruzBlue}
                  />
                  {m.label}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
