import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doneward",
    short_name: "Doneward",
    description: "A gentle, persistent task planner that turns deadlines into focused action.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ed",
    theme_color: "#31513f",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
