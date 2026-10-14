import { NextRequest, NextResponse } from "next/server";
import { askAgent } from "@/lib/agent/chat";
import { buildPlan } from "@/lib/agent/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { question?: unknown; event?: unknown; overrides?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 }); }
  if (typeof body.question !== "string" || typeof body.event !== "string" || !body.question.trim()) return NextResponse.json({ error: "question and event are required" }, { status: 400 });
  try {
    const plan = await buildPlan(body.event, body.overrides ?? {});
    const reply = await askAgent(body.question.slice(0, 1000), plan);
    return NextResponse.json(reply);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
