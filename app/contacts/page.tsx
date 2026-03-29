"use client";

import ContactsTab from "@/src/tabs/ContactsTab";
import Layout from "@/components/Layout";

export default function ContactsPage() {
  return (
    <Layout activeTab="contacts">
      <ContactsTab />
    </Layout>
  );
}
