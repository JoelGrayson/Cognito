import type { Metadata } from "next";
import { SettingsForm } from "@/components/SettingsForm";

export const metadata: Metadata = {
  title: "Settings · Cognition",
};

export default function SettingsPage() {
  return <SettingsForm />;
}
