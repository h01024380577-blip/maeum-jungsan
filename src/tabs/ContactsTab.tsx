import React, { useState } from 'react';
import { Search, UserPlus, ArrowRight, TrendingUp, TrendingDown, User } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';
import ContactDetail from '../components/ContactDetail';

export default function ContactsTab() {
  const { contacts, entries, syncContacts } = useStore();
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'recent'>('name');

  const getBalance = (id: string) => {
    const ce = entries.filter(e => e.contactId === id);
    return ce.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0) - ce.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  };

  const getRecent = (id: string) => {
    const ce = entries.filter(e => e.contactId === id);
    return ce.length === 0 ? 0 : Math.max(...ce.map(e => new Date(e.date).getTime()));
  };

  const getCount = (id: string) => entries.filter(e => e.contactId === id).length;

  const filtered = contacts
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'balance') return getBalance(b.id) - getBalance(a.id);
      return getRecent(b.id) - getRecent(a.id);
    });

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { fetchContacts, FetchContactsPermissionError } = await import('@apps-in-toss/web-framework');

      // 권한 확인
      const permission = await fetchContacts.getPermission() as string;
      if (permission === 'denied' || permission === 'osPermissionDenied') {
        const result = await fetchContacts.openPermissionDialog();
        if (result === 'denied') {
          alert('연락처 접근 권한이 필요합니다. 설정에서 허용해 주세요.');
          return;
        }
      } else if (permission === 'notDetermined') {
        const result = await fetchContacts.openPermissionDialog();
        if (result === 'denied') {
          alert('연락처 접근 권한이 필요합니다.');
          return;
        }
      }

      // 연락처 전체 가져오기 (페이지네이션)
      const allContacts: { name: string; phone: string; relation: string }[] = [];
      let offset = 0;
      const size = 50;

      while (true) {
        const res = await fetchContacts({ size, offset });
        const items = res.result ?? [];
        for (const item of items) {
          if (item.name) {
            allContacts.push({
              name: item.name,
              phone: (item as any).phoneNumbers?.[0] ?? '',
              relation: '지인',
            });
          }
        }
        if (res.done || res.nextOffset == null) break;
        offset = res.nextOffset;
      }

      if (allContacts.length === 0) {
        alert('가져올 연락처가 없습니다.');
        return;
      }

      await syncContacts(allContacts);
      alert(`${allContacts.length}명의 연락처를 불러왔습니다.`);
    } catch (err: any) {
      console.error('연락처 불러오기 실패:', err);
      if (err?.name === 'FetchContactsPermissionError') {
        alert('연락처 접근 권한이 없습니다. 설정에서 허용해 주세요.');
      } else {
        alert(`연락처를 불러오는 데 실패했습니다: ${err?.message ?? ''}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (selectedContactId) {
    return (
      <div className="px-5 pt-14 pb-24">
        <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="px-5 pt-14 pb-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">연락처 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">{contacts.length}명의 연락처</p>
          </div>
          <button onClick={handleSync} disabled={isSyncing} className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center hover:bg-blue-100 transition-colors active:scale-95 disabled:opacity-50">
            {isSyncing ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <UserPlus size={18} />}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
          <input type="text" placeholder="이름으로 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none text-sm placeholder:text-gray-300" />
        </div>

        <div className="flex space-x-2">
          {([['name', '이름순'], ['balance', '수지순'], ['recent', '최근순']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${sortBy === key ? 'bg-blue-500 text-white' : 'bg-white text-gray-400 border border-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.map((c) => {
            const bal = getBalance(c.id);
            const cnt = getCount(c.id);
            return (
              <motion.div layout key={c.id} onClick={() => setSelectedContactId(c.id)}
                className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                  <div className="w-11 h-11 shrink-0 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                    <User size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{c.name}</h3>
                    <p className="text-[10px] text-gray-400 font-medium">{c.relation} · {cnt}건</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-black flex items-center justify-end ${bal >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                      {bal >= 0 ? <TrendingUp size={11} className="mr-1" /> : <TrendingDown size={11} className="mr-1" />}
                      {bal >= 0 ? '+' : ''}{bal.toLocaleString()}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-gray-200 group-hover:text-blue-500 transition-colors" />
                </div>
              </motion.div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mx-auto text-gray-300 mb-3"><User size={28} /></div>
              <p className="text-sm text-gray-300 font-medium">연락처가 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
