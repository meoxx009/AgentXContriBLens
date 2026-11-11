import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { db } from "@/lib/db";
import StatsView from "@/components/views/StatsView";

export const metadata = {
  title: "Public Stats — ContribLens",
  description: "Real-time usage counters and metrics across ContribLens scans.",
};

export default function StatsPage() {
  const liveStats = db.getPublicStats();

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-textPrimary">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-24 pb-12 lg:pb-20 relative">
        <StatsView
          initialStats={{
            reposScanned: liveStats.reposScanned,
            findingsVerified: liveStats.findingsVerified,
            routesGenerated: liveStats.routesGenerated,
            contributorsGuided: liveStats.contributorsGuided,
            lastUpdated: liveStats.lastUpdated,
          }}
        />
      </main>

      <Footer />
    </div>
  );
}
