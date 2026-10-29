import type { Metadata } from "next";
import DashboardApp from "@/components/dashboard/App";

export const metadata: Metadata = { title: "Concourse · Dashboard" };

export default function Dashboard() {
  return <DashboardApp />;
}
