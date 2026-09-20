import { describe, expect, it } from "vitest";
import { videoIdFrom } from "@/lib/youtube";

describe("videoIdFrom", () => {
  it("reads watch and short URLs", () => {
    expect(videoIdFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe("dQw4w9WgXcQ");
    expect(videoIdFrom("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoIdFrom("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("ignores everything that is not a single video", () => {
    expect(videoIdFrom("https://www.youtube.com/playlist?list=PL123")).toBeNull();
    expect(videoIdFrom("https://www.youtube.com/@channel")).toBeNull();
    expect(videoIdFrom("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBeNull();
    expect(videoIdFrom("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoIdFrom("not a url")).toBeNull();
  });
});
