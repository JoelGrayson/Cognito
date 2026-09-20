import { subjectFrom } from "@/lib/subjects";
import { Whiteboard } from "./Whiteboard";

export default async function WhiteboardPage({ searchParams }: PageProps<"/dev/whiteboard">) {
  const { subject } = await searchParams;
  return <Whiteboard subject={subjectFrom(typeof subject === "string" ? subject : null)} />;
}
