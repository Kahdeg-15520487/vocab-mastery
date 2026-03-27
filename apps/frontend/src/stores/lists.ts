import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { request } from '@/lib/api';

export interface StudyList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  isSystem: boolean;
  isPinned: boolean;
  wordCount: number;
  isOwner: boolean;
  owner: {
    id: string;
    username: string;
  } | null;
}

export interface ListWord {
  id: string;
  word: string;
  definition: string;
  cefrLevel: string;
  phoneticUs: string;
  addedAt: string;
}

export interface ListDetail extends StudyList {
  words: ListWord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const useListsStore = defineStore('lists', () => {
  const lists = ref<StudyList[]>([]);
  const currentList = ref<ListDetail | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const ownLists = computed(() => lists.value.filter((l) => l.isOwner));
  const sharedLists = computed(() => lists.value.filter((l) => !l.isOwner));
  const pinnedList = computed(() => lists.value.find((l) => l.isPinned));
  const systemLists = computed(() => lists.value.filter((l) => l.isSystem));
  const customLists = computed(() => lists.value.filter((l) => !l.isSystem));

  async function fetchLists() {
    loading.value = true;
    error.value = null;

    try {
      const data = await request<StudyList[]>('/lists');
      lists.value = data;
      return data;
    } catch (e: unknown) {
      error.value = (e as Error).message;
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchList(id: string, page = 1, limit = 50) {
    loading.value = true;
    error.value = null;

    try {
      const data = await request<ListDetail>(`/lists/${id}?page=${page}&limit=${limit}`);
      currentList.value = data;
      return data;
    } catch (e: unknown) {
      error.value = (e as Error).message;
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function createList(data: { name: string; description?: string; color?: string; icon?: string }) {
    try {
      const newList = await request<StudyList>('/lists', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      lists.value.push(newList);
      return newList;
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function updateList(id: string, data: Partial<{ name?: string; description?: string; color?: string; icon?: string }>) {
    try {
      const updatedList = await request<StudyList>(`/lists/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const index = lists.value.findIndex((l) => l.id === id);
      if (index !== -1) {
        lists.value[index] = { ...lists.value[index], ...updatedList };
      }
      return updatedList;
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function deleteList(id: string) {
    try {
      await request(`/lists/${id}`, { method: 'DELETE' });
      lists.value = lists.value.filter((l) => l.id !== id);
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function addWordToList(listId: string, wordId: string) {
    try {
      await request(`/lists/${listId}/words`, {
        method: 'POST',
        body: JSON.stringify({ wordId }),
      });
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function removeWordFromList(listId: string, wordId: string) {
    try {
      await request(`/lists/${listId}/words/${wordId}`, { method: 'DELETE' });
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function togglePin(listId: string, pinned: boolean) {
    try {
      await request(`/lists/${listId}/pin`, {
        method: 'PUT',
        body: JSON.stringify({ pinned }),
      });
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function shareList(listId: string, email: string) {
    try {
      await request(`/lists/${listId}/share`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function removeShare(listId: string, userId: string) {
    try {
      await request(`/lists/${listId}/share/${userId}`, { method: 'DELETE' });
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  return {
    lists,
    currentList,
    loading,
    error,
    ownLists,
    sharedLists,
    pinnedList,
    systemLists,
    customLists,
    fetchLists,
    fetchList,
    createList,
    updateList,
    deleteList,
    addWordToList,
    removeWordFromList,
    togglePin,
    shareList,
    removeShare,
  };
});
