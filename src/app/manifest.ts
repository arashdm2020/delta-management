import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "سامانه مدیریت ساختمان دلتا",
    short_name: "ساختمان دلتا",
    description: "مدیریت اختصاصی ساختمان دلتا، اردبیل",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    lang: "fa-IR",
    dir: "rtl",
    background_color: "#F0F7FF",
    theme_color: "#2563EB",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
