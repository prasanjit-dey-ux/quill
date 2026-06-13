import { forwardRef, useEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Single-field textarea that WRAPS to the next line as you type and
 * auto-grows in height (no horizontal scroll). Behaves like an input:
 * Enter is handled by the parent (we don't insert newlines unless allowed).
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ value, onChange, className = "", ...rest }, ref) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    };

    const resize = () => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    useEffect(resize, [value]);

    return (
      <textarea
        ref={setRefs}
        rows={1}
        value={value}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        className={`block w-full resize-none overflow-hidden bg-transparent outline-none ${className}`}
        {...rest}
      />
    );
  }
);

AutoTextarea.displayName = "AutoTextarea";
