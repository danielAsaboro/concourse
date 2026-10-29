"use client";
// A guided, live walkthrough of the 3D venue on first visit: the camera moves, the panels change,
// and each step says what is real, what is modelled and where Qloo fits. It drives the real app; it is not a video.
import { useEffect } from "react";
import { SPOTS } from "./geometry";
import type { Mode, NavRequest, SeatPos } from "./Nav";
import { conceptName, usd, type Layout, type NightPlan } from "./Plan";
import type { View } from "./Scene";
import s from "./venue.module.css";

export const TOUR_KEY = "venue-tour-done";

type Actions = {
  setMode: (m: Mode) => void; setView: (v: View) => void; setNight: (b: boolean) => void; setColorBy: (c: string) => void;
  setSelected: (k: string | null) => void; setSeat: (p: SeatPos) => void; send: (r: Omit<NavRequest, "n"> & Record<string, unknown>) => void;
  setLayout: (l: Layout) => void;
};
type Step = { title: string; body: string; apply: (a: Actions) => void };

function steps(plan: NightPlan | null, eventTitle: string): Step[] {
  const out: Step[] = [
    {
      title: "Climate Pledge Arena, Seattle",
      body: "The building and the Seattle Center blocks around it come from OpenStreetMap. The 74 sections, both concourses and all 49 stands come from the arena's own maps and dining guide. Drag, pan and zoom at any point.",
      apply: (a) => { a.setMode("orbit"); a.setView("exterior"); a.setNight(true); a.setColorBy("category"); a.setSelected(null); a.setLayout("plan"); a.send({ kind: "view", preset: "aerial" }); },
    },
    {
      title: `Tonight: ${eventTitle}`,
      body: plan
        ? `${Math.round(plan.attendance).toLocaleString()} people expected and ${usd(plan.fnbPerCap)} of food and drink a head (modelled). The seats fill to that crowd.`
        : "The seats fill to the expected crowd for the event you pick at the top left.",
      apply: (a) => { a.setMode("orbit"); a.setView("bowl"); a.send({ kind: "view", preset: "bowl" }); },
    },
  ];
  if (plan) {
    const best = [...plan.plan.decisions].sort((x, y) => y.economics.contribution - x.economics.contribution)[0];
    const bestSpot = best ? SPOTS.find((x) => x.stand.id === best.slot.venueId) : null;
    const cl = plan.baselines.find((b) => b.id === "claude-no-qloo" && b.status === "scored");
    const sq = plan.baselines.find((b) => b.id === "status-quo" && b.status === "scored");
    out.push(
      {
        title: "Every stand, modelled for tonight",
        body: "This is the main concourse with the roof and upper levels lifted off. Colour shows the orders each stand serves tonight in the planner, which models arrival windows, Erlang C queues and newsvendor stock. The queues you see are sized from the same numbers.",
        apply: (a) => { a.setMode("orbit"); a.setView("ll2"); a.setColorBy("served"); a.send({ kind: "view", preset: "concourse" }); },
      },
      {
        title: `${plan.plan.decisions.length} locations the solver decides`,
        body: best
          ? `HiGHS picks a concept for each flexible location (${plan.plan.solver.status.toLowerCase()}, ${usd(plan.plan.total)} in total). At ${best.slot.label} it put ${best.concept.name}, worth ${usd(best.economics.contribution)}. Click any stand to try a different concept and see the re-solved dollar difference.`
          : "HiGHS picks a concept for each flexible location.",
        apply: (a) => { a.setMode("orbit"); a.setView(bestSpot?.level === "ll2" ? "ll2" : "upper"); a.setColorBy("flex"); if (bestSpot) { a.setSelected(bestSpot.key); a.send({ kind: "stand", spot: bestSpot }); } },
      },
      {
        title: "Where Qloo comes in",
        body: plan.taste.status === "live"
          ? `Qloo's taste data for tonight's crowd is live, and it changes ${plan.ablation.slotsDifferent} of ${plan.plan.decisions.length} picks compared with the same model without it.`
          : `Without a taste signal, ${plan.ablation.tiedSlotsWithoutTaste} of ${plan.plan.decisions.length} picks are ties that crowd size and economics can't break. Qloo's read of who is coming tonight is what breaks them. It is pending here until the API key arrives, and the panel says so.`,
        apply: (a) => { a.setSelected(null); a.setView("upper"); a.setColorBy("flex"); a.send({ kind: "view", preset: "concourse" }); },
      },
      {
        title: "Against the alternatives",
        body: cl
          ? `The same model scores the plan Claude made without Qloo at ${usd(cl.total!)}: ${cl.slotsDifferent} locations differ, and the plan comes out ${usd(plan.plan.total - cl.total!)} ahead. Keeping the current line-up scores ${usd(sq?.total ?? 0)}. The orange stands are the ones that change.`
          : `Keeping the current line-up scores ${usd(sq?.total ?? 0)} under the same model. The orange stands are the ones the plan changes. Switch layouts in the plan panel.`,
        apply: (a) => { a.setSelected(null); a.setView("upper"); a.setColorBy("flex"); a.setLayout(cl ? "claude-no-qloo" : "status-quo"); a.send({ kind: "view", preset: "concourse" }); },
      },
    );
    void conceptName;
  }
  out.push(
    {
      title: "What fans see",
      body: "Sit in any of the 74 sections and see its view. Pick a section on the minimap, or use [ and ] to change section and ↑ ↓ to change row.",
      apply: (a) => { a.setLayout("plan"); a.setColorBy("category"); a.setSelected(null); a.setMode("seat"); },
    },
    {
      title: "Walk it",
      body: "Walk both real concourses, the Upper Concourse at street level and LL2 below it. Use WASD or the stick, and drag to look. You can only leave through the real entries. Your turn.",
      apply: (a) => { a.setMode("walk"); },
    },
  );
  return out;
}

export function Tour({ step, setStep, plan, eventTitle, actions }: { step: number; setStep: (n: number | null) => void; plan: NightPlan | null; eventTitle: string; actions: Actions }) {
  const list = steps(plan, eventTitle);
  const cur = list[Math.min(step, list.length - 1)];
  useEffect(() => { cur.apply(actions); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step, !!plan]);
  const done = () => { try { localStorage.setItem(TOUR_KEY, "1"); } catch {} actions.setLayout("plan"); setStep(null); };
  const last = step >= list.length - 1;
  return (
    <div className={s.tour} role="dialog" aria-label="Guided tour">
      <div className={s.tourHd}>
        <span>{step + 1} / {list.length}</span>
        <button className={s.linkBtn} onClick={done}>Skip tour</button>
      </div>
      <h3>{cur.title}</h3>
      <p>{cur.body}</p>
      <div className={s.row}>
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <button className={s.primary} onClick={() => (last ? done() : setStep(step + 1))}>{last ? "Explore" : "Next"}</button>
      </div>
      <div className={s.dots}>{list.map((_, i) => <i key={i} data-on={i === step || undefined} />)}</div>
    </div>
  );
}
