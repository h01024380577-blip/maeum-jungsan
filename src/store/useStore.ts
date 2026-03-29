import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  analysisResult: {
    data: Partial<EventEntry> | null;
    initialData: Partial<EventEntry> | null;
    showBottomSheet: boolean;
    isParsing: boolean;
    selectedImage: string | null;
  };
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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      entries: [],
      contacts: [],
      feedback: [],
      analysisResult: {
        data: null,
        initialData: null,
        showBottomSheet: false,
        isParsing: false,
        selectedImage: null,
      },
      addEntry: async (entry) => {
        let contactId = entry.contactId;
        if (!contactId) {
          const existingContact = get().contacts.find((c) => c.name === entry.targetName);
          if (existingContact) {
            contactId = existingContact.id;
          } else {
            contactId = await get().addContact({
              name: entry.targetName,
              relation: entry.relation || '지인',
              phone: '',
            });
          }
        }

        const id = Math.random().toString(36).substring(2, 9);
        const newEntry: EventEntry = {
          ...entry,
          id,
          contactId,
          userId: 'local-user',
          createdAt: Date.now(),
        };

        set((state) => ({
          entries: [newEntry, ...state.entries].sort((a, b) => b.createdAt - a.createdAt)
        }));
      },
      addContact: async (contact) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newContact: Contact = { ...contact, id, userId: 'local-user' };

        set((state) => ({
          contacts: [...state.contacts, newContact]
        }));
        return id;
      },
      updateContact: async (id, updatedFields) => {
        set((state) => ({
          contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c)
        }));
      },
      syncContacts: async (newContacts) => {
        const existingNames = new Set(get().contacts.map(c => c.name));
        const filteredNew = newContacts.filter(c => !existingNames.has(c.name));
        
        for (const contact of filteredNew) {
          await get().addContact(contact);
        }
      },
      bulkAddEntries: async (newEntries) => {
        for (const entry of newEntries) {
          await get().addEntry(entry);
        }
      },
      removeEntry: async (id) => {
        set((state) => ({
          entries: state.entries.filter(e => e.id !== id)
        }));
      },
      updateEntry: async (id, updatedFields) => {
        set((state) => ({
          entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e)
        }));
      },
      addFeedback: (original, corrected) =>
        set((state) => ({
          feedback: [
            ...state.feedback,
            { original, corrected, timestamp: Date.now() },
          ],
        })),
      setAnalysisResult: (result) =>
        set((state) => ({
          analysisResult: { ...state.analysisResult, ...result },
        })),
      resetAnalysis: () =>
        set((state) => ({
          analysisResult: {
            data: null,
            initialData: null,
            showBottomSheet: false,
            isParsing: false,
            selectedImage: null,
          },
        })),
    }),
    {
      name: 'heartbook-storage',
      version: 2,
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch (e) {
          // Fallback for Incognito mode where localStorage might be blocked or full
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
      }),
      partialize: (state) => ({
        entries: state.entries,
        contacts: state.contacts,
        feedback: state.feedback,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version === 0 && persistedState && persistedState.entries) {
          persistedState.entries = persistedState.entries.map((entry: any) => ({
            ...entry,
            type: entry.type || (entry.isIncome ? 'INCOME' : 'EXPENSE'),
          }));
        }
        if (version <= 1 && persistedState && persistedState.entries) {
          // Migration to version 2: ensure contactId exists
          persistedState.contacts = persistedState.contacts || [];
          persistedState.entries = persistedState.entries.map((entry: any) => {
            if (!entry.contactId) {
              // Try to find or create a contact for this entry
              let contact = persistedState.contacts.find((c: any) => c.name === entry.targetName);
              if (!contact) {
                contact = {
                  id: Math.random().toString(36).substring(2, 9),
                  name: entry.targetName,
                  relation: entry.relation || '지인'
                };
                persistedState.contacts.push(contact);
              }
              return { ...entry, contactId: contact.id };
            }
            return entry;
          });
        }
        return persistedState;
      },
    }
  )
);
