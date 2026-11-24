import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Pwa } from "@/components/shared/pwa";
export const metadata: Metadata = {
  title: {
    default: "سامانه مدیریت ساختمان دلتا",
    template: "%s | ساختمان دلتا",
  },
  description: "مدیریت امن و یکپارچه ساختمان دلتا در اردبیل",
  applicationName: "سامانه مدیریت ساختمان دلتا",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ساختمان دلتا",
  },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563EB",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa-IR" dir="rtl">
      <body>
        {children}
        <Pwa />
      </body>
    </html>
  );
}
