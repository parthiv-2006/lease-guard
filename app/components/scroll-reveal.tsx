"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface RevealProps {
  as?: "section" | "div";
  style?: React.CSSProperties;
  children: ReactNode;
}

// Fades a section in the first time it scrolls into view. Mirrors the v2
// design's IntersectionObserver reveal (rootMargin -12% bottom, threshold 0.08).
export function Reveal({ as = "section", style, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as;
  return (
    <Tag ref={ref as never} data-reveal style={style}>
      {children}
    </Tag>
  );
}
