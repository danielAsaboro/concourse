import { NextResponse } from "next/server";
import { EVENTS, FEATURED_EVENT_ID } from "@/lib/venue/events";
import { qlooMode } from "@/lib/qloo";

export async function GET() {
  return NextResponse.json({
    mode: qlooMode(),
    agent: process.env.ANTHROPIC_API_KEY ? "claude" : "offline",
    featured: FEATURED_EVENT_ID,
    events: EVENTS.map((e) => ({ id: e.id, title: e.title, kind: e.kind, date: e.date, anchors: e.anchors.map((a) => a.name) })),
  });
}
