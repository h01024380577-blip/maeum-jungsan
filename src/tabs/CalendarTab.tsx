import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useStore } from '../store/useStore';
import { format, isSameDay, parseISO } from 'date-fns';
import { Heart, Flower2, Cake, Star, MapPin } from 'lucide-react';

const eventIcon = (t: string, size = 12) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

export default function CalendarTab() {
  const { entries } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const getDateEntries = (date: Date) => entries.filter(e => {
    try { return e.date && isSameDay(parseISO(e.date), date); } catch { return false; }
  });

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const dayEvents = getDateEntries(date);
    if (dayEvents.length === 0) return null;
    return (
      <div className="flex justify-center space-x-0.5 mt-0.5">
        {dayEvents.slice(0, 3).map((e, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.type === 'INCOME' ? '#3b82f6' : '#ef4444' }} />
        ))}
      </div>
    );
  };

  const selectedDayEvents = getDateEntries(selectedDate);

  return (
    <div className="pb-24">
      <div className="px-5 pt-14 pb-4 bg-white">
        <h1 className="text-[22px] font-black text-gray-900 tracking-tight">경조사 달력</h1>
        <p className="text-xs text-gray-400 mt-0.5">날짜를 선택해서 일정을 확인하세요</p>
      </div>

      <div className="px-5 pt-4 space-y-4">
        <div className="bg-white p-4 rounded-[24px] shadow-sm border border-gray-100">
          <Calendar
            onChange={(v) => setSelectedDate(v as Date)}
            value={selectedDate}
            tileContent={tileContent}
            formatDay={(locale, date) => format(date, 'd')}
            calendarType="gregory"
          />
        </div>

        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            {format(selectedDate, 'M월 d일')} 일정 ({selectedDayEvents.length})
          </h3>
          {selectedDayEvents.length > 0 ? (
            selectedDayEvents.map(e => (
              <div key={e.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                    {eventIcon(e.eventType, 16)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{e.targetName}</p>
                    <div className="flex items-center space-x-1 mt-0.5">
                      {e.location && <><MapPin size={10} className="text-gray-300" /><p className="text-[10px] text-gray-400">{e.location}</p></>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                    {e.type === 'INCOME' ? '+' : '-'}{e.amount.toLocaleString()}원
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium">{e.relation}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-200 text-center">
              <p className="text-sm text-gray-300 font-medium">일정이 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
