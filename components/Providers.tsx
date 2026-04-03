"use client";

import { useEffect } from "react";
import { useStore } from "@/src/store/useStore";

export default function Providers({ children }: { children: React.ReactNode }) {
  const { loadFromSupabase, isLoaded } = useStore();

  useEffect(() => {
    loadFromSupabase();
  }, [loadFromSupabase]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 font-medium">마음정산 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
