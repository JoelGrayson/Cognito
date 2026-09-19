import { NextResponse } from "next/server";
import { listProviders } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProviders());
}
