import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { P } from "./styles.js";

interface ToastState {
  message: string;
  dot: string;
}

const ToastContext = createContext<((message: string, dot?: string) => void) | null>(null);

/** 3.6s pill toast - matches the design's flash() timing exactly. */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string, dot = "#57D69E") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, dot });
    timer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  return (
    <ToastContext.Provider value={flash}>
      {children}
      {toast && (
        <div style={P.toast}>
          <span style={{ ...P.toastDot, background: toast.dot }} />
          <span style={P.toastText}>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, dot?: string) => void {
  const flash = useContext(ToastContext);
  if (!flash) throw new Error("useToast must be used within a ToastProvider");
  return flash;
}
