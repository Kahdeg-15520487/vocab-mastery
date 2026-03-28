<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{
  active?: boolean
  duration?: number
  particleCount?: number
}>(), {
  active: false,
  duration: 3000,
  particleCount: 60,
})

const emit = defineEmits<{
  done: []
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let animationId: number | null = null
let particles: Particle[] = []
let startTime = 0

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'rect' | 'circle'
}

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#FF8C94', '#91EAE4', '#86E3CE', '#D4A5A5', '#F6D365',
]

function createParticles() {
  if (!canvas.value) return
  const w = canvas.value.width
  particles = []
  for (let i = 0; i < props.particleCount; i++) {
    particles.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    })
  }
}

function animate(timestamp: number) {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const elapsed = timestamp - startTime
  const fadeStart = (props.duration - 1000) // start fading 1s before end

  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)

  const fadeMultiplier = elapsed > fadeStart
    ? Math.max(0, 1 - (elapsed - fadeStart) / 1000)
    : 1

  let activeCount = 0
  for (const p of particles) {
    p.x += p.vx
    p.vy += 0.1 // gravity
    p.y += p.vy
    p.rotation += p.rotationSpeed
    p.vx *= 0.99 // air resistance
    p.opacity = fadeMultiplier

    if (p.y < canvas.value.height + 50 && p.opacity > 0.01) {
      activeCount++
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.globalAlpha = p.opacity
      ctx.fillStyle = p.color

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }
  }

  if (activeCount > 0 && elapsed < props.duration) {
    animationId = requestAnimationFrame(animate)
  } else {
    animationId = null
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
    emit('done')
  }
}

function startConfetti() {
  if (!canvas.value) return
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
  createParticles()
  if (animationId) cancelAnimationFrame(animationId)
  startTime = performance.now()
  animationId = requestAnimationFrame(animate)
}

watch(() => props.active, (val) => {
  if (val) startConfetti()
})

onMounted(() => {
  if (props.active) startConfetti()
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
})

defineExpose({ start: startConfetti })
</script>

<template>
  <canvas
    ref="canvas"
    class="fixed inset-0 pointer-events-none z-[200]"
  />
</template>
