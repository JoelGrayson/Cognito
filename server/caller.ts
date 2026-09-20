import { headers } from "next/headers";
import { appRouter } from "./router";

/** The tRPC router called directly from server components, with the request's cookies. */
export async function serverTrpc() {
  return appRouter.createCaller({ headers: await headers() });
}
