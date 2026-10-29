"use client";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { Plan } from "@/lib/agent/plan";
import { ThemeToggle, useTheme } from "@/components/theme";
import {
  IconArena, IconArrowRight, IconCheck, IconEvidence, IconHandshake, IconLayers, IconMegaphone, IconStore, IconTarget, Logo,
} from "@/components/icons";
import { CAT_SHORT, NIGHT_HREF, SOURCE_URL, VENUE3D_LINK, appHref, fitVar, fitWord, fmt } from "@/components/lib";
import { FitBar, DataBadge } from "@/components/dashboard/parts";
import { Island, island } from "@/components/island/Island";

const Arena = lazy(() => import("@/components/arena/Arena"));

function ProductShot() {
  const [theme] = useTheme();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    fetch("/api/plan").then((r) => (r.ok ? r.json() : null)).then((p) => p && setPlan(p)).catch(() => {});
  }, []);
  const stands = useMemo(() => plan?.assignments.map((a) => ({ ...a, changed: !!a.previous })) ?? [], [plan]);
  const top = plan ? [...plan.assignments].filter((a) => a.previous).sort((a, b) => b.fit - a.fit).slice(0, 4) : [];
  return (
    <a className="lp-shot" href={appHref("tonight")} aria-label="Open tonight's plan in the demo" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="bar"><i /><i /><i /><span>Tonight&apos;s plan · Northside Arena</span></div>
      <div className="body">
        <div className="scene">
          {mounted && plan && (
            <Suspense fallback={null}>
              <Arena stands={stands} kind={plan.event.kind} crowd={plan.event.expectedAttendance} theme={theme} interactive={false} drift preset="bowl" />
            </Suspense>
          )}
        </div>
        <div className="side">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="t-cap">Tonight · {plan?.event.date ?? "Loading"}</span>
            <span className="t-title3">{plan?.event.title ?? "Tonight's event"}</span>
            {plan && <span><DataBadge mode={plan.mode} /></span>}
          </div>
          {plan && (
            <>
              <div className="kpis">
                <div><span className="t-cap">Crowd fit</span><strong>{fmt.fit(plan.summary.averageFit)}</strong></div>
                <div><span className="t-cap">Stands changed</span><strong>{plan.summary.standsChanged}</strong></div>
              </div>
              <div className="list">
                <span className="t-cap" style={{ paddingBottom: 8 }}>New tonight</span>
                {top.map((a) => (
                  <div className="row" key={a.stand.id}>
                    <span className="t-label">{a.vendorName}</span>
                    <span className="t-cap" style={{ color: fitVar(a.fit) }}>{fitWord(a.fit)}</span>
                    <span className="t-cap">{a.stand.label} · {CAT_SHORT[a.stand.category]}</span>
                    <FitBar fit={a.fit} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </a>
  );
}

const FEATURES = [
  { icon: <IconTarget />, title: "Ranks your shortlist for tonight", body: "Every food, drink, merch and sponsor partner on your roster is scored against the taste of the crowd buying tickets for this event, not last month's average." },
  { icon: <IconArena />, title: "Places every stand", body: "Partners land where they will sell: premium names in the club, crowd favourites on the busiest concourse spots, activations on the plaza." },
  { icon: <IconEvidence />, title: "Shows its working", body: "Each placement comes with what drives the score, what the stand had last night, and the next best options. Every number links back to the data call behind it." },
];

const AUDIENCES = [
  { icon: <IconStore />, title: "Venue operations", items: ["Set up 20 stands for tonight in minutes", "See what changes from last night", "Swap a partner and see it in the venue model"] },
  { icon: <IconHandshake />, title: "Food and beverage partnerships", items: ["Know which partners suit which shows", "Put premium partners in front of the right crowd", "Back every placement with evidence"] },
  { icon: <IconMegaphone />, title: "Sponsorship sales", items: ["Match activations to the audience on the night", "Show partners why their spot was chosen", "Plan a season of events with one tool"] },
];

const STEPS = [
  { t: "Pick the event", b: "Choose tonight's show or game. Concourse reads who the crowd is coming for." },
  { t: "Rank the shortlist", b: "Your partners are scored for that crowd's taste, with the reasons attached." },
  { t: "Assign the stands", b: "The agent fills the club first, then every concourse stand, merch store and plaza tent." },
  { t: "Review and swap", b: "Check the plan in the 3D venue, ask the agent why, and swap anything with one click." },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Tonight's solve at Climate Pledge Arena, carried by the hero's Dynamic Island. */
function useLiveSolve() {
  useEffect(() => {
    if (!NIGHT_HREF) return;
    let gone = false;
    island.show({ tone: "busy", title: "Solving tonight at Climate Pledge Arena" });
    fetch("/api/night").then((r) => r.json())
      .then((m: { events: { id: string }[] }) => fetch(`/api/night?event=${encodeURIComponent(m.events[0].id)}`)).then((r) => r.json())
      .then((a: { error?: string; event: { headliner: string; date: string; start: string }; plan: { total: number; solver: { status: string } }; solves: unknown[]; taste: { status: string } }) => {
        if (gone || a.error) { island.clear(); return; }
        const day = new Date(`${a.event.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        island.show({ title: `Plan solved · ${a.plan.solver.status}`, value: usd(a.plan.total), ttl: 2400 });
        island.rest({
          title: `Climate Pledge Arena · ${a.event.headliner}`,
          value: usd(a.plan.total),
          detail: `${day}, ${a.event.start}. Expected contribution from the rotating stands, solved just now on the arena's own dining guide and maps.${a.taste.status === "live" ? " Qloo's taste signal is live." : " Qloo's taste signal is pending here, so this is the without-Qloo plan."}`,
          facts: [
            { label: "Solver", value: a.plan.solver.status },
            { label: "HiGHS solves", value: String(a.solves.length) },
            { label: "Qloo taste", value: a.taste.status === "live" ? "Live" : "Pending" },
          ],
          action: { label: "Open the planner", href: NIGHT_HREF },
        });
      })
      .catch(() => island.clear());
    return () => { gone = true; island.rest(null); };
  }, []);
}

export default function Landing() {
  useLiveSolve();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="lp">
      <header className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-wrap">
          <a href="#top" className="logo"><Logo /><span>Concourse</span></a>
          <nav aria-label="Page sections">
            <a href="#how">How it works</a>
            {NIGHT_HREF && <a href={NIGHT_HREF}>Real venue</a>}
            {NIGHT_HREF && <a href="/ops">Staffing</a>}
            <a {...VENUE3D_LINK}>3D arena</a>
          </nav>
          <div className="actions">
            <ThemeToggle />
            <a className="btn btn-primary btn-sm" href={appHref("overview")}>Open the demo</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-wrap">
            <div className="intro">
              <Island fallback={{ title: "Event-night planning for Climate Pledge Arena" }} />
              <h1 className="t-display">Every stand, set for tonight&apos;s crowd.</h1>
              <p className="t-lede">
                Concourse reads the taste of tonight&apos;s crowd from Qloo and picks the food, drink, merch and sponsor partner for every stand, and shows why. Review the plan in a 3D model of your venue and change anything in one click.
              </p>
              <div className="cta">
                <a className="btn btn-primary btn-lg" href={appHref("overview")}>Open the demo<IconArrowRight /></a>
                <a className="btn btn-secondary btn-lg" href="#how">How it works</a>
              </div>
              <span className="note">No sign-up. The demo arena runs on synthetic data; the Climate Pledge Arena planner runs on the arena&apos;s own published guides and maps.</span>
            </div>
            <ProductShot />
          </div>
        </section>

        <section className="lp-section" id="what">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="t-eyebrow">What it does</p>
              <h2 className="t-title1">The same arena hosts a reggaeton tour on Friday and a basketball game on Saturday.</h2>
              <p className="t-lede">The stands shouldn&apos;t look the same. Concourse plans each night for the crowd that is coming to it.</p>
            </div>
            <div className="lp-grid3">
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <span className="ico">{f.icon}</span>
                  <h3 className="t-title3">{f.title}</h3>
                  <p className="t-body">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="who">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="t-eyebrow">Who it&apos;s for</p>
              <h2 className="t-title1">Built for the people who run the concourse.</h2>
            </div>
            <div className="lp-grid3">
              {AUDIENCES.map((a) => (
                <div className="audience" key={a.title}>
                  <span className="feature"><span className="ico">{a.icon}</span></span>
                  <h3 className="t-title3">{a.title}</h3>
                  <ul>{a.items.map((i) => <li key={i}><IconCheck />{i}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <p className="t-eyebrow">How it works</p>
              <h2 className="t-title1">From the event calendar to a full plan in four steps.</h2>
            </div>
            <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STEPS.map((s, i) => (
                <li className="step" key={s.t}>
                  <span className="n">Step {i + 1}</span>
                  <h3 className="t-title3">{s.t}</h3>
                  <p className="t-body">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section" id="real">
          <div className="lp-wrap lp-real">
            <div className="lp-section-head" style={{ marginBottom: 0 }}>
              <p className="t-eyebrow">Event night at a real venue</p>
              <h2 className="t-title1">The same question, asked of a real arena.</h2>
              <p className="t-lede">
                A second planner works from Climate Pledge Arena&apos;s own dining guide, level maps and event feed. It picks the concept for each rotating location and how much each stand preps, weighing margin, waste and queues, and tags every input as sourced or assumed. Taste data stays marked Pending until it is live. You can also walk the arena in 3D, built from map data and the arena&apos;s own level plans.
              </p>
            </div>
            <div className="cta-row">
              <a className="btn btn-secondary btn-lg" {...VENUE3D_LINK}>Walk the arena in 3D</a>
              {NIGHT_HREF && <a className="btn btn-primary btn-lg" href={NIGHT_HREF}>Open the planner<IconArrowRight /></a>}
            </div>
          </div>
        </section>

        <section className="lp-cta">
          <div className="lp-wrap box">
            <div style={{ display: "grid", gap: 16 }}>
              <span className="feature"><span className="ico"><IconLayers /></span></span>
              <h2 className="t-title1">See Friday&apos;s plan for Bad Bunny.</h2>
              <p className="t-lede">Open the demo, pick any stand in the arena and swap its partner. No account needed.</p>
            </div>
            <a className="btn btn-primary btn-lg" href={appHref("tonight")}>Open the demo<IconArrowRight /></a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <a href="#top" className="logo"><Logo /><span>Concourse</span></a>
          <p>Open source under the MIT License. The venue, events and scores in the demo are synthetic and labelled as such.</p>
          <nav aria-label="Footer">
            <a href={appHref("overview")}>Demo</a>
            <a href="#how">How it works</a>
            {NIGHT_HREF && <a href={NIGHT_HREF}>Real venue</a>}
            <a {...VENUE3D_LINK}>3D arena</a>
            {SOURCE_URL && <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
