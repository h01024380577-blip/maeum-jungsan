"use client";

import StatisticsTab from "@/src/tabs/StatisticsTab";
import Layout from "@/components/Layout";

export default function StatsPage() {
  return (
    <Layout activeTab="stats">
      <StatisticsTab />
    </Layout>
  );
}
