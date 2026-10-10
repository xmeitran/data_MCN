import "./globals.css";

export const metadata = { title: "MCN OS — Network Management" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
