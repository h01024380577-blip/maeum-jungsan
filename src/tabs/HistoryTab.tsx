import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Search, Trash2, Heart, Flower2, Cake, Star, FileSpreadsheet } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import BulkImportModal from '../components/BulkImportModal';
import ContactDetail from '../components/ContactDetail';

const eventIcon = (t: string) => {
  if (t === 'wedding') return <Heart size={14} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={14} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={14} className="text-amber-500 fill-amber-500" />;
  return <Star size={14} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string, custom?: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : (custom || '기타');

const safeDate = (d: string) => {
  try { if (!d) return '–'; const p = parseISO(d); return isNaN(p.getTime()) ? '–' : format(p, 'yy.MM.dd'); } catch { return '–'; }
};

export default function HistoryTab() {
  const { entries, removeEntry, contacts } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'given' | 'received'>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const filtered = entries.filter(e => {
    const s = search.toLowerCase();
    const matchSearch = !s || (e.targetName || '').toLowerCase().includes(s) || (e.location || '').toLowerCase().includes(s) || (e.relation || '').toLowerCase().includes(s);
    const matchFilter = filter === 'all' || (filter === 'given' ? e.type === 'EXPENSE' : e.type === 'INCOME');
    return matchSearch && matchFilter;
  });

  return (
    <div className="pb-24">
      <div className="px-5 pt-14 pb-4 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">전체 내역</h1>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length}건의 기록</p>
          </div>
          <button onClick={() => setImportOpen(true)} className="flex items-center space-x-1.5 bg-blue-50 text-blue-600 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors active:scale-95">
            <FileSpreadsheet size={14} />
            <span>CSV 불러오기</span>
          </button>
        </div>
      </div>

      <BulkImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />

      <div className="px-5 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
          <input type="text" placeholder="이름, 장소, 관계 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none text-sm placeholder:text-gray-300" />
        </div>

        {/* Filter */}
        <div className="flex space-x-2">
          {([['all', '전체'], ['given', '보낸'], ['received', '받은']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${filter === key ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.length > 0 ? filtered.map(e => (
            <div key={e.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group relative overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${e.type === 'INCOME' ? 'bg-blue-500' : 'bg-red-400'}`} />
              <div className="flex items-center space-x-3 pl-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                  {eventIcon(e.eventType)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${e.type === 'INCOME' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                      {e.type === 'INCOME' ? 'IN' : 'OUT'}
                    </span>
                    <button
                      onClick={() => { const c = contacts.find(c => c.id === e.contactId || c.name === e.targetName); if (c) setSelectedContactId(c.id); }}
                      className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                    >{e.targetName}</button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                    {safeDate(e.date)} · {eventLabel(e.eventType, e.customEventName)} {e.location ? `· ${e.location}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                    {e.type === 'INCOME' ? '+' : '-'}{e.amount.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-gray-300 font-medium">{e.relation}</p>
                </div>
                <button onClick={() => removeEntry(e.id)} className="p-1.5 text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )) : (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
              <p className="text-sm text-gray-300">검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {selectedContactId && (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto">
          <div className="max-w-[430px] mx-auto p-5">
            <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
