import type { BetterAuthClientPlugin } from "better-auth";
import type { chatgptPlugin } from "@/lib/chatgpt/plugin";

export function chatgptClient(): BetterAuthClientPlugin {
  return {
    id: "chatgpt",
    $InferServerPlugin: {} as ReturnType<typeof chatgptPlugin>,
    pathMethods: {
      "/sign-in/chatgpt/start": "POST",
      "/sign-in/chatgpt/poll": "POST",
      "/chatgpt/status": "GET",
      "/chatgpt/unlink": "POST",
    },
  };
}
