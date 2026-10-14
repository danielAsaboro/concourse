import { NextRequest, NextResponse } from "next/server";
import { askAgent } from "@/lib/agent/chat";
import { buildPlan } from "@/lib/agent/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; event?: string; overrides?: Record<string, string> };
  if (!body.question || !body.event) return NextResponse.json({ error: "question and event are required" }, { status: 400 });
  try {
    const plan = await buildPlan(body.event, body.overrides ?? {});
    const reply = await askAgent(body.question.slice(0, 1000), plan);
    return NextResponse.json(reply);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
