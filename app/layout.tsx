import "./globals.css";

export const metadata = {
  title: "Plot Avenue",
  description: "Claim a building on the avenue. One payment, permanent spot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
