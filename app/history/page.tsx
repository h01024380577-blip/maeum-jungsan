"use client";

import HistoryTab from "@/src/tabs/HistoryTab";
import Layout from "@/components/Layout";

export default function HistoryPage() {
  return (
    <Layout activeTab="history">
      <HistoryTab />
    </Layout>
  );
}
