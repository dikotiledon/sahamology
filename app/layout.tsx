import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sahamology",
  description: "Stock Analysis Dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

import Navbar from "./components/Navbar";
import PasswordGate from "./components/PasswordGate";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.body.classList.add('light-theme');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`antialiased`}
      >
        <PasswordGate>
          <Navbar />
          {children}
        </PasswordGate>
      </body>
    </html>
  );
}
