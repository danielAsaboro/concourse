"use client";
// Dashboard state: events, tonight's plan, operator swaps, the agent conversation.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Plan, Assignment } from "@/lib/agent/plan";
import type { LedgerEntry } from "@/lib/qloo/types";
import { EVENTS } from "@/lib/venue/events";
import { vendorById } from "@/lib/venue/catalogue";

export type EventRow = { id: string; title: string; kind: string; date: string; anchors: string[]; attendance: number };
export type Msg = { id: number; role: "u" | "a"; text: string; engine?: string; ledger?: LedgerEntry[]; swaps?: { standId: string; vendorId: string }[]; error?: boolean };
export type Toast = { id: number; text: string; undo?: () => void };

const attendance = new Map(EVENTS.map((e) => [e.id, e.expectedAttendance]));

/** The backend's reason sentence quotes a driver share as a percentage; the UI never shows driver percentages. */
export function scrubDriverPercent(text: string) {
  return text.replace(/\b\d{1,3}% of that score comes from/g, "Most of that score comes from");
}

/** A plain-language reason for a placement, written from the plan's fields. */
export function reasonFor(a: Assignment, plan: Plan) {
  const pool = plan.ranked[a.stand.category] ?? [];
  const rank = [...pool].sort((x, y) => y.affinity - x.affinity).findIndex((r) => r.vendorId === a.vendorId) + 1;
  const top = Object.entries(a.drivers).sort((x, y) => y[1] - x[1])[0]?.[0];
  const v = vendorById.get(a.vendorId);
  const bits: string[] = [];
  if (rank > 0) bits.push(`${a.vendorName} ranks ${rank === 1 ? "first" : `${ordinal(rank)}`} of ${pool.length} ${a.stand.category} partners for tonight's crowd.`);
  if (top) bits.push(`${top} fans drive most of that score.`);
  if (a.stand.zone === "club") bits.push(v?.premium ? "It is a premium-tier partner, which suits the club." : "It is not a premium-tier partner, so its club score is discounted.");
  if (a.stand.zone === "upper" && v?.premium) bits.push("Premium partners score a little lower on the upper concourse.");
  return bits.join(" ");
}
function ordinal(n: number) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

export function useConcourse() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [mode, setMode] = useState<"live" | "mock" | "">("");
  const [engine, setEngine] = useState<"claude" | "offline" | "">("");
  const [featured, setFeatured] = useState("");
  const [eventId, setEventId] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [asking, setAsking] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const retry = useCallback(() => { setError(null); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    if (events.length) return;
    fetch("/api/events")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; })
      .then((d) => {
        setEvents(d.events.map((e: Omit<EventRow, "attendance">) => ({ ...e, attendance: attendance.get(e.id) ?? 0 })));
        setMode(d.mode); setEngine(d.agent); setFeatured(d.featured);
        setEventId((c) => c || d.featured || d.events[0]?.id || "");
      })
      .catch((e) => { setError(`Couldn't load the event list: ${e.message}`); setLoading(false); });
  }, [attempt, events.length]);

  const ov = useMemo(() => Object.entries(overrides).map(([k, v]) => `${k}:${v}`).join(","), [overrides]);
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    setLoading(true); setError(null);
    fetch(`/api/plan?event=${encodeURIComponent(eventId)}${ov ? `&overrides=${encodeURIComponent(ov)}` : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d as Plan; })
      .then((p) => { if (alive) setPlan(p); })
      .catch((e) => { if (alive) setError(`Couldn't build tonight's plan: ${e.message}`); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId, ov, attempt]);

  const say = useCallback((text: string, undo?: () => void) => {
    const id = ++seq.current;
    setToast({ id, text, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
  }, []);

  const switchEvent = useCallback((id: string) => {
    if (id === eventId) return;
    setEventId(id); setOverrides({}); setSelected(null); setMsgs([]);
  }, [eventId]);

  const swap = useCallback((standId: string, vendorId: string) => {
    const a = plan?.assignments.find((x) => x.stand.id === standId);
    const prevOverride = overrides[standId];
    setOverrides((o) => ({ ...o, [standId]: vendorId }));
    const name = vendorById.get(vendorId)?.name ?? vendorId;
    say(`${a?.stand.label ?? standId} now has ${name}`, () =>
      setOverrides((o) => { const n = { ...o }; if (prevOverride) n[standId] = prevOverride; else delete n[standId]; return n; }));
  }, [plan, overrides, say]);

  const resetSwaps = useCallback(() => { setOverrides({}); say("Restored the agent's plan"); }, [say]);

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || !plan) return;
    const uid = ++seq.current;
    setMsgs((m) => [...m, { id: uid, role: "u", text: question.trim() }]);
    setAsking(true);
    try {
      const r = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, event: plan.event.id, overrides }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? r.statusText);
      setMsgs((m) => [...m, { id: ++seq.current, role: "a", text: scrubDriverPercent(d.text), engine: d.engine, ledger: d.ledger, swaps: d.swaps }]);
      if (d.swaps?.length) {
        setOverrides((o) => { const n = { ...o }; for (const s of d.swaps) n[s.standId] = s.vendorId; return n; });
        setSelected(d.swaps[d.swaps.length - 1].standId);
      }
    } catch (e) {
      setMsgs((m) => [...m, { id: ++seq.current, role: "a", text: `The agent didn't answer: ${(e as Error).message}. Try again in a moment.`, error: true }]);
    } finally { setAsking(false); }
  }, [plan, overrides]);

  return {
    events, mode, engine, featured, eventId, switchEvent, plan, loading, error, retry, selected, setSelected,
    overrides, swap, resetSwaps, msgs, ask, asking, toast, dismissToast: () => setToast(null),
  };
}
export type Concourse = ReturnType<typeof useConcourse>;
