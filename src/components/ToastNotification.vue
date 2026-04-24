<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-vue-next'

const props = defineProps({
  id: { type: Number, required: true },
  type: { type: String, default: 'info' },
  title: { type: String, default: '' },
  message: { type: String, required: true },
  duration: { type: Number, default: 4000 },
})

const emit = defineEmits(['close'])

const visible = ref(true)
const leaving = ref(false)

let timer = null

function close() {
  leaving.value = true
  setTimeout(() => emit('close', props.id), 200)
}

function getIcon() {
  if (props.type === 'success') return CheckCircle
  if (props.type === 'error') return AlertCircle
  return Info
}

onMounted(() => {
  if (props.duration > 0) {
    timer = setTimeout(close, props.duration)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Transition name="toast">
    <div v-if="visible" class="toast" :class="[`toast--${type}`, { 'toast--leaving': leaving }]">
      <div class="toast-icon"><component :is="getIcon()" :size="20" stroke-width="2" /></div>
      <div class="toast-content">
        <strong v-if="title">{{ title }}</strong>
        <p>{{ message }}</p>
      </div>
      <button class="toast-close" @click="close"><X :size="16" stroke-width="2" /></button>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  min-width: 300px;
  max-width: 400px;
  font-size: 0.9rem;
}

.toast--success { border-left: 4px solid var(--success); }
.toast--success .toast-icon { color: var(--success); }

.toast--error { border-left: 4px solid var(--error); }
.toast--error .toast-icon { color: var(--error); }

.toast--info { border-left: 4px solid var(--primary); }
.toast--info .toast-icon { color: var(--primary); }

.toast-icon { flex-shrink: 0; display: flex; }
.toast-content { flex: 1; }
.toast-content strong { display: block; margin-bottom: 2px; }
.toast-content p { font-size: 0.85rem; color: var(--text-muted); margin: 0; }

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px;
  display: flex;
  border-radius: 4px;
  flex-shrink: 0;
}
.toast-close:hover { background: var(--border); color: var(--text); }

.toast-enter-active { animation: toast-slide-in 0.25s ease; }
.toast-leave-active { animation: toast-slide-out 0.2s ease forwards; }

@keyframes toast-slide-in {
  from { transform: translateX(120%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes toast-slide-out {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(120%); opacity: 0; }
}
</style>