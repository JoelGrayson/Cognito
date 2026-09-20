import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Worksheet } from "@/components/Worksheet";
import { Button } from "@/components/ui/button";
import { listProviders } from "@/lib/providers";

export const metadata: Metadata = { title: "Mark my work · Cognito" };
export const dynamic = "force-dynamic";

export default async function WhiteboardPage() {
  return (
    <>
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/">
            <ArrowLeft aria-hidden="true" />
            Cognito
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Write on a page, then have it marked</p>
      </header>
      <Worksheet providers={await listProviders()} />
    </>
  );
}
