import type { Metadata } from "next";
import Night from "./Night";
import NightNav from "@/components/night/NightNav";

export const metadata: Metadata = { title: "Concourse · Event night at Climate Pledge Arena" };

export default function NightPage() {
  return (
    <>
      <NightNav />
      <Night />
    </>
  );
}
