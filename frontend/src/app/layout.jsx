import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { ChromeGate } from "@/components/ChromeGate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  style: ["normal", "italic"],
  variable: "--font-serif-display",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: false,
});

export const metadata = {
  title: "TRACE-X",
  description: "Multi-source investigative analytics platform",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={[inter.variable, newsreader.variable, jetbrainsMono.variable].join(" ")}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var s=localStorage.getItem("tracex.theme");var day=s?s==="day":window.matchMedia("(prefers-color-scheme: light)").matches;if(day)document.documentElement.setAttribute("data-theme","day");}catch(e){}})();',
          }}
        />
      </head>
      <body>
        <ChromeGate>{children}</ChromeGate>
      </body>
    </html>
  );
}
