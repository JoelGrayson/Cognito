import type { Metadata } from "next";
import Link from "next/link";
import { Worksheet } from "@/components/Worksheet";
import { listProviders } from "@/lib/providers";

export const metadata: Metadata = { title: "Mark my work · StructuredLearning.ai" };
export const dynamic = "force-dynamic";

export default async function WhiteboardPage() {
  return (
    <>
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← StructuredLearning.ai
        </Link>
        <p className="text-sm text-neutral-500">Write on a page, then have it marked</p>
      </header>
      <Worksheet providers={await listProviders()} />
    </>
  );
}
