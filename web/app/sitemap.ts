import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/try", "/privacy", "/terms", "/support", "/imprint"].map((path) => ({ url: `${site.url}${path}` }));
}
