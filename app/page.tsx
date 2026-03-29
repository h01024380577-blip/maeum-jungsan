"use client";

import HomeTab from "@/src/tabs/HomeTab";
import Layout from "@/components/Layout";

export default function HomePage() {
  return (
    <Layout activeTab="home">
      <HomeTab />
    </Layout>
  );
}
