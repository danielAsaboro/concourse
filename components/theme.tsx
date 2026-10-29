"use client";
import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export type Theme = "light" | "dark";

export function useTheme(): [Theme, (t?: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "dark" : "light");
    const obs = new MutationObserver(() => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const set = (t?: Theme) => {
    const next = t ?? (document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
  };
  return [theme, set];
}

export function ThemeToggle() {
  const [theme, set] = useTheme();
  return (
    <button className="icon-btn" onClick={() => set()} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
