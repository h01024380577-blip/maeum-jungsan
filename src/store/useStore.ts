import { create } from 'zustand';
import { supabase } from '../lib/supabase';
// next-auth 제거됨 - 토스 로그인으로 교체

export type EventType = 'wedding' | 'funeral' | 'birthday' | 'other';
export type TransactionType = 'INCOME' | 'EXPENSE';

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  kakaoId?: string;
  relation: string;
  avatar?: string;
  userId: string;
}

export interface EventEntry {
  id: string;
  contactId: string;
  eventType: EventType;
  type: TransactionType;
  date: string;
  location: string;
  targetName: string;
  account?: string;
  amount: number;
  relation: string;
  recommendationReason?: string;
  customEventName?: string;
  memo?: string;
  isIncome: boolean;
  createdAt: number;
  userId: string;
}

interface AppState {
  entries: EventEntry[];
  contacts: Contact[];
  feedback: any[];
  isLoaded: boolean;
  analysisResult: {
    data: Partial<EventEntry> | null;
    initialData: Partial<EventEntry> | null;
    showBottomSheet: boolean;
    isParsing: boolean;
    selectedImage: string | null;
  };
  loadFromSupabase: () => Promise<void>;
  addEntry: (entry: Omit<EventEntry, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, entry: Partial<EventEntry>) => Promise<void>;
  addContact: (contact: Omit<Contact, 'id' | 'userId'>) => Promise<string>;
  updateContact: (id: string, contact: Partial<Contact>) => Promise<void>;
  syncContacts: (contacts: Omit<Contact, 'id' | 'userId'>[]) => Promise<void>;
  addFeedback: (original: any, corrected: any) => void;
  bulkAddEntries: (entries: Omit<EventEntry, 'id' | 'createdAt' | 'userId'>[]) => Promise<void>;
  setAnalysisResult: (result: Partial<AppState['analysisResult']>) => void;
  resetAnalysis: () => void;
}

/**
 * 사용자 식별자 반환.
 * 카카오 로그인 시 → NextAuth session.user.id (기기 무관 동일 ID)
 * 미로그인 시 → localStorage DEVICE_ID (기기별 고유 ID, 하위 호환)
 */
async function getUserId(): Promise<string> {
  // 1순위: 토스 로그인 세션 (HttpOnly 쿠키 기반)
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const { userId } = await res.json();
      if (userId) return userId;
    }
  } catch {}

  // 2순위: 앱인토스 SDK 기기 고유 ID
  try {
    const { getDeviceId } = await import('@apps-in-toss/web-framework');
    const deviceId = await getDeviceId();
    if (deviceId) return deviceId;
  } catch {}

  // 3순위: localStorage DEVICE_ID (로컬 개발 fallback)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('heartbook-device-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('heartbook-device-id', id);
    return id;
  }
  return 'server';
}

// Supabase row → app type 변환
const toEntry = (row: any): EventEntry => ({
  id: row.id,
  contactId: row.contact_id || '',
  eventType: row.event_type,
  type: row.type,
  date: row.date,
  location: row.location || '',
  targetName: row.target_name,
  account: row.account || '',
  amount: row.amount,
  relation: row.relation || '',
  recommendationReason: row.recommendation_reason || '',
  customEventName: row.custom_event_name || '',
  memo: row.memo || '',
  isIncome: row.type === 'INCOME',
  createdAt: new Date(row.created_at).getTime(),
  userId: row.user_id,
});

const toContact = (row: any): Contact => ({
  id: row.id,
  name: row.name,
  phone: row.phone || '',
  kakaoId: row.kakao_id || '',
  relation: row.relation || '',
  avatar: row.avatar || '',
  userId: row.user_id,
});

export const useStore = create<AppState>()((set, get) => ({
  entries: [],
  contacts: [],
  feedback: [],
  isLoaded: false,
  analysisResult: {
    data: null,
    initialData: null,
    showBottomSheet: false,
    isParsing: false,
    selectedImage: null,
  },

  loadFromSupabase: async () => {
    try {
      const userId = await getUserId();
      const [entriesRes, contactsRes] = await Promise.all([
        supabase.from('entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('contacts').select('*').eq('user_id', userId),
      ]);

      set({
        entries: (entriesRes.data || []).map(toEntry),
        contacts: (contactsRes.data || []).map(toContact),
        isLoaded: true,
      });
    } catch (e) {
      console.error('Supabase load failed:', e);
      set({ isLoaded: true });
    }
  },

  addEntry: async (entry) => {
    const userId = await getUserId();
    let contactId = entry.contactId;
    if (!contactId) {
      const existing = get().contacts.find((c) => c.name === entry.targetName);
      if (existing) {
        contactId = existing.id;
      } else {
        contactId = await get().addContact({
          name: entry.targetName,
          relation: entry.relation || '지인',
          phone: '',
        });
      }
    }

    const { data, error } = await supabase.from('entries').insert({
      contact_id: contactId,
      event_type: entry.eventType,
      type: entry.type,
      date: entry.date,
      location: entry.location,
      target_name: entry.targetName,
      account: entry.account || '',
      amount: entry.amount,
      relation: entry.relation,
      recommendation_reason: entry.recommendationReason || '',
      custom_event_name: entry.customEventName || '',
      memo: entry.memo || '',
      user_id: userId,
    }).select().single();

    if (error) { console.error('Insert entry error:', JSON.stringify(error)); throw new Error(`Supabase insert failed: ${error.message} (code: ${error.code})`); }

    set((state) => ({
      entries: [toEntry(data), ...state.entries],
    }));
  },

  addContact: async (contact) => {
    const userId = await getUserId();
    const { data, error } = await supabase.from('contacts').insert({
      name: contact.name,
      phone: contact.phone || '',
      kakao_id: contact.kakaoId || '',
      relation: contact.relation || '',
      avatar: contact.avatar || '',
      user_id: userId,
    }).select().single();

    if (error) { console.error('Insert contact error:', JSON.stringify(error)); throw new Error(`Supabase contact insert failed: ${error.message} (code: ${error.code})`); }

    const newContact = toContact(data);
    set((state) => ({ contacts: [...state.contacts, newContact] }));
    return newContact.id;
  },

  updateContact: async (id, updatedFields) => {
    const updates: any = {};
    if (updatedFields.name !== undefined) updates.name = updatedFields.name;
    if (updatedFields.phone !== undefined) updates.phone = updatedFields.phone;
    if (updatedFields.relation !== undefined) updates.relation = updatedFields.relation;

    await supabase.from('contacts').update(updates).eq('id', id);

    set((state) => ({
      contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c),
    }));
  },

  syncContacts: async (newContacts) => {
    const existingNames = new Set(get().contacts.map(c => c.name));
    const filtered = newContacts.filter(c => !existingNames.has(c.name));
    for (const contact of filtered) {
      await get().addContact(contact);
    }
  },

  bulkAddEntries: async (newEntries) => {
    for (const entry of newEntries) {
      await get().addEntry(entry);
    }
  },

  removeEntry: async (id) => {
    await supabase.from('entries').delete().eq('id', id);
    set((state) => ({ entries: state.entries.filter(e => e.id !== id) }));
  },

  updateEntry: async (id, updatedFields) => {
    const updates: any = {};
    if (updatedFields.amount !== undefined) updates.amount = updatedFields.amount;
    if (updatedFields.date !== undefined) updates.date = updatedFields.date;
    if (updatedFields.location !== undefined) updates.location = updatedFields.location;
    if (updatedFields.eventType !== undefined) updates.event_type = updatedFields.eventType;
    if (updatedFields.type !== undefined) updates.type = updatedFields.type;
    if (updatedFields.memo !== undefined) updates.memo = updatedFields.memo;
    if (updatedFields.relation !== undefined) updates.relation = updatedFields.relation;

    await supabase.from('entries').update(updates).eq('id', id);

    set((state) => ({
      entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e),
    }));
  },

  addFeedback: (original, corrected) =>
    set((state) => ({
      feedback: [...state.feedback, { original, corrected, timestamp: Date.now() }],
    })),

  setAnalysisResult: (result) =>
    set((state) => ({
      analysisResult: { ...state.analysisResult, ...result },
    })),

  resetAnalysis: () =>
    set(() => ({
      analysisResult: {
        data: null,
        initialData: null,
        showBottomSheet: false,
        isParsing: false,
        selectedImage: null,
      },
    })),
}));
