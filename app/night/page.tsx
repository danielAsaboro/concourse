import type { Metadata } from "next";
import Night from "./Night";

export const metadata: Metadata = { title: "Concourse · Event night at Climate Pledge Arena" };

export default function NightPage() {
  return <Night />;
}
