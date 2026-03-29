"use client";

import CalendarTab from "@/src/tabs/CalendarTab";
import Layout from "@/components/Layout";

export default function CalendarPage() {
  return (
    <Layout activeTab="calendar">
      <CalendarTab />
    </Layout>
  );
}
