import React from 'react';
import { ArrowLeft, User, Heart, Flower2, Cake, Star, ArrowUpRight, ArrowDownLeft, Calendar, MapPin } from 'lucide-react';
import { useStore, EventType } from '../store/useStore';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

const eventIcon = (t: EventType, size = 14) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string, custom?: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : (custom || '기타');

const safeDate = (d: string) => {
  try { const p = parseISO(d); return isNaN(p.getTime()) ? '–' : format(p, 'yyyy. MM. dd'); } catch { return '–'; }
};

export default function ContactDetail({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const { contacts, entries } = useStore();
  const contact = contacts.find(c => c.id === contactId);
  const ce = entries.filter(e => e.contactId === contactId);

  if (!contact) return null;

  const given = ce.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const received = ce.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const balance = received - given;
  const total = given + received || 1;

  return (
    <div className="space-y-5 pb-20">
      <button onClick={onBack} className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors active:scale-95">
        <ArrowLeft size={18} />
        <span className="text-sm font-bold">뒤로</span>
      </button>

      {/* Profile */}
      <div className="bg-white p-7 rounded-[28px] shadow-sm border border-gray-100 flex flex-col items-center space-y-3">
        <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
          <User size={40} />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-gray-900">{contact.name}</h2>
          <p className="text-xs font-bold text-blue-500 mt-0.5">{contact.relation}</p>
        </div>
      </div>

      {/* Balance */}
      <div className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
        <div className="text-center space-y-1.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{contact.name}님과의 마음 정산</p>
          <motion.h2 key={balance} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`text-4xl font-black tracking-tight ${balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
            {balance >= 0 ? '+' : ''}{balance.toLocaleString()}<span className="text-lg ml-1">원</span>
          </motion.h2>
          <span className={`inline-block px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${balance >= 0 ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'}`}>
            {balance >= 0 ? 'Surplus' : 'Deficit'}
          </span>
        </div>

        {/* Bar */}
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(given / total) * 100}%` }} transition={{ duration: 0.6 }} className="h-full bg-red-400 rounded-l-full" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(received / total) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="h-full bg-blue-500 rounded-r-full" />
          </div>
          <div className="flex justify-between">
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">보낸 (OUT)</p>
              <p className="text-sm font-black text-red-500">{given.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold text-gray-400 uppercase">받은 (IN)</p>
              <p className="text-sm font-black text-blue-600">{received.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">경조사 내역 ({ce.length})</h3>
        {ce.length > 0 ? ce.map(entry => (
          <div key={entry.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${entry.type === 'EXPENSE' ? 'bg-red-50' : 'bg-blue-50'}`}>
                {entry.type === 'EXPENSE' ? <ArrowUpRight size={16} className="text-red-500" /> : <ArrowDownLeft size={16} className="text-blue-600" />}
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  {eventIcon(entry.eventType)}
                  <h4 className="text-sm font-bold text-gray-900">{eventLabel(entry.eventType, entry.customEventName)}</h4>
                </div>
                <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 font-medium mt-0.5">
                  <Calendar size={9} /><span>{safeDate(entry.date)}</span>
                  {entry.location && <><span className="text-gray-200">·</span><MapPin size={9} /><span>{entry.location}</span></>}
                </div>
              </div>
            </div>
            <p className={`text-sm font-black ${entry.type === 'EXPENSE' ? 'text-red-500' : 'text-blue-600'}`}>
              {entry.type === 'EXPENSE' ? '-' : '+'}{entry.amount.toLocaleString()}원
            </p>
          </div>
        )) : (
          <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-300">내역이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
