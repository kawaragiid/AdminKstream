import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: {
    default: "AdminKstream",
    template: "%s | AdminKstream",
  },
  description:
    "Panel admin terintegrasi untuk mengelola konten, pengguna, dan analitik Kstream.",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={`${inter.variable} bg-slate-950 text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
