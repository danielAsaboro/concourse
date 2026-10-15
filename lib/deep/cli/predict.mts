// Writes dated, pre-registered predictions for the chosen events before they happen.
// Run: npx tsx lib/deep/cli/predict.mts <out.json> <eventId...>
import fs from "node:fs";
import { analyse } from "../analysis";
import { eventById } from "../venue";
import { windowsFor } from "../planner";
import { defaults } from "../economics";

const [out, ...ids] = process.argv.slice(2);
const v = defaults();
const events = [];
for (const id of ids) {
  const e = eventById.get(id);
  if (!e) throw new Error(`unknown event ${id}`);
  const a = await analyse(e, null, v);
  const busiest = windowsFor(e, v).map((w) => ({ name: w.name, perMin: w.share / w.minutes })).sort((x, y) => y.perMin - x.perMin)[0];
  events.push({
    id, title: e.title, date: e.date, start: e.start, source: e.source,
    attendance: a.attendance,
    tasteSignal: "none (no Qloo key yet); a second dated file follows once live calls run",
    flexPlan: a.plan.decisions.map((d) => ({ location: d.slot.label, concept: d.concept.name, tiedWith: d.tiedWith, expectedOrders: Math.round(d.economics.servedTx), range80: d.economics.demandInterval.map(Math.round), par: d.economics.par.quantity })),
    busiestWindow: busiest.name,
    claims: [
      `The busiest minutes for food stands will be "${busiest.name}", not ${e.kind === "game" ? "doors-to-puck-drop" : "doors-to-opener"}, measured as orders per minute.`,
      `Fixed food stands on the main concourse will each serve about ${Math.round(a.par.find((p) => p.level === "main")?.servedTx ?? 0)} food orders.`,
      `Total food orders across fixed stands ≈ ${Math.round(a.par.reduce((s, p) => s + p.servedTx, 0)).toLocaleString("en-US")}.`,
    ],
    howToCheck: "Venue or Delaware North POS counts by stand and 15-minute bucket; failing that, queue lengths timed by an attendee at two stands per window.",
  });
}
fs.writeFileSync(out, JSON.stringify({ registeredAt: new Date().toISOString(), model: "lib/deep (planner.ts, economics.ts defaults)", events }, null, 1));
console.log(`wrote ${out}: ${events.length} events`);
