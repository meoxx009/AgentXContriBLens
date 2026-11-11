import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/AppContext";

export const metadata: Metadata = {
  title: "ContribLens — Security findings → beginner pull requests",
  description:
    "Paste any public GitHub repo. Get verified findings, a plain-English explanation, and a beginner-ready PR plan with tests and skills.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark"
      style={{ backgroundColor: "#000000", color: "#F5F3ED", colorScheme: "dark" }}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                function handleDesync(msg) {
                  var text = String(msg || '');
                  if (
                    text.indexOf('__webpack_modules__') !== -1 ||
                    text.indexOf('Loading chunk') !== -1 ||
                    (text.indexOf('is not a function') !== -1 && text.indexOf('webpack') !== -1)
                  ) {
                    var key = '__cl_desync_reload';
                    var last = parseInt(sessionStorage.getItem(key) || '0', 10);
                    if (Date.now() - last > 5000) {
                      sessionStorage.setItem(key, String(Date.now()));
                      console.warn('[ContribLens] Webpack chunk desync caught, reloading with fresh bundle...');
                      window.location.reload();
                    }
                  }
                }
                window.addEventListener('error', function(e) {
                  handleDesync(e && (e.message || (e.error && e.error.message)));
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  handleDesync(e && e.reason && (e.reason.message || e.reason));
                });
              }
            `,
          }}
        />
      </head>
      <body
        style={{ backgroundColor: "#080809", color: "#F5F3ED" }}
        className="text-textPrimary antialiased selection:bg-electricTangerine selection:text-black min-h-screen relative"
      >
        {/* Global Reference Background (Single source of truth across all routes) */}
        <div className="app-reference-background" aria-hidden="true" />
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
