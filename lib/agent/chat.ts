import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { VENDORS, vendorById } from "@/lib/venue/catalogue";
import { eventById } from "@/lib/venue/events";
import { Ledger, compareCrowds, demographics, rankShortlist } from "@/lib/qloo";
import type { LedgerEntry } from "@/lib/qloo/types";
import type { Plan } from "./plan";

export type AgentReply = {
  text: string;
  ledger: LedgerEntry[];
  engine: "claude" | "offline";
  /** Stand swaps the agent decided on, applied by the client. */
  swaps: { standId: string; vendorId: string }[];
};

const SYSTEM = `You are the event-night operations agent for an arena. The operator is setting up tonight's stands (food, drink, merch, sponsor activations) for the specific crowd coming in.
You ground every recommendation in Qloo taste data through your tools. Never invent an affinity. If a tool returns nothing, say so.
Qloo affinities are relative to the query: compare within one ranking, not across events. They describe aggregate crowd taste, never individuals.
Be concise and operational: lead with the decision, then the evidence (affinity, which anchor drove it). When the operator asks to change a stand, call swap_stand.
Label anything that is your own inference (revenue, foot traffic) as an inference.
Driver scores from explainability are normalised contributions, not shares: never state them as percentages. Quote the score (e.g. "driver score 0.62") or say which headliner drives most of it.`;

const tools: Anthropic.Tool[] = [
  {
    name: "qloo_rank",
    description: "Rank the venue's vendor shortlist for tonight's crowd using Qloo Insights with filter.results.entities and explainability. Optionally restrict to one category.",
    input_schema: { type: "object", properties: { category: { type: "string", enum: ["food", "drink", "merch", "sponsor"] } }, additionalProperties: false },
  },
  {
    name: "qloo_demographics",
    description: "Age and gender affinity offsets (-1..1) for tonight's anchors via urn:demographics.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "qloo_compare",
    description: "Compare tonight's crowd with another event's crowd via /v2/analysis/compare. Returns the taste tags that differ most.",
    input_schema: { type: "object", properties: { other_event_id: { type: "string" } }, required: ["other_event_id"], additionalProperties: false },
  },
  {
    name: "swap_stand",
    description: "Change which vendor is at a stand. Use after checking the ranking.",
    input_schema: { type: "object", properties: { stand_id: { type: "string" }, vendor_id: { type: "string" } }, required: ["stand_id", "vendor_id"], additionalProperties: false },
  },
];

function planContext(plan: Plan) {
  const stands = plan.assignments.map((a) => `${a.stand.id} (${a.stand.label}, ${a.stand.zone}, ${a.stand.category}): ${a.vendorName} fit ${a.fit}`).join("\n");
  const vendors = VENDORS.map((v) => `${v.id}=${v.name} [${v.category}${v.premium ? ", premium" : ""}]`).join("; ");
  return `Tonight: ${plan.event.title} (${plan.event.kind}, ${plan.event.date}). Anchors: ${plan.event.anchors.join(", ")}. Previous night: ${plan.previousEvent?.title ?? "none"}.
Data mode: ${plan.mode === "live" ? "live Qloo" : "recorded fixtures shaped like Qloo responses (no key yet)"}.
Current stand plan:\n${stands}\n\nVendor ids: ${vendors}`;
}

async function runTool(name: string, input: Record<string, unknown>, plan: Plan, ledger: Ledger, swaps: AgentReply["swaps"]): Promise<string> {
  const ev = eventById.get(plan.event.id)!;
  if (name === "qloo_rank") {
    const cat = input.category as string | undefined;
    const vs = cat ? VENDORS.filter((v) => v.category === cat) : VENDORS;
    const r = await rankShortlist(ev.anchors, vs, ledger);
    return JSON.stringify(r.slice(0, 15).map((x) => ({ vendor_id: x.vendorId, name: x.name, affinity: x.affinity, drivers: x.drivers })));
  }
  if (name === "qloo_demographics") return JSON.stringify(await demographics(ev.anchors, ledger));
  if (name === "qloo_compare") {
    const other = eventById.get(String(input.other_event_id));
    if (!other) return JSON.stringify({ error: "unknown event id" });
    return JSON.stringify(await compareCrowds(ev.anchors, other.anchors, ledger));
  }
  if (name === "swap_stand") {
    const standId = String(input.stand_id), vendorId = String(input.vendor_id);
    const a = plan.assignments.find((x) => x.stand.id === standId);
    const v = vendorById.get(vendorId);
    if (!a || !v) return JSON.stringify({ error: "unknown stand or vendor" });
    if (v.category !== a.stand.category) return JSON.stringify({ error: `${v.name} is a ${v.category} vendor; ${a.stand.label} is a ${a.stand.category} stand` });
    swaps.push({ standId, vendorId });
    return JSON.stringify({ ok: true, stand: a.stand.label, now: v.name });
  }
  return JSON.stringify({ error: "unknown tool" });
}

/** Deterministic answers when no model key is configured. Uses the plan already computed from Qloo data. */
function offlineAnswer(question: string, plan: Plan, swaps: AgentReply["swaps"]): string {
  const q = question.toLowerCase();
  const stand = plan.assignments.find((a) => q.includes(a.stand.label.toLowerCase()) || q.includes(a.stand.id.toLowerCase()));
  const vendor = VENDORS.find((v) => q.includes(v.name.toLowerCase()));
  if (stand && vendor && (q.includes("swap") || q.includes("put") || q.includes("change") || q.includes("move"))) {
    if (vendor.category !== stand.stand.category) return `${vendor.name} is a ${vendor.category} partner and ${stand.stand.label} is a ${stand.stand.category} stand, so I left it alone.`;
    if (stand.vendorId === vendor.id) return `${vendor.name} is already at ${stand.stand.label} (fit ${stand.fit.toFixed(2)}). Nothing to change.`;
    swaps.push({ standId: stand.stand.id, vendorId: vendor.id });
    const r = plan.ranked[stand.stand.category].find((x) => x.vendorId === vendor.id);
    return `Done: ${stand.stand.label} now has ${vendor.name}. Its affinity for the ${plan.event.anchors.join(" + ")} crowd is ${r?.affinity.toFixed(2) ?? "unknown"}, against ${stand.affinity.toFixed(2)} for ${stand.vendorName}, which the plan had there.`;
  }
  if (stand) return `${stand.stand.label}: ${stand.vendorName}. ${stand.reason} Next best: ${stand.alternatives.slice(0, 3).map((x) => `${x.name} (${x.fit.toFixed(2)})`).join(", ")}.`;
  if (vendor) {
    const r = plan.ranked[vendor.category].find((x) => x.vendorId === vendor.id);
    const where = plan.assignments.filter((a) => a.vendorId === vendor.id).map((a) => a.stand.label);
    return `${vendor.name} scores ${r?.affinity.toFixed(2) ?? "n/a"} for tonight's crowd${where.length ? ` and is placed at ${where.join(", ")}` : " and is not placed tonight"}. Top driver: ${Object.entries(r?.drivers ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a"}.`;
  }
  if (q.includes("change") || q.includes("last night") || q.includes("diff")) {
    const ch = plan.assignments.filter((a) => a.previous);
    return `${ch.length} stands change from ${plan.previousEvent?.title ?? "the previous night"}: ${ch.slice(0, 6).map((a) => `${a.stand.label} ${a.previous!.name} → ${a.vendorName}`).join("; ")}. Biggest taste shift: ${plan.compare.slice(0, 3).map((c) => `${c.name} (${c.delta > 0 ? "+" : ""}${c.delta.toFixed(2)})`).join(", ")}.`;
  }
  if (q.includes("who") || q.includes("crowd") || q.includes("demograph")) {
    return `Tonight's crowd ${plan.summary.genderSkew === "balanced" ? "is balanced on gender" : plan.summary.genderSkew} and over-indexes on ${plan.summary.topAgeBand}. That comes from Qloo's demographic offsets for ${plan.event.anchors.join(" and ")}; they are relative skews, not shares.`;
  }
  const top = plan.assignments.slice().sort((a, b) => b.fit - a.fit).slice(0, 3);
  return `Plan for ${plan.event.title}: average traffic-weighted fit ${plan.summary.averageFit.toFixed(2)}, ${plan.summary.standsChanged} stands changed from last night. Strongest placements: ${top.map((a) => `${a.vendorName} at ${a.stand.label} (${a.fit.toFixed(2)})`).join(", ")}. Ask about any stand or vendor, or tell me to swap one.`;
}

export async function askAgent(question: string, plan: Plan): Promise<AgentReply> {
  const ledger = new Ledger();
  const swaps: AgentReply["swaps"] = [];
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: offlineAnswer(question, plan, swaps), ledger: plan.ledger, engine: "offline", swaps };
  }
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${planContext(plan)}\n\nOperator: ${question}` }];
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: SYSTEM,
      tools,
      messages,
      output_config: { effort: "low" },
    });
    if (res.stop_reason === "refusal") {
      return { text: "I can't help with that one.", ledger: ledger.entries, engine: "claude", swaps };
    }
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0 || res.stop_reason === "end_turn") {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      return { text, ledger: ledger.entries, engine: "claude", swaps };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      let content: string;
      try { content = await runTool(u.name, (u.input ?? {}) as Record<string, unknown>, plan, ledger, swaps); }
      catch (e) { content = JSON.stringify({ error: (e as Error).message }); }
      results.push({ type: "tool_result", tool_use_id: u.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "I ran out of steps before finishing. Try a narrower question.", ledger: ledger.entries, engine: "claude", swaps };
}
