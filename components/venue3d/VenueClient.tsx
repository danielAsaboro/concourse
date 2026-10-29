"use client";
import dynamic from "next/dynamic";

const VenueApp = dynamic(() => import("./VenueApp"), { ssr: false });
export default function VenueClient() {
  return <VenueApp />;
}
