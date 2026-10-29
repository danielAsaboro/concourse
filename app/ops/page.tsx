import type { Metadata } from "next";
import Ops from "@/components/ops/Ops";
import NightNav from "@/components/night/NightNav";

export const metadata: Metadata = { title: "Concourse · Staffing, prep and merch for event night" };

export default function OpsPage() {
  return (
    <>
      <NightNav />
      <Ops />
    </>
  );
}
