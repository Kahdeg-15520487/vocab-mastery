/**
 * Browser AI Worker — loads Qwen 3.5 0.8B via WebGPU in a background thread.
 *
 * Message protocol:
 *   Main → Worker:  { type: 'load' }
 *   Main → Worker:  { type: 'generate', prompt: string }  + MessageChannel port
 *   Main → Worker:  { type: 'unload' }
 *   Main → Worker:  { type: 'ping' }
 *
 *   Worker → Main (via postMessage):
 *     { type: 'status', status: string }
 *     { type: 'progress', loaded: number, total: number, fileCount: number }
 *     { type: 'ready' }
 *     { type: 'error', message: string }
 *
 *   Worker → Main (via MessageChannel port):
 *     { text: string }  — generation result
 */

// @ts-ignore — no type declarations for @huggingface/transformers worker context
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL_ID = 'onnx-community/Qwen3.5-0.8B-ONNX'

let generator: Awaited<ReturnType<typeof pipeline>> | null = null

function send(msg: Record<string, unknown>) {
  self.postMessage(msg)
}

// Aggregate progress across multiple file downloads
const fileProgress = new Map<string, { loaded: number; total: number }>()

function sendAggregateProgress() {
  let loaded = 0
  let total = 0
  for (const entry of fileProgress.values()) {
    loaded += entry.loaded
    total += entry.total
  }
  send({
    type: 'progress',
    loaded,
    total,
    fileCount: fileProgress.size,
  })
}

function handleProgress(evt: Record<string, unknown>) {
  if (!evt) return

  if (evt.status === 'progress_total' && Number.isFinite(evt.total)) {
    return
  }

  if (evt.status === 'progress') {
    const key = String(evt.file || evt.name || `file_${fileProgress.size}`)
    fileProgress.set(key, {
      loaded: Number(evt.loaded) || 0,
      total: Number(evt.total) || 0,
    })
    sendAggregateProgress()
    return
  }

  if (typeof evt.status === 'string') {
    send({ type: 'status', status: evt.status })
  }
}

async function handleLoad() {
  if (generator) {
    send({ type: 'ready' })
    return
  }

  try {
    send({ type: 'status', status: 'Checking WebGPU…' })

    if (!(navigator as any).gpu) {
      send({ type: 'error', message: 'WebGPU is not available. Use Chrome 113+ or Edge 113+.' })
      return
    }

    send({ type: 'status', status: 'Loading model…' })

    generator = await pipeline('text-generation', MODEL_ID, {
      device: 'webgpu',
      dtype: 'q4',
      progress_callback: handleProgress,
    })

    send({ type: 'ready' })
  } catch (err: any) {
    generator = null
    send({ type: 'error', message: err?.message || String(err) })
  }
}

async function generateText(prompt: string): Promise<string> {
  if (!generator) return ''

  try {
    // Build messages — try to parse as JSON array, otherwise wrap as user message
    let messages: Array<{ role: string; content: string }>
    try {
      const parsed = JSON.parse(prompt)
      if (Array.isArray(parsed)) {
        messages = parsed
      } else {
        throw new Error('not array')
      }
    } catch {
      messages = [
        { role: 'system', content: 'Reply with JSON only.' },
        { role: 'user', content: prompt },
      ]
    }

    const output = await (generator as any)(messages, {
      max_new_tokens: 200,
      temperature: 0.3,
      top_p: 0.9,
      do_sample: true,
      return_full_text: false,
    })

    let reply = ''
    const first = output?.[0]

    if (Array.isArray(first?.generated_text)) {
      const last = first.generated_text.at(-1)
      reply = last?.content || ''
    } else if (typeof first?.generated_text === 'string') {
      reply = first.generated_text
    } else if (typeof first?.generated_text === 'object' && first?.generated_text !== null) {
      reply = first.generated_text.content || first.generated_text.text || ''
    }

    console.log('[browser-ai-worker] reply:', reply.slice(0, 300))
    return reply.trim()
  } catch (err: any) {
    console.error('[browser-ai-worker] Generation failed:', err)
    return ''
  }
}

function handleUnload() {
  generator?.dispose()
  generator = null
  send({ type: 'status', status: 'Unloaded' })
}

// Message handler
self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  switch (type) {
    case 'load':
      await handleLoad()
      break
    case 'generate': {
      // Respond via MessageChannel port — robust against HMR / module re-init
      const port = e.ports[0]
      const t0 = performance.now()
      const text = await generateText(e.data.prompt)
      const dt = (performance.now() - t0).toFixed(0)
      console.log(`[browser-ai-worker] generation took ${dt}ms`)
      if (port) {
        port.postMessage({ text })
      } else {
        console.warn('[browser-ai-worker] NO PORT — falling back to self.postMessage')
        send({ type: 'result', text })
      }
      break
    }
    case 'unload':
      handleUnload()
      break
    case 'ping':
      send({ type: 'status', status: generator ? 'ready' : 'idle' })
      break
  }
}
