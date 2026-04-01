<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'

const authStore = useAuthStore()
const progressStore = useProgressStore()
const show = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const generating = ref(false)
const imageUrl = ref<string | null>(null)

const stats = computed(() => progressStore.dashboard?.stats)
const streak = computed(() => progressStore.dashboard?.streak)

function open() {
  show.value = true
  nextTick(() => generateCard())
}

function close() {
  show.value = false
  imageUrl.value = null
}

async function generateCard() {
  if (!canvasRef.value || !stats.value) return
  generating.value = true

  const canvas = canvasRef.value
  const W = 600
  const H = 380
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#1e1b4b')
  grad.addColorStop(0.5, '#312e81')
  grad.addColorStop(1, '#1e1b4b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Decorative circles
  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#818cf8'
  ctx.beginPath(); ctx.arc(80, 60, 120, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(520, 320, 100, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1

  // App name
  ctx.fillStyle = '#c7d2fe'
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.fillText('VOCAB MASTER', 24, 30)

  // Username
  ctx.fillStyle = '#e0e7ff'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText(authStore.user?.username || 'Learner', 24, 65)

  // Subtitle
  ctx.fillStyle = '#a5b4fc'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('My Vocabulary Progress', 24, 88)

  // Streak flame
  const s = streak.value
  if (s) {
    ctx.font = '32px system-ui, sans-serif'
    ctx.fillText('🔥', 24, 135)
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.fillText(`${s.current}`, 65, 133)
    ctx.fillStyle = '#a5b4fc'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText('day streak', 65, 152)
  }

  // XP & Level
  if (stats.value) {
    ctx.fillStyle = '#c4b5fd'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillText(`Level ${stats.value.level}`, 200, 123)
    ctx.fillStyle = '#818cf8'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(`${stats.value.totalXp.toLocaleString()} XP`, 200, 143)
  }

  // Stats grid - 4 boxes
  const boxY = 170
  const boxH = 80
  const boxes = [
    { label: 'Words Learned', value: stats.value?.totalWordsLearned ?? 0, color: '#34d399' },
    { label: 'Mastered', value: stats.value?.totalWordsMastered ?? 0, color: '#818cf8' },
    { label: 'Sessions', value: stats.value?.totalSessions ?? 0, color: '#fbbf24' },
    { label: 'Favorites', value: stats.value?.favoriteCount ?? 0, color: '#f472b6' },
  ]

  boxes.forEach((box, i) => {
    const x = 24 + (i % 2) * 288
    const y = boxY + Math.floor(i / 2) * (boxH + 12)
    const w = 272

    // Box background
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, x, y, w, boxH, 12)
    ctx.fill()

    // Left accent
    ctx.fillStyle = box.color
    roundRect(ctx, x, y, 4, boxH, 2)
    ctx.fill()

    // Value
    ctx.fillStyle = '#e0e7ff'
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillText(String(box.value), x + 16, y + 35)

    // Label
    ctx.fillStyle = '#94a3b8'
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(box.label, x + 16, y + 58)
  })

  // Footer
  ctx.fillStyle = '#6366f1'
  ctx.font = '11px system-ui, sans-serif'
  const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  ctx.fillText(`Generated ${today}`, 24, H - 20)
  ctx.fillStyle = '#4f46e5'
  ctx.fillText('vocab-master.app', W - 130, H - 20)

  imageUrl.value = canvas.toDataURL('image/png')
  generating.value = false
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function download() {
  if (!imageUrl.value) return
  const a = document.createElement('a')
  a.href = imageUrl.value
  a.download = `vocab-master-progress-${new Date().toISOString().slice(0,10)}.png`
  a.click()
}

defineExpose({ open })
</script>

<template>
  <!-- Modal -->
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="close">
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">Share Your Progress</h3>
          <button @click="close" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
        </div>

        <div class="flex justify-center mb-4">
          <canvas ref="canvasRef" class="rounded-xl max-w-full" />
        </div>

        <div v-if="imageUrl" class="flex justify-center">
          <button @click="download" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2">
            <span>Download Image</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
