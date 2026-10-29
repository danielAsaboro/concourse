"use client";
// Top bar for the real-venue pages (/night, /ops), so they sit inside the product
// with a way home, back to the demo dashboard, the 3D arena and the theme toggle.
// The Dynamic Island in the middle carries the solver's live state.
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme";
import { IconArrowRight, Logo } from "@/components/icons";
import { Island } from "@/components/island/Island";
import { VENUE3D_LINK, appHref } from "@/components/lib";

export default function NightNav() {
  const path = usePathname();
  const cur = (p: string) => (path === p ? "page" : undefined);
  return (
    <header className="lp-nav scrolled">
      <div className="lp-wrap">
        <a href="/" className="logo"><Logo /><span>Concourse</span></a>
        <Island />
        <nav aria-label="Real venue">
          <a href="/night" aria-current={cur("/night")}>Plan</a>
          <a href="/ops" aria-current={cur("/ops")}>Staffing &amp; prep</a>
          <a {...VENUE3D_LINK}>3D arena</a>
          <a href={appHref("overview")}>Demo dashboard</a>
        </nav>
        <div className="actions">
          <ThemeToggle />
          <a className="btn btn-primary btn-sm" href={appHref("tonight")}>Open the demo<IconArrowRight /></a>
        </div>
      </div>
    </header>
  );
}
