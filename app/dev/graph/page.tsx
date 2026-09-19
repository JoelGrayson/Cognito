import type { Metadata } from "next";
import { DevGraph } from "./DevGraph";

export const metadata: Metadata = {
  title: "Dev: TopicGraph",
  robots: { index: false },
};

// Developer playground for <TopicGraph>. Not linked from anywhere.
export default function DevGraphPage() {
  return <DevGraph />;
}
