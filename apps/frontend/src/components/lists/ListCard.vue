<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { StudyList } from '@/stores/lists'

const router = useRouter()
const props = defineProps<{
  list: StudyList
  pinned?: boolean
}>()

function openList() {
  router.push(`/lists/${props.list.id}`)
}

</script>

<template>
  <div
    @click="openList"
    class="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
    :style="{ borderLeft: `4px solid ${list.color}` }"
  >
    <div class="flex items-start gap-3">
      <div class="text-2xl">{{ list.icon }}</div>
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-slate-800 truncate">{{ list.name }}</h3>
        <p v-if="list.description" class="text-sm text-slate-500 truncate">
          {{ list.description }}
        </p>
      </div>
      <div v-if="pinned" class="text-amber-500">
        📌
      </div>
    </div>
    
    <div class="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>{{ list.wordCount }} words</span>
      <span v-if="!list.isOwner" class="text-slate-400">
        Shared by {{ list.owner?.username }}
      </span>
    </div>
  </div>
</template>
