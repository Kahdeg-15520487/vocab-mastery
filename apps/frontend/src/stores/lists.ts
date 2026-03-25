import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch lists');
      const data = await response.json();
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${id}?page=${page}&limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch list');
      const data = await response.json();
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create list');
      }

      const newList = await response.json();
      lists.value.push(newList);
      return newList;
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function updateList(id: string, data: Partial<{ name?: string; description?: string; color?: string; icon?: string }>) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update list');
      }

      const updatedList = await response.json();
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete list');
      }
      lists.value = lists.value.filter((l) => l.id !== id);
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function addWordToList(listId: string, wordId: string) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${listId}/words`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ wordId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add word');
      }
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function removeWordFromList(listId: string, wordId: string) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${listId}/words/${wordId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove word');
      }
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function togglePin(listId: string, pinned: boolean) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${listId}/pin`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ pinned }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update pin status');
      }
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function shareList(listId: string, email: string) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${listId}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to share list');
      }
    } catch (e: unknown) {
      error.value = (e as Error).message;
      throw e;
    }
  }

  async function removeShare(listId: string, userId: string) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/lists/${listId}/share/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove share');
      }
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
