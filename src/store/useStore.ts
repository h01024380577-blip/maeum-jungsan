import { create } from 'zustand';
import { apiFetch, clearAuthToken } from '@/src/lib/apiClient';

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
  tossUserId: string | null;
  tossUserName: string | null;
  notificationsEnabled: boolean;
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
  removeContact: (id: string) => Promise<void>;
  syncContacts: (contacts: Omit<Contact, 'id' | 'userId'>[]) => Promise<void>;
  addFeedback: (original: any, corrected: any) => void;
  bulkAddEntries: (entries: Omit<EventEntry, 'id' | 'createdAt' | 'userId'>[]) => Promise<void>;
  clearData: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAnalysisResult: (result: Partial<AppState['analysisResult']>) => void;
  resetAnalysis: () => void;
}


export const useStore = create<AppState>()((set, get) => ({
  entries: [],
  contacts: [],
  feedback: [],
  isLoaded: false,
  tossUserId: null,
  tossUserName: null,
  notificationsEnabled: false,
  analysisResult: {
    data: null,
    initialData: null,
    showBottomSheet: false,
    isParsing: false,
    selectedImage: null,
  },

  // API Route 기반 데이터 로드 (로그인 상태에서만)
  loadFromSupabase: async () => {
    try {
      // 로그인 여부 먼저 확인
      const meRes = await apiFetch('/api/auth/me');
      if (!meRes.ok) {
        // 비로그인: 데이터 비우고 로드 완료
        set({ entries: [], contacts: [], tossUserId: null, tossUserName: null, notificationsEnabled: false, isLoaded: true });
        return;
      }
      const me = await meRes.json();
      if (me.needsRelogin) {
        clearAuthToken();
        set({ entries: [], contacts: [], tossUserId: null, tossUserName: null, notificationsEnabled: false, isLoaded: true });
        return;
      }
      set({
        tossUserId: me.userId ?? null,
        tossUserName: me.name ?? null,
        notificationsEnabled: me.notificationsEnabled ?? false,
      });
      const [entriesRes, contactsRes] = await Promise.all([
        apiFetch('/api/entries').then(r => r.ok ? r.json() : { entries: [] }),
        apiFetch('/api/contacts').then(r => r.ok ? r.json() : { contacts: [] }),
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
    const res = await apiFetch('/api/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Entry 저장 실패');
    }
    const { entry: saved, contact: newContact } = await res.json();
    set(state => {
      // 새로 생성된 contact가 있고 아직 store에 없으면 추가
      const contacts = newContact && !state.contacts.find(c => c.id === newContact.id)
        ? [...state.contacts, newContact]
        : state.contacts;
      return { entries: [saved, ...state.entries], contacts };
    });
  },

  removeEntry: async (id) => {
    await apiFetch(`/api/entries?id=${id}`, { method: 'DELETE' });
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
  },

  updateEntry: async (id, updatedFields) => {
    await apiFetch(`/api/entries?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e),
    }));
  },

  addContact: async (contact) => {
    const res = await apiFetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(contact),
    });
    if (!res.ok) throw new Error('Contact 저장 실패');
    const { contact: saved, id } = await res.json();
    set(state => ({ contacts: [...state.contacts, saved] }));
    return id;
  },

  updateContact: async (id, updatedFields) => {
    await apiFetch(`/api/contacts?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c),
    }));
  },

  removeContact: async (id) => {
    await apiFetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
    set(state => ({ contacts: state.contacts.filter(c => c.id !== id) }));
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

  clearData: () => {
    clearAuthToken();
    set({ entries: [], contacts: [], feedback: [], tossUserId: null, tossUserName: null, notificationsEnabled: false, isLoaded: true });
  },

  setNotificationsEnabled: (enabled: boolean) =>
    set({ notificationsEnabled: enabled }),

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
