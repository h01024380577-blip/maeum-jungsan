import React, { useState, useRef } from 'react';
import { Send, Sparkles, ArrowUpRight, ArrowDownLeft, Link as LinkIcon, Image as ImageIcon, Upload, X as CloseIcon, Heart, Flower2, Cake, Star, Plus, ChevronRight, Bell, Settings, Wallet, TrendingUp, LogIn, LogOut, User, Copy } from 'lucide-react';
import { useStore, EventEntry, EventType } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { tossLogin } from '@/src/lib/tossAuth';


// HTTP 환경에서도 동작하는 클립보드 복사
async function copyToClipboard(text: string): Promise<void> {
  // 앱인토스 환경
  if (isAppsInToss()) {
    const { setClipboardText } = await import('@apps-in-toss/web-framework');
    await (setClipboardText as any)(text);
    return;
  }
  // HTTPS 환경
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // HTTP fallback (execCommand)
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('copy failed');
}

// 앱인토스 WebView 환경 감지
function isAppsInToss(): boolean {
  return typeof window !== 'undefined' &&
    window.navigator.userAgent.includes('TossApp');
}

const eventIcon = (t: string, size = 14) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : '기타';

export default function HomeTab() {
  const { entries, addEntry, addFeedback, contacts, loadFromSupabase } = useStore();
  const [tossUserId, setTossUserId] = React.useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission | 'unsupported'>('default');
  const [parsedData, setParsedData] = useState<Partial<EventEntry> | null>(null);
  const [initialParsedData, setInitialParsedData] = useState<Partial<EventEntry> | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [lastClipboardText, setLastClipboardText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.userId) setTossUserId(d.userId);
    }).catch(() => {});
  }, []);

  const checkStatus = () => {
    if (!('Notification' in window)) setNotificationStatus('unsupported');
    else setNotificationStatus(Notification.permission);
  };

  React.useEffect(() => { checkStatus(); window.addEventListener('focus', checkStatus); return () => window.removeEventListener('focus', checkStatus); }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) { alert('알림 미지원 브라우저'); return; }
    const p = Notification.permission;
    if (p === 'denied') { alert('브라우저 설정에서 알림을 허용해 주세요.'); return; }
    if (p === 'granted') { alert('이미 허용됨!'); return; }
    try { const r = await Notification.requestPermission(); setNotificationStatus(r); } catch {}
  };

  React.useEffect(() => {
    const check = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        let text = '';
        if (isAppsInToss()) {
          const { getClipboardText } = await import('@apps-in-toss/web-framework');
          text = await getClipboardText();
        } else {
          text = await navigator.clipboard.readText();
        }
        if (text && text !== lastClipboardText && text.length > 10) {
          if (['결혼', '부고', '장례', '초대', '모십니다', '축하'].some(k => text.includes(k))) {
            setLastClipboardText(text); setInputText(text); handleParse(text);
          }
        }
      } catch {}
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [lastClipboardText, entries]);

  const totalGiven = entries.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const totalReceived = entries.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const balance = totalReceived - totalGiven;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { const b64 = reader.result as string; setSelectedImage(b64); handleParse({ type: 'image', data: b64 }); };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    const { openCamera } = await import('@apps-in-toss/web-framework');
    const r: any = await openCamera();
    if (r?.base64) { const d = `data:image/jpeg;base64,${r.base64}`; setSelectedImage(d); handleParse({ type: 'image', data: d }); }
  };

  const handleAlbumSelect = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    const { fetchAlbumPhotos } = await import('@apps-in-toss/web-framework');
    const r: any = await (fetchAlbumPhotos as any)({ limit: 1 });
    if (r?.photos?.[0]?.base64) { const d = `data:image/jpeg;base64,${r.photos[0].base64}`; setSelectedImage(d); handleParse({ type: 'image', data: d }); }
  };

  const handleParse = async (params?: { type: 'text' | 'url' | 'image'; data: string } | string) => {
    let type: 'text' | 'url' | 'image' = 'text';
    let data = '';
    if (typeof params === 'string') { data = params; }
    else if (params) { type = params.type; data = params.data; }
    else { type = inputUrl.trim() ? 'url' : 'text'; data = type === 'url' ? inputUrl : inputText; }
    if (!data?.trim()) return;

    setIsParsing(true);
    try {
      // 모든 분석을 서버 API Route로 위임 (NEXT_PUBLIC 키 노출 제거)
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
      const result = await res.json();

      if (!result.success) {
        if (result.reason === 'rate_limit') {
          toast.error('무료 분석 한도를 모두 이용하셨습니다. 잠시 후 다시 시도해 주세요.');
        } else {
          toast.error('분석 실패. 직접 입력을 이용해 주세요.');
        }
        setSelectedImage(null); setInputUrl(''); setInputText('');
        setIsParsing(false);
        return;
      }

      const parsed = result.data;

      let amt = 100000, reason = "통계 기반 평균";
      const past = entries.find(e => e.targetName === parsed.targetName && e.eventType === parsed.eventType);
      if (past) {
        try { const d = parseISO(past.date); if (!isNaN(d.getTime())) { amt = past.amount * Math.pow(1.03, Math.max(0, 2026 - d.getFullYear())); reason = "물가 상승 반영"; } } catch {}
      } else {
        const r = parsed.relation || "";
        if (r.includes('가족') || r.includes('친척')) amt = 200000;
        else if (r.includes('절친')) amt = 150000;
        else if (r.includes('동료') || r.includes('친구')) amt = 100000;
        else if (r.includes('지인')) amt = 50000;
        if (parsed.location?.includes('호텔')) amt += 50000;
        reason = "관계 기반 추천";
      }
      amt = Math.round(amt / 10000) * 10000;

      const finalData = { ...parsed, date: parsed.date || format(new Date(), 'yyyy-MM-dd'), amount: parsed.amount || amt, recommendationReason: reason, type: parsed.type || 'EXPENSE', isIncome: parsed.type === 'INCOME', relation: parsed.relation || '친구' };
      setParsedData(finalData); setInitialParsedData(finalData); setShowBottomSheet(true);
    } catch (err: any) {
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`);
      setSelectedImage(null); setInputUrl(''); setInputText('');
    } finally { setIsParsing(false); }
  };

  const handleManualEntry = () => {
    const d: any = { targetName: '', date: format(new Date(), 'yyyy-MM-dd'), eventType: 'wedding', location: '', relation: '', amount: 50000, type: 'EXPENSE', isIncome: false, recommendationReason: "직접 입력" };
    setParsedData(d); setInitialParsedData(null); setShowBottomSheet(true);
  };

  const sendTestPush = async () => {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (!sub) { alert('알림 권한을 먼저 허용해 주세요.'); return; } await fetch('/api/test-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) }); } catch { alert('실패'); }
  };

  const handleSave = async (fd: any) => {
    if (initialParsedData && JSON.stringify(initialParsedData) !== JSON.stringify(fd)) addFeedback(initialParsedData, fd);
    try {
      await addEntry({
        contactId: fd.contactId, eventType: ['wedding', 'funeral', 'birthday', 'other'].includes(fd.eventType) ? fd.eventType : 'other',
        type: fd.isIncome ? 'INCOME' : 'EXPENSE', date: fd.date, location: fd.location || '', targetName: fd.targetName || '',
        amount: Number(fd.amount) || 0, relation: fd.relation || '', isIncome: !!fd.isIncome, memo: fd.memo || '',
        account: fd.account || '', recommendationReason: fd.recommendationReason || '', customEventName: fd.customEventName || '',
      });
      if (isAppsInToss()) {
        const { generateHapticFeedback } = await import('@apps-in-toss/web-framework');
        generateHapticFeedback({ type: 'success' });
      }
      toast.success('저장 완료!');

      // 계좌번호가 있으면 토스 송금 안내
      if (fd.account && fd.account.trim() && fd.type !== 'INCOME') {
        const goToTransfer = window.confirm('토스로 송금하시겠습니까?\n계좌번호가 클립보드에 복사됩니다.');
        if (goToTransfer) {
          try {
            await copyToClipboard(fd.account);
            // 토스 앱 송금 화면으로 이동
            window.location.href = 'supertoss://send';
          } catch {
            toast.error('토스 앱을 열 수 없습니다.');
          }
        }
      }
      if (isAppsInToss()) {
        const { setSecureScreen } = await import('@apps-in-toss/web-framework');
        (setSecureScreen as any)(false);
      }
      setShowBottomSheet(false); setInputText(''); setInputUrl(''); setSelectedImage(null); setParsedData(null); setInitialParsedData(null);
    } catch (err: any) {
      console.error('Save failed:', err);
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`);
    }
  };

  const recentEntries = entries.slice(0, 3);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-5 pt-14 pb-6 bg-white">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2.5">
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">마음정산 AI</h1>
            <button onClick={sendTestPush} className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors"><Bell size={18} /></button>
            <button onClick={requestNotificationPermission} className={`p-1.5 transition-colors ${notificationStatus === 'granted' ? 'text-green-500' : notificationStatus === 'denied' ? 'text-red-400' : 'text-gray-300 hover:text-gray-500'}`}>
              <Settings size={18} />
            </button>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
            <Sparkles size={18} className="text-blue-500" />
          </div>
        </div>

        {/* 로그인 상태 */}
        {tossUserId ? (
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center"><User size={14} className="text-blue-500" /></div>
              <span className="text-xs font-bold text-gray-600">로그인됨</span>
            </div>
            <button onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              setTossUserId(null);
            }} className="text-[11px] text-gray-400 font-medium flex items-center space-x-1 hover:text-gray-600">
              <LogOut size={12} /><span>로그아웃</span>
            </button>
          </div>
        ) : (
          <button onClick={async () => {
            const result = await tossLogin();
            if (!result) return;
            const res = await fetch('/api/auth/toss', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(result),
            });
            if (res.ok) {
              const { userId } = await res.json();
              setTossUserId(userId);
              await loadFromSupabase();
            }
          }} className="w-full mb-4 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-[0.98] transition-all">
            <span>토스로 시작하기</span>
          </button>
        )}

        {/* Hero Title */}
        <div className="text-center mb-8">
          <h2 className="text-[28px] font-black text-gray-900 tracking-tight">스마트 분석</h2>
          <p className="text-sm text-gray-400 mt-1">링크나 이미지만으로 경조사 정보를 자동 입력하세요</p>
        </div>

        {/* Summary Cards */}
        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 mb-2">
            <div className="bg-blue-50 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <ArrowDownLeft size={11} className="text-blue-500" />
                <span className="text-[9px] font-bold text-blue-400 uppercase">받음</span>
              </div>
              <p className="text-base font-black text-blue-600">{(totalReceived / 10000).toFixed(0)}<span className="text-[10px] font-bold text-blue-400">만</span></p>
            </div>
            <div className="bg-red-50 rounded-2xl p-3 text-center">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <ArrowUpRight size={11} className="text-red-400" />
                <span className="text-[9px] font-bold text-red-400 uppercase">보냄</span>
              </div>
              <p className="text-base font-black text-red-500">{(totalGiven / 10000).toFixed(0)}<span className="text-[10px] font-bold text-red-400">만</span></p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 text-center border border-gray-100">
              <div className="flex items-center justify-center space-x-1 mb-1">
                <Wallet size={11} className="text-gray-400" />
                <span className="text-[9px] font-bold text-gray-400 uppercase">합계</span>
              </div>
              <p className={`text-base font-black ${balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{balance >= 0 ? '+' : ''}{(balance / 10000).toFixed(0)}<span className="text-[10px] font-bold text-gray-400">만</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="px-5 pt-4 space-y-3">
        {/* URL Input Card */}
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 space-y-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <LinkIcon size={16} className="text-blue-500" />
            </div>
            <span className="text-sm font-bold text-gray-800">링크 업로드</span>
          </div>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2.5">
            <input
              type="text" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://mcard.kakao.com/..."
              className="min-w-0 flex-1 px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-300 border border-gray-100"
            />
            <button
              onClick={() => handleParse({ type: 'url', data: inputUrl })}
              disabled={isParsing || !inputUrl.trim()}
              className={`shrink-0 px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-1.5 whitespace-nowrap ${
                isParsing || !inputUrl.trim() ? 'bg-gray-100 text-gray-300 border border-gray-100' : 'bg-blue-500 text-white shadow-md shadow-blue-200'
              }`}
            >
              {isParsing && inputUrl.trim() ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Sparkles size={14} /><span>분석하기</span></>}
            </button>
          </div>
        </div>

        {/* Image Upload Card */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="bg-white rounded-[24px] p-8 shadow-sm border-2 border-dashed border-gray-200 flex flex-col items-center justify-center space-y-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group"
        >
          {selectedImage ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center animate-pulse">
                <Sparkles size={28} className="text-white" />
              </div>
              <p className="text-sm font-bold text-blue-600">이미지 분석 중...</p>
              <p className="text-[11px] text-blue-400">잠시만 기다려 주세요</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <ImageIcon size={32} />
              </div>
              <div className="text-center">
                <p className="text-base font-black text-gray-800">이미지 업로드</p>
                <p className="text-xs text-gray-400 mt-1">여기를 클릭하거나 이미지를 드래그하여 업로드</p>
              </div>
              <div className="flex items-center space-x-1.5 text-[9px] font-bold text-gray-400 bg-gray-50 px-3.5 py-1.5 rounded-full tracking-wider">
                <Upload size={10} />
                <span>이미지 업로드</span>
              </div>
            </>
          )}
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        </div>

        {/* Text Input Card */}
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center">
                <Send size={16} className="text-gray-400" />
              </div>
              <span className="text-sm font-bold text-gray-800">텍스트 붙여넣기</span>
            </div>
            {inputText && <button onClick={() => setInputText('')} className="text-gray-300 hover:text-gray-500"><CloseIcon size={14} /></button>}
          </div>
          <textarea
            value={inputText} onChange={(e) => setInputText(e.target.value)}
            placeholder="텍스트를 붙여넣으세요..."
            className="w-full h-20 p-3.5 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 resize-none transition-all placeholder:text-gray-300 border border-gray-100"
          />
          {inputText.trim() && (
            <button onClick={() => handleParse({ type: 'text', data: inputText })} disabled={isParsing} className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center space-x-2">
              {isParsing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Sparkles size={14} className="text-blue-400" /><span>텍스트 분석하기</span></>}
            </button>
          )}
        </div>

        {/* Manual Entry */}
        <button onClick={handleManualEntry} className="w-full bg-white rounded-[24px] p-4 shadow-sm border border-gray-100 flex items-center justify-between group hover:shadow-md transition-all active:scale-[0.98]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
              <Plus size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">직접 입력하기</p>
              <p className="text-[11px] text-gray-400">AI 분석 없이 모든 정보를 직접 입력</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
        </button>

        {/* Recent Activity */}
        {recentEntries.length > 0 && (
          <div className="pt-3 space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">최근 내역</h3>
            {recentEntries.map(e => (
              <div key={e.id} className="bg-white px-4 py-3 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                    {eventIcon(e.eventType)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{e.targetName}</p>
                    <p className="text-[10px] text-gray-400">{eventLabel(e.eventType)}</p>
                  </div>
                </div>
                <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                  {e.type === 'INCOME' ? '+' : '-'}{e.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <AnimatePresence>
        {showBottomSheet && parsedData && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBottomSheet(false)} className="fixed inset-0 bg-black/40 z-[60]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }} className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-[28px] px-4 py-5 sm:p-6 z-[70] shadow-2xl overflow-x-hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-black text-gray-900">분석 결과 확인</h3>
                <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center">{eventIcon(parsedData.eventType || 'other')}</div>
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-y-auto pb-2 no-scrollbar">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button onClick={() => setParsedData({...parsedData, type: 'EXPENSE', isIncome: false})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${parsedData.type === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>
                    <ArrowUpRight size={12} /><span>보냄 (OUT)</span>
                  </button>
                  <button onClick={() => setParsedData({...parsedData, type: 'INCOME', isIncome: true})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${parsedData.type === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                    <ArrowDownLeft size={12} /><span>받음 (IN)</span>
                  </button>
                </div>

                <Field label="이름" type="contact" value={parsedData.targetName} ai={!!initialParsedData?.targetName} onChange={(v: string, cid?: string) => setParsedData({...parsedData, targetName: v, contactId: cid})} contacts={contacts} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="날짜" type="date" value={parsedData.date} ai={!!initialParsedData?.date} onChange={(v: string) => setParsedData({...parsedData, date: v})} />
                  <Field label="종류" type="select" value={parsedData.eventType} ai={!!initialParsedData?.eventType} options={['wedding', 'funeral', 'birthday', 'other']} onChange={(v: string) => setParsedData({...parsedData, eventType: v as EventType})} />
                </div>
                {parsedData.eventType === 'other' && <Field label="행사명" placeholder="돌잔치, 개업식 등" value={parsedData.customEventName} onChange={(v: string) => setParsedData({...parsedData, customEventName: v})} />}
                <Field label="장소" value={parsedData.location} ai={!!initialParsedData?.location} onChange={(v: string) => setParsedData({...parsedData, location: v})} />
                <Field label="관계" value={parsedData.relation} onChange={(v: string) => setParsedData({...parsedData, relation: v})} />

                {/* Amount */}
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{parsedData.recommendationReason}</span>
                    <span className="text-[8px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-full">AI 추천</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="number" step="10000" value={parsedData.amount} onChange={(e) => setParsedData({...parsedData, amount: Number(e.target.value)})} className="flex-1 bg-transparent text-2xl font-black text-blue-700 outline-none" />
                    <span className="text-base font-bold text-blue-500">원</span>
                  </div>
                  <div className="flex space-x-1.5 sm:space-x-2 mt-3">
                    {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map(b => (
                      <button key={b.l} onClick={() => setParsedData({...parsedData, amount: Math.max(0, (parsedData.amount || 0) + b.d)})} className="flex-1 py-2 bg-white/70 hover:bg-white rounded-lg text-[10px] font-bold text-blue-600 border border-blue-100 transition-colors active:scale-95 min-w-0">{b.l}</button>
                    ))}
                  </div>
                </div>
                {/* 계좌번호 + 복사 버튼 */}
                <div className="space-y-1 relative">
                  <div className="flex items-center justify-between ml-0.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">계좌번호</label>
                    {initialParsedData?.account && <span className="text-[8px] font-bold text-blue-500 flex items-center"><Sparkles size={7} className="mr-0.5" /> AI</span>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="text" value={parsedData.account || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParsedData({...parsedData, account: e.target.value})} className={`flex-1 p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${initialParsedData?.account ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
                    {parsedData.account && parsedData.account.trim() && (
                      <button onClick={async () => {
                        try {
                          await copyToClipboard(parsedData.account || '');
                          toast.success('계좌번호가 복사되었습니다');
                        } catch { toast.error('복사 실패'); }
                      }} className="px-3 py-3 bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 active:scale-95 transition-all shrink-0">
                        <Copy size={12} /><span>복사</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button onClick={() => handleSave(parsedData)} disabled={!parsedData.targetName?.trim()} className={`w-full py-4 rounded-2xl font-bold text-base mt-4 active:scale-[0.98] transition-all ${!parsedData.targetName?.trim() ? 'bg-gray-100 text-gray-300' : 'bg-blue-500 text-white shadow-lg shadow-blue-200'}`}>
                저장하기
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', options = [], ai = false, contacts = [], placeholder = '' }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1 relative">
      <div className="flex items-center justify-between ml-0.5">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
        {ai && <span className="text-[8px] font-bold text-blue-500 flex items-center"><Sparkles size={7} className="mr-0.5" /> AI</span>}
      </div>
      {type === 'select' ? (
        <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`}>
          {options.map((o: string) => <option key={o} value={o}>{eventLabel(o)}</option>)}
        </select>
      ) : type === 'contact' ? (
        <div className="relative">
          <input type="text" value={value || ''} placeholder={placeholder} onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 200)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
          {show && contacts.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-32 overflow-y-auto">
              {contacts.filter((c: any) => c.name.toLowerCase().includes((value || '').toLowerCase())).map((c: any) => (
                <button key={c.id} onClick={() => onChange(c.name, c.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-medium">{c.name} <span className="text-[10px] text-gray-400 ml-1">{c.relation}</span></button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <input type={type} value={value || ''} placeholder={placeholder} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
      )}
    </div>
  );
}
