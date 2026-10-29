import type { Metadata } from "next";
import VenueClient from "@/components/venue3d/VenueClient";

export const metadata: Metadata = { title: "Concourse · Climate Pledge Arena in 3D" };

export default function VenuePage() {
  return <VenueClient />;
}
