import { create } from 'zustand';

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


async function getUserId(): Promise<string> {
  // 1순위: 토스 로그인 쿠키 확인
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const { userId } = await res.json();
      if (userId) return userId;
    }
  } catch {}

  // 2순위: 앱인토스 SDK 기기 ID
  try {
    const { getDeviceId } = await import('@apps-in-toss/web-framework');
    const deviceId = await getDeviceId();
    if (deviceId) return deviceId;
  } catch {}

  // 3순위: localStorage fallback
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('heartbook-device-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('heartbook-device-id', id);
    return id;
  }
  return 'server';
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const userId = await getUserId();
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

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

  // API Route 기반 데이터 로드 (Supabase 완전 제거)
  loadFromSupabase: async () => {
    try {
      const [entriesRes, contactsRes] = await Promise.all([
        fetch('/api/entries', { headers: await getAuthHeaders() }).then(r => r.ok ? r.json() : { entries: [] }),
        fetch('/api/contacts', { headers: await getAuthHeaders() }).then(r => r.ok ? r.json() : { contacts: [] }),
      ]);
      set({
        entries: entriesRes.entries ?? [],
        contacts: contactsRes.contacts ?? [],
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  addEntry: async (entry) => {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Entry 저장 실패');
    }
    const { entry: saved } = await res.json();
    set(state => ({ entries: [saved, ...state.entries] }));
  },

  removeEntry: async (id) => {
    await fetch(`/api/entries?id=${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
  },

  updateEntry: async (id, updatedFields) => {
    await fetch(`/api/entries?id=${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e),
    }));
  },

  addContact: async (contact) => {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(contact),
    });
    if (!res.ok) throw new Error('Contact 저장 실패');
    const { contact: saved, id } = await res.json();
    set(state => ({ contacts: [...state.contacts, saved] }));
    return id;
  },

  updateContact: async (id, updatedFields) => {
    await fetch(`/api/contacts?id=${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c),
    }));
  },

  syncContacts: async (newContacts) => {
    const existing = new Set(get().contacts.map(c => c.name));
    for (const c of newContacts.filter(c => !existing.has(c.name))) {
      await get().addContact(c);
    }
  },

  bulkAddEntries: async (entries) => {
    for (const e of entries) await get().addEntry(e);
  },

  addFeedback: (original, corrected) =>
    set(state => ({
      feedback: [...state.feedback, { original, corrected, timestamp: Date.now() }],
    })),

  setAnalysisResult: (result) =>
    set(state => ({
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
