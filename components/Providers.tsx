"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Heart, Sparkles, Shield } from "lucide-react";
import { useStore } from "@/src/store/useStore";
import { tossLogin } from "@/src/lib/tossAuth";
import { apiFetch, setAuthToken } from "@/src/lib/apiClient";

const SKIP_ONBOARDING_PATHS = ['/terms', '/intro'];

function OnboardingScreen() {
  const { loadFromSupabase } = useStore();
  const [isLogging, setIsLogging] = useState(false);

  const handleStart = async () => {
    setIsLogging(true);
    try {
      const result = await tossLogin();
      if (!result) return;
      const res = await apiFetch('/api/auth/toss', {
        method: 'POST',
        body: JSON.stringify(result),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) setAuthToken(data.token);
        await loadFromSupabase();
      }
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[500] flex items-center justify-center">
      <div className="w-full max-w-[430px] h-screen flex flex-col items-center justify-between px-6 py-16">
        <div className="flex-1 flex flex-col items-center justify-center space-y-8 text-center">
          <div className="w-20 h-20 bg-blue-500 rounded-[28px] flex items-center justify-center shadow-lg shadow-blue-200">
            <Heart size={36} className="text-white fill-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">마음정산</h1>
            <p className="text-gray-400 mt-2 text-sm leading-relaxed">
              경조사 축의금·조의금을<br />AI로 스마트하게 관리하세요
            </p>
          </div>
          <div className="w-full space-y-3 text-left">
            {[
              { icon: Sparkles, title: 'AI 자동 분석', desc: '청첩장 링크·이미지로 정보 자동 입력' },
              { icon: Heart, title: '관계 관리', desc: '연락처별 경조사 내역 한눈에 확인' },
              { icon: Shield, title: '안전한 보관', desc: '내 데이터는 나만 볼 수 있어요' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-2xl">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <Icon size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={isLogging}
          className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-base shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isLogging ? '로그인 중...' : '토스로 시작하기'}
        </button>
      </div>
    </div>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const { loadFromSupabase, isLoaded, tossUserId } = useStore();
  const pathname = usePathname();

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

  const showOnboarding = !tossUserId && !SKIP_ONBOARDING_PATHS.includes(pathname);

  return (
    <>
      {children}
      {showOnboarding && <OnboardingScreen />}
    </>
  );
}
