<template>
  <div class="app" :data-theme="theme">
    <!-- Header -->
    <header class="header anim-slide-down">
      <div class="header-inner">
        <div class="logo">
          <img src="/favicon.png" alt="Farmacia Tepa" class="logo-icon" />
          <div>
            <h1>Farmacia Tepa</h1>
            <p class="logo-sub">Convertidor XML → PDF</p>
          </div>
        </div>
        <button class="theme-toggle" @click="toggleTheme" :title="theme === 'dark' ? 'Modo claro' : 'Modo oscuro'">
          <Sun v-if="theme === 'dark'" :size="18" stroke-width="2" />
          <Moon v-else :size="18" stroke-width="2" />
        </button>
      </div>
    </header>

    <main class="main">
      <!-- FT Letters banner -->
      <img src="./assets/FT_LETTERS.png" alt="Farmacia Tepa" class="ft-letters anim-fade-up" />

      <!-- Step 1: Sucursal selector -->
      <section class="card step-card anim-fade-up">
        <div class="step-header">
          <div class="step-num">1</div>
          <div>
            <h2 class="step-title">Selecciona la sucursal</h2>
            <p class="step-sub">¿Desde qué sucursal estás generando este comprobante?</p>
          </div>
          <div v-if="sucursal" class="sucursal-badge">
            <MapPin :size="13" stroke-width="2.5" />
            {{ SUCURSALES.find(s => s.id === sucursal)?.label }}
          </div>
        </div>
        <div class="sucursal-grid">
          <button
            v-for="(s, index) in SUCURSALES"
            :key="s.id"
            class="suc-chip"
            :class="{ 'suc-chip--active': sucursal === s.id }"
            :style="{ animationDelay: (index * 40 + 100) + 'ms' }"
            @click="sucursal = s.id"
          >{{ s.label }}</button>
        </div>
      </section>

      <!-- Step 2: Upload zone -->
      <Transition name="fade-up">
      <section v-if="sucursal" class="card upload-card step2-card" :class="{ dragging }">
        <div class="step-header step-header--top">
          <div class="step-num">2</div>
          <div>
            <h2 class="step-title">Carga el archivo XML</h2>
            <p class="step-sub">Arrastra o selecciona tu CFDI 4.0</p>
          </div>
        </div>
        <div
          class="drop-zone"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
          @click="$refs.fileInput.click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".xml"
            class="hidden-input"
            @change="onFileSelect"
          />
          <div class="drop-icon" :class="dragging ? 'drop-icon--dragging' : 'drop-icon--idle'">
            <ArrowDownToLine v-if="dragging" :size="48" stroke-width="1.5" />
            <FolderOpen v-else :size="48" stroke-width="1.5" />
          </div>
          <p class="drop-title">
            {{ dragging ? 'Suelta el archivo aquí' : 'Selecciona o arrastra un archivo XML' }}
          </p>
          <p class="drop-sub">Solo archivos .xml · procesado localmente</p>
          <button class="btn btn-outline" @click.stop="$refs.fileInput.click()">
            Seleccionar archivo
          </button>
        </div>

        <div v-if="fileName" class="file-badge">
          <span class="file-badge-icon"><Paperclip :size="16" stroke-width="2" /></span>
          <span>{{ fileName }}</span>
          <button class="clear-btn" @click="reset" title="Limpiar"><X :size="15" stroke-width="2.5" /></button>
        </div>
      </section>
      </Transition>

      <!-- Error -->
      <Transition name="shake">
        <div v-if="error" class="alert alert-error" role="alert">
          <span class="alert-icon"><AlertCircle :size="20" stroke-width="2" /></span>
          <div>
            <strong>Error al procesar el archivo</strong>
            <p>{{ error }}</p>
          </div>
        </div>
      </Transition>

      <!-- Preview + Actions -->
      <Transition name="fade-up">
        <section v-if="factura" id="preview-section" class="card preview-card">
        <div class="preview-header">
          <div>
            <h2>Factura parseada</h2>
            <p class="preview-sub">Revisa los datos antes de generar el PDF</p>
          </div>
          <div class="action-btns">
            <button class="btn btn-secondary" @click="openPreview" :disabled="generating">
              <Eye :size="16" stroke-width="2" />
              <span>Vista previa</span>
            </button>
            <button class="btn btn-primary" @click="download" :disabled="generating">
              <Download v-if="!generating && pdfStatus !== 'ready'" :size="16" stroke-width="2" />
              <Loader2 v-else-if="generating || pdfStatus === 'generating'" :size="16" stroke-width="2" class="spin" />
              <span v-if="generating || pdfStatus === 'generating'">Generando…</span>
              <span v-else>Descargar PDF</span>
            </button>
          </div>
          <!-- PDF Status Badge -->
          <div v-if="pdfStatus !== 'idle'" class="pdf-status" :class="'pdf-status--' + pdfStatus">
            <CheckCircle v-if="pdfStatus === 'ready'" :size="14" stroke-width="2" />
            <AlertTriangle v-else-if="pdfStatus === 'error'" :size="14" stroke-width="2" />
            <span class="pdf-status-text">
              <template v-if="pdfStatus === 'generating'">Generando PDF...</template>
              <template v-else-if="pdfStatus === 'ready'">PDF listo para descargar</template>
              <template v-else-if="pdfStatus === 'downloaded'">PDF descargado</template>
              <template v-else-if="pdfStatus === 'error'">Error al generar</template>
            </span>
          </div>
        </div>

        <!-- Invoice summary -->
        <div class="invoice-summary">
          <div class="summary-row">
            <div class="info-block">
              <label>Número de factura</label>
              <strong>{{ factura.numero }}</strong>
            </div>
            <div class="info-block">
              <label>Fecha</label>
              <strong>{{ fmtDate(factura.fecha) }}</strong>
            </div>
            <div class="info-block" v-if="factura.fechaVencimiento">
              <label>Vencimiento</label>
              <strong>{{ fmtDate(factura.fechaVencimiento) }}</strong>
            </div>
            <div class="info-block">
              <label>Moneda</label>
              <strong>{{ factura.moneda }}</strong>
            </div>
          </div>

          <div class="parties-grid">
            <div class="party-box">
              <div class="party-label">Emisor</div>
              <p class="party-name">{{ factura.emisor.nombre }}</p>
              <p v-if="factura.emisor.nif">NIF/CIF: {{ factura.emisor.nif }}</p>
              <p v-if="factura.emisor.direccion">{{ factura.emisor.direccion }}</p>
              <p v-if="factura.emisor.codigoPostal || factura.emisor.ciudad">
                {{ factura.emisor.codigoPostal }} {{ factura.emisor.ciudad }}
              </p>
            </div>
            <div class="party-box">
              <div class="party-label">Receptor</div>
              <p class="party-name">{{ factura.receptor.nombre }}</p>
              <p v-if="factura.receptor.nif">NIF/CIF: {{ factura.receptor.nif }}</p>
              <p v-if="factura.receptor.direccion">{{ factura.receptor.direccion }}</p>
              <p v-if="factura.receptor.codigoPostal || factura.receptor.ciudad">
                {{ factura.receptor.codigoPostal }} {{ factura.receptor.ciudad }}
              </p>
            </div>
          </div>

          <!-- Lines table -->
          <div class="table-wrapper">
            <table class="lines-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Concepto</th>
                  <th class="num">Cant.</th>
                  <th class="num">Precio Unit.</th>
                  <th class="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in factura.lineas" :key="l.numero">
                  <td class="center">{{ l.numero }}</td>
                  <td>{{ l.concepto }}</td>
                  <td class="num">{{ fmtNum(l.cantidad) }}</td>
                  <td class="num">{{ fmt(l.precioUnitario) }}</td>
                  <td class="num">{{ fmt(l.importe) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Progress bar -->
          <div v-if="generating" class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ animationDuration: progressDuration + 'ms' }"></div>
            </div>
            <span class="progress-text">{{ progressText }}</span>
          </div>

          <!-- Totals -->
          <div class="totals-box">
            <div class="totals-row">
              <span>SubTotal</span>
              <span>{{ fmt(factura.totales.subtotal || factura.totales.baseImponible) }}</span>
            </div>
            <div class="totals-row" v-if="factura.totales.descuento">
              <span>Descuento</span>
              <span class="text-error">-{{ fmt(factura.totales.descuento) }}</span>
            </div>
            <template v-if="factura.totales.impuestos && factura.totales.impuestos.length">
              <div class="totals-row totals-row--impuesto" v-for="(imp, index) in factura.totales.impuestos" :key="index">
                <span class="impuesto-label">{{ imp.tipo }} {{ imp.tasa }}%</span>
                <span class="impuesto-cuota">{{ fmt(imp.cuota) }}</span>
              </div>
            </template>
            <template v-else>
              <div class="totals-row" v-if="factura.totales.baseImponible">
                <span>Base IVA ({{ Math.round(factura.totales.porcentajeIVA) }}%)</span>
                <span>{{ fmt(factura.totales.baseImponible) }}</span>
              </div>
              <div class="totals-row" v-if="factura.totales.cuotaIVA">
                <span>IVA ({{ Math.round(factura.totales.porcentajeIVA) }}%)</span>
                <span>{{ fmt(factura.totales.cuotaIVA) }}</span>
              </div>
            </template>
            <div class="totals-row total-row">
              <span>TOTAL</span>
              <span>{{ fmt(factura.totales.total) }}</span>
            </div>
          </div>
        </div>
      </section>
      </Transition>

      <!-- Historial -->
      <section class="card hist-card">
        <div class="hist-header" @click="toggleHistorial" :class="{ 'hist-header--clickable': historial.length }">
          <div class="hist-title-row">
            <Clock :size="18" stroke-width="2" />
            <h2 class="hist-title">Historial reciente</h2>
            <span v-if="historial.length" class="hist-count">{{ historial.length }}</span>
          </div>
          <div class="hist-header-actions">
            <button v-if="historial.length" class="btn-ghost btn-ghost--danger" @click.stop="clearHistorial">
              <Trash2 :size="14" stroke-width="2" />
              Limpiar todo
            </button>
            <ChevronDown :size="20" stroke-width="2" class="hist-chevron" :class="{ 'hist-chevron--open': historialExpanded }" />
          </div>
        </div>

        <div class="hist-content" :class="{ 'hist-content--open': historialExpanded }">
          <div>
            <!-- Empty placeholder -->
            <div v-if="!historial.length" class="hist-empty">
              <div class="hist-empty-visual">
                <div class="empty-illustration">
                  <div class="empty-folder"></div>
                  <div class="empty-file"></div>
                  <div class="empty-file empty-file--alt"></div>
                  <div class="empty-sparkle"></div>
                  <div class="empty-sparkle empty-sparkle--2"></div>
                </div>
              </div>
              <p class="hist-empty-title">Sin historial aún</p>
              <p class="hist-empty-sub">Las facturas que generes aparecerán aquí</p>
              <div class="hist-empty-hint">
                <span><FilePlus :size="14" stroke-width="1.5" /> Carga un XML para comenzar</span>
              </div>
            </div>

            <!-- Historial list -->
            <div v-else class="hist-list">
              <div v-for="entry in historial" :key="entry.id" class="hist-item">
                <div class="hist-icon" :class="entry.tipo === 'pago' ? 'hist-icon--pago' : 'hist-icon--factura'">
                  <CreditCard v-if="entry.tipo === 'pago'" :size="18" stroke-width="1.8" />
                  <FileText v-else :size="18" stroke-width="1.8" />
                </div>

                <div class="hist-info">
                  <div class="hist-top">
                    <span class="hist-numero">{{ entry.numero }}</span>
                    <span class="hist-tipo-badge" :class="entry.tipo === 'pago' ? 'badge--pago' : 'badge--factura'">
                      {{ entry.tipo === 'pago' ? 'Recibo de pago' : 'Factura' }}
                    </span>
                    <span class="hist-suc-badge" v-if="entry.sucursalLabel">
                      <MapPin :size="11" stroke-width="2.5" />{{ entry.sucursalLabel }}
                    </span>
                  </div>
                  <div class="hist-parties">
                    <span class="hist-emisor">{{ entry.emisorNombre }}</span>
                    <span class="hist-arrow">→</span>
                    <span class="hist-receptor">{{ entry.receptorNombre }}</span>
                  </div>
                  <div class="hist-meta">
                    <span>{{ fmtDate(entry.fecha) }}</span>
                    <span class="hist-sep">·</span>
                    <span class="hist-total">{{ fmtMXN(entry.total, entry.moneda) }}</span>
                    <span class="hist-sep">·</span>
                    <span class="hist-uuid" :title="entry.uuid">UUID: {{ entry.uuid ? entry.uuid.slice(0,8) + '…' : 'N/A' }}</span>
                  </div>
                </div>

                <div class="hist-actions">
                  <button class="btn btn-secondary btn-sm" @click="previewFromHistorial(entry)" title="Vista previa">
                    <Eye :size="14" stroke-width="2" />
                  </button>
                  <button class="btn btn-primary btn-sm" @click="downloadFromHistorial(entry)" :disabled="generatingHistory[entry.id]">
                    <Download v-if="!generatingHistory[entry.id]" :size="14" stroke-width="2" />
                    <span v-if="!generatingHistory[entry.id]">PDF</span>
                    <span v-else>…</span>
                  </button>
                  <button class="btn-ghost" @click="removeFromHistorial(entry.id)" title="Eliminar">
                    <X :size="14" stroke-width="2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>

    <!-- PDF preview modal -->
    <Transition name="modal">
    <div v-if="previewUrl" class="modal-overlay" @click.self="closePreview">
      <div class="modal">
        <div class="modal-header">
          <h3>Vista previa del PDF</h3>
          <button class="close-btn" @click="closePreview"><X :size="18" stroke-width="2" /></button>
        </div>
        <iframe :src="previewUrl" class="pdf-frame" title="Vista previa PDF"></iframe>
      </div>
    </div>
    </Transition>

    <!-- Toast notifications -->
    <Teleport to="body">
      <div class="toast-container">
        <TransitionGroup name="toast">
          <ToastNotification
            v-for="toast in toasts"
            :key="toast.id"
            :id="toast.id"
            :type="toast.type"
            :title="toast.title"
            :message="toast.message"
            :duration="toast.duration"
            @close="removeToast"
          />
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { parseFactura } from './utils/xmlParser.js'
import { downloadPDF, previewPDF } from './utils/pdfGenerator.js'
import { FolderOpen, ArrowDownToLine, Download, Eye, Paperclip, X, AlertCircle, MapPin, Clock, Trash2, FileText, CreditCard, Sun, Moon, Archive, FilePlus, Loader2, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-vue-next'
import confetti from 'canvas-confetti'
import ToastNotification from './components/ToastNotification.vue'

const HISTORIAL_KEY = 'ft_historial'
const HISTORIAL_MAX = 30

const SUCURSALES = [
  { id: 'ACATIC',      label: 'Acatic' },
  { id: 'AGULILLAS',   label: 'Aguilillas' },
  { id: 'ARANDAS',     label: 'Arandas' },
  { id: 'CAPILLA',     label: 'Capilla' },
  { id: 'CENTRO',      label: 'Centro' },
  { id: 'COLONIA',     label: 'Colonia' },
  { id: 'COLOSIO',     label: 'Colosio' },
  { id: 'GONZALEZ',    label: 'González' },
  { id: 'JARDINES',     label: 'Jardines' },
  { id: 'LAMANGA',      label: 'La Manga' },
  { id: 'MAPELO',       label: 'Mapelo' },
  { id: 'MEZCALA',      label: 'Mezcala' },
  { id: 'PEGUEROS',     label: 'Pegueros' },
  { id: 'SANIGNACIO',   label: 'San Ignacio' },
  { id: 'SANJOSE',      label: 'San José' },
  { id: 'SANTABARBARA', label: 'Santa Bárbara' },
  { id: 'VIVEROS',     label: 'Viveros' },
  { id: 'YAHUALICA',   label: 'Yahualica' },
  { id: 'ZAPOTLANEJO', label: 'Zapotlanejo' },
]

const fileInput = ref(null)
const fileName = ref('')
const factura = ref(null)
const error = ref('')
const dragging = ref(false)
const generating = ref(false)
const generatingProgress = ref(0)
const pdfStatus = ref('idle') // 'idle' | 'generating' | 'ready' | 'downloaded' | 'error'
const previewUrl = ref('')
const sucursal = ref(null)
const historial = ref(loadHistorial())
const historialExpanded = ref(false)
const generatingHistory = ref({})
const theme = ref('light')
const toasts = ref([])
const progressText = ref('Generando PDF...')
const progressDuration = ref(2000)
let toastId = 0

function addToast(type, title, message, duration = 4000) {
  const id = ++toastId
  toasts.value.push({ id, type, title, message, duration })
}

function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

function updateProgress(percent, text) {
  generatingProgress.value = percent
  if (text) progressText.value = text
}

function triggerRipple(e) {
  const btn = e.currentTarget
  btn.classList.add('rippling')
  setTimeout(() => btn.classList.remove('rippling'), 600)
}

function fireConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#1e40af', '#22c55e', '#f97316'],
  })
}

onMounted(() => {
  theme.value = localStorage.getItem('ft_theme') || 'light'
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('ft_theme', theme.value)
}

function loadHistorial() {
  try { return JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]') } catch { return [] }
}

function saveToHistorial(f, suc) {
  const entry = {
    id: Date.now(),
    savedAt: new Date().toISOString(),
    fileName: fileName.value,
    sucursalId: suc,
    sucursalLabel: SUCURSALES.find(s => s.id === suc)?.label || suc,
    tipo: f.tipo,
    numero: f.numero,
    fecha: f.fecha,
    emisorNombre: f.emisor?.nombre || '',
    emisorRfc: f.emisor?.nif || '',
    receptorNombre: f.receptor?.nombre || '',
    receptorRfc: f.receptor?.nif || '',
    total: f.totales?.total ?? 0,
    moneda: f.moneda || 'MXN',
    uuid: f.cfdi?.uuid || '',
    facturaData: f,
  }
  const lista = [entry, ...historial.value.filter(h => h.uuid !== entry.uuid || !entry.uuid)]
  historial.value = lista.slice(0, HISTORIAL_MAX)
  localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historial.value))
}

function removeFromHistorial(id) {
  historial.value = historial.value.filter(h => h.id !== id)
  localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historial.value))
}

function clearHistorial() {
  historial.value = []
  localStorage.removeItem(HISTORIAL_KEY)
}

function toggleHistorial() {
  if (historial.value.length) {
    historialExpanded.value = !historialExpanded.value
  }
}

async function downloadFromHistorial(entry) {
  generatingHistory.value[entry.id] = true
  try {
    await downloadPDF(entry.facturaData, entry.sucursalId)
  } catch (e) {
    error.value = 'Error al generar PDF: ' + e.message
  } finally {
    generatingHistory.value[entry.id] = false
  }
}

async function previewFromHistorial(entry) {
  try {
    previewUrl.value = await previewPDF(entry.facturaData, entry.sucursalId)
  } catch (e) {
    error.value = 'Error al generar vista previa: ' + e.message
  }
}

function reset() {
  fileName.value = ''
  factura.value = null
  error.value = ''
  previewUrl.value = ''
  pdfStatus.value = 'idle'
  if (fileInput.value) fileInput.value.value = ''
}

function processXML(content) {
  error.value = ''
  factura.value = null
  try {
    factura.value = parseFactura(content)
    saveToHistorial(factura.value, sucursal.value)
    addToast('success', 'Archivo procesado', `Factura ${factura.value.numero} cargada exitosamente`, 3500)
    fireConfetti()
  } catch (e) {
    error.value = e.message || 'Error desconocido al parsear el XML.'
  }
}

function onFileSelect(e) {
  if (e.target.files.length > 1) {
    error.value = 'Solo se puede subir un archivo a la vez.'
    e.target.value = ''
    return
  }
  const file = e.target.files[0]
  if (!file) return
  if (!file.name.endsWith('.xml')) {
    error.value = 'El archivo debe tener extensión .xml'
    return
  }
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => processXML(ev.target.result)
  reader.readAsText(file, 'UTF-8')
}

function onDrop(e) {
  dragging.value = false
  if (e.dataTransfer.files.length > 1) {
    error.value = 'Solo se puede subir un archivo a la vez.'
    return
  }
  const file = e.dataTransfer.files[0]
  if (!file) return
  if (!file.name.endsWith('.xml')) {
    error.value = 'El archivo debe tener extensión .xml'
    return
  }
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => processXML(ev.target.result)
  reader.readAsText(file, 'UTF-8')
}

async function download() {
  if (!factura.value) return
  generating.value = true
  generatingProgress.value = 10
  pdfStatus.value = 'generating'
  progressText.value = 'Generando PDF...'
  try {
    await downloadPDF(factura.value, sucursal.value, updateProgress)
    generatingProgress.value = 100
    progressText.value = '¡Listo!'
    pdfStatus.value = 'downloaded'
    fireConfetti()
    addToast('success', 'PDF generado', `Factura ${factura.value.numero} convertida a PDF`, 3500)
  } catch (e) {
    generatingProgress.value = 0
    progressText.value = 'Error'
    pdfStatus.value = 'error'
    error.value = 'Error al generar el PDF: ' + e.message
  } finally {
    setTimeout(() => {
      generating.value = false
      generatingProgress.value = 0
      progressText.value = 'Generando PDF...'
    }, 1500)
  }
}

async function openPreview() {
  if (!factura.value) return
  try {
    previewUrl.value = await previewPDF(factura.value, sucursal.value)
  } catch (e) {
    error.value = 'Error al generar la vista previa: ' + e.message
  }
}

function closePreview() {
  previewUrl.value = ''
}

function fmt(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: factura.value?.moneda || 'MXN',
    minimumFractionDigits: 2,
  }).format(n)
}

function fmtNum(n) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtMXN(n, mon = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: mon || 'MXN',
    minimumFractionDigits: 2,
  }).format(n ?? 0)
}

function fmtDate(str) {
  if (!str) return '–'
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

/* Header */
.header {
  background: var(--glass-header, rgba(30, 64, 175, 0.92));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: white;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 50;
  transition: background .25s ease;
}
.header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.logo-icon { height: 36px; width: 36px; object-fit: cover; border-radius: 50%; }
.logo h1 { font-size: 1.1rem; font-weight: 700; margin-bottom: 1px; }
.logo-sub { font-size: 0.78rem; opacity: .75; }

.theme-toggle {
  background: rgba(255,255,255,0.15);
  border: none;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s;
}
.theme-toggle:hover {
  background: rgba(255,255,255,0.25);
}

/* Main */
.main {
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  padding: 36px 24px 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  width: 100%;
}

.ft-letters {
  max-width: 560px;
  width: 80%;
  object-fit: contain;
  animation-delay: .05s;
}

/* Step cards */
.step-card {
  width: 100%;
  max-width: 960px;
  padding: 0;
  overflow: visible;
}
.step2-card {
  width: 100%;
  max-width: 960px;
  padding: 0;
}
.step-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 28px 20px;
  border-bottom: 1px solid var(--border);
}
.step-header--top {
  border-bottom: 1px solid var(--border);
}
.step-num {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-title { font-size: 1.15rem; font-weight: 600; color: var(--text); }
.step-sub { font-size: 0.9rem; color: var(--text-muted); margin-top: 3px; }
.sucursal-badge {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--primary-bg);
  color: var(--primary);
  border: 1px solid var(--primary-border);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Sucursal chips grid */
.sucursal-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 22px 28px;
}
.suc-chip {
  padding: 9px 20px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color .15s, background .15s, color .15s, transform .1s;
  animation: chip-enter .35s cubic-bezier(.22,1,.36,1) both;
  opacity: 0;
}
@keyframes chip-enter {
  from { opacity: 0; transform: scale(0.85) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.suc-chip:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
.suc-chip--active {
  background: var(--primary);
  color: var(--surface);
  border-color: var(--primary);
}

.upload-card {
  width: 100%;
  max-width: 960px;
}

/* Cards */
.card {
  background: var(--surface);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: 0 0 8px rgba(30, 64, 175, 0.25), 0 0 16px rgba(30, 64, 175, 0.1), var(--shadow);
  overflow: hidden;
}

/* Upload */
.upload-card { padding: 0; }
.drop-zone {
  padding: 100px 48px;
  text-align: center;
  cursor: pointer;
  transition: background .15s;
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
}
.drop-zone::before {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px dashed var(--primary);
  border-radius: 8px;
  opacity: 0;
  transition: opacity .25s;
  pointer-events: none;
}
.upload-card.dragging .drop-zone::before,
.drop-zone:hover::before {
  opacity: 0.7;
  animation: border-scroll .6s linear infinite;
}
@keyframes border-scroll {
  0% { border-color: var(--primary); transform: scale(1); }
  50% { border-color: var(--primary-border); }
  100% { border-color: var(--primary); transform: scale(1.01); }
}
.upload-card.dragging .drop-zone,
.drop-zone:hover { background: var(--primary-bg); }
.drop-icon { display: flex; justify-content: center; margin-bottom: 12px; color: var(--primary); }
.drop-title { font-size: 1.2rem; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.drop-sub { font-size: 0.95rem; color: var(--text-muted); margin-bottom: 22px; }
.hidden-input { display: none; }
.file-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--primary-bg);
  border-top: 1px solid var(--primary-border);
  font-size: 0.875rem;
  color: var(--primary);
  font-weight: 500;
}
.file-badge-icon { display: flex; align-items: center; }
.clear-btn {
  margin-left: auto;
  background: none;
  border: none;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 4px;
}
.clear-btn:hover { background: var(--primary-bg); color: var(--primary); }

/* Alert */
.alert {
  display: flex;
  gap: 12px;
  padding: 14px 18px;
  border-radius: var(--radius);
  border: 1px solid;
}
.alert-error {
  background: var(--error-bg);
  border-color: var(--error-border);
  color: var(--error);
}
.alert-icon { display: flex; align-items: flex-start; flex-shrink: 0; padding-top: 1px; }
.alert strong { display: block; margin-bottom: 3px; }
.alert p { font-size: 0.875rem; }

/* Preview card */
.preview-card { padding: 0; width: 100%; max-width: 960px; }
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.preview-header h2 { font-size: 1.1rem; color: var(--text); }
.preview-sub { font-size: 0.82rem; color: var(--text-muted); margin-top: 2px; }
.action-btns { display: flex; gap: 10px; flex-wrap: wrap; }
.pdf-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  animation: status-enter .25s ease;
  margin-top: 8px;
}
@keyframes status-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.pdf-status--generating {
  background: var(--primary-bg);
  color: var(--primary);
}
.pdf-status--generating svg { animation: spin 1s linear infinite; }
.pdf-status--ready {
  background: var(--success-bg);
  color: var(--success);
}
.pdf-status--downloaded {
  background: var(--success-bg);
  color: var(--success);
}
.pdf-status--error {
  background: var(--error-bg);
  color: var(--error);
}
.pdf-status-text { white-space: nowrap; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* Invoice summary */
.invoice-summary { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; color: var(--text); }
.summary-row { display: flex; gap: 24px; flex-wrap: wrap; }
.info-block { display: flex; flex-direction: column; gap: 2px; }
.info-block label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.info-block strong { font-size: 0.95rem; color: var(--text); }

.parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 580px) { .parties-grid { grid-template-columns: 1fr; } }
.party-box {
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.7;
}
.party-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--primary);
  margin-bottom: 4px;
}
.party-name { font-weight: 700; font-size: 0.95rem; color: var(--text); }
.party-box p { color: var(--text-muted); }

/* Table */
.table-wrapper { overflow-x: auto; }
.lines-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.lines-table th {
  background: var(--primary);
  color: white;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 0.8rem;
}
.lines-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--table-text, var(--text));
}
.lines-table tbody tr:last-child td { border-bottom: none; }
.lines-table tbody tr:nth-child(even) { background: var(--table-alt, var(--surface)); }
.lines-table .num { text-align: right; }
.lines-table .center { text-align: center; }

/* Totals */
.totals-box {
  align-self: flex-end;
  width: 280px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
@media (max-width: 480px) { .totals-box { width: 100%; } }
.totals-row {
  display: flex;
  justify-content: space-between;
  padding: 9px 14px;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.totals-row:last-child { border-bottom: none; }
.total-row {
  background: var(--primary);
  color: white;
  font-weight: 700;
  font-size: 1rem;
}
.totals-row--impuesto {
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--table-alt);
}
.impuesto-label {
  font-weight: 600;
  color: var(--text);
}
.impuesto-cuota {
  font-weight: 600;
  color: var(--primary);
}
.text-error { color: var(--error); }

/* Progress bar */
.progress-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  animation: progress-appear .3s ease;
}
@keyframes progress-appear {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary) 0%, var(--primary-hover) 50%, var(--primary) 100%);
  background-size: 200% 100%;
  border-radius: 3px;
  animation: progress-stripe 1s linear infinite;
  width: 100%;
  transform-origin: left;
}
@keyframes progress-stripe {
  0% { transform: scaleX(0); transform-origin: left; }
  50% { transform: scaleX(1); transform-origin: left; }
  50.01% { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
}
.progress-text {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 120px;
}

/* ── Keyframes ─────────────────────────────────────────────────────────────── */
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-8px); }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  30%       { transform: translateY(-12px) scale(1.15); }
  60%       { transform: translateY(-4px) scale(1.05); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-8px); }
  40%       { transform: translateX(8px); }
  60%       { transform: translateX(-5px); }
  80%       { transform: translateX(5px); }
}
@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(30,64,175,.25); }
  50%       { box-shadow: 0 0 0 8px rgba(30,64,175,0); }
}

/* ── Entrance animations ───────────────────────────────────────────────────── */
.anim-slide-down { animation: slideDown .45s cubic-bezier(.22,1,.36,1) both; }
.anim-fade-up    { animation: fadeUp   .5s  cubic-bezier(.22,1,.36,1) .1s both; }

/* ── Drop icon ─────────────────────────────────────────────────────────────── */
.drop-icon--idle    { animation: float  3s ease-in-out infinite; }
.drop-icon--dragging { animation: bounce .6s ease-in-out infinite; }

/* ── Drag active: scale card ─────────────────────────────────────────────── */
.upload-card.dragging { transform: scale(1.02); animation: pulse-border 1s ease infinite; transition: transform .2s; }

/* ── Vue Transitions ──────────────────────────────────────────────────────── */
.fade-up-enter-active { transition: opacity .35s ease, transform .35s cubic-bezier(.22,1,.36,1); }
.fade-up-leave-active { transition: opacity .2s ease, transform .2s ease; }
.fade-up-enter-from   { opacity: 0; transform: translateY(18px); }
.fade-up-leave-to     { opacity: 0; transform: translateY(-10px); }

.shake-enter-active { animation: shake .4s ease, fadeUp .3s ease; }
.shake-leave-active { transition: opacity .2s; }
.shake-leave-to     { opacity: 0; }

.modal-enter-active { transition: opacity .25s ease; }
.modal-leave-active { transition: opacity .2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .modal,
.modal-leave-active .modal { transition: transform .25s cubic-bezier(.22,1,.36,1); }
.modal-enter-from .modal   { transform: scale(.93) translateY(16px); }
.modal-leave-to .modal     { transform: scale(.96) translateY(8px); }

/* ── Button micro-interactions ────────────────────────────────────────────── */
.btn { transition: background .15s, opacity .15s, transform .12s; }
.btn:hover:not(:disabled)  { transform: translateY(-1px); }
.btn:active:not(:disabled) { transform: translateY(1px) scale(.97); }

/* Hint card */
.hint-card { padding: 20px 24px; }
.section-title { font-size: 3.5rem; font-weight: 700; text-align: center; }
.title-blue { color: var(--primary); }
.title-orange { color: var(--warning); }
.hint-card h3 { font-size: 1rem; margin-bottom: 6px; }
.hint-card p { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 14px; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background .15s, opacity .15s;
  position: relative;
  overflow: hidden;
}
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn-secondary { background: var(--border); color: var(--text); }
.btn-secondary:hover:not(:disabled) { background: var(--text-muted); color: var(--surface); }
.btn-outline:hover:not(:disabled) { background: var(--primary-bg); }
.btn-sm { padding: 7px 14px; font-size: 0.82rem; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}
.modal {
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  max-width: 860px;
  height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.modal-header h3 { font-size: 1rem; }
.close-btn {
  background: var(--border);
  border: none;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--text-muted);
}
.close-btn:hover { background: var(--text-muted); color: var(--surface); }
.pdf-frame { flex: 1; border: none; width: 100%; }

/* ── Historial ────────────────────────────────────────────────────────────── */
.hist-card {
  padding: 0;
  width: 100%;
  max-width: 960px;
  border: 1.5px solid var(--primary);
  box-shadow: 0 0 8px rgba(30, 64, 175, 0.25), 0 0 16px rgba(30, 64, 175, 0.1);
}

.hist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.hist-header--clickable {
  cursor: pointer;
  user-select: none;
  transition: background .15s;
}
.hist-header--clickable:hover {
  background: var(--surface);
}
.hist-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hist-chevron {
  transition: transform .25s ease;
  color: var(--text-muted);
}
.hist-chevron--open {
  transform: rotate(180deg);
}
.hist-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}
.hist-title { font-size: 1rem; font-weight: 600; color: var(--text); }
.hist-count {
  background: var(--primary);
  color: white;
  font-size: 0.72rem;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 8px;
}

.btn-ghost {
  background: none;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-muted);
  padding: 6px 10px;
  border-radius: 6px;
  transition: background .15s, color .15s;
}
.btn-ghost:hover { background: var(--border); color: var(--text); }
.btn-ghost--danger:hover { background: var(--error-bg); color: var(--error); }

.hist-list { display: flex; flex-direction: column; }

.hist-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  text-align: center;
}
.hist-empty-visual {
  margin-bottom: 20px;
}
.empty-illustration {
  position: relative;
  width: 100px;
  height: 80px;
}
.empty-folder {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 48px;
  background: var(--primary-bg);
  border: 2.5px solid var(--primary-border);
  border-radius: 8px 8px 4px 4px;
}
.empty-folder::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 4px;
  width: 20px;
  height: 8px;
  background: var(--primary-border);
  border-radius: 4px 4px 0 0;
}
.empty-file {
  position: absolute;
  left: 12%;
  top: 35%;
  width: 16px;
  height: 20px;
  background: var(--border);
  border-radius: 2px;
  transform: rotate(-8deg);
  opacity: 0.6;
  animation: empty-float 3s ease-in-out infinite;
}
.empty-file--alt {
  left: auto;
  right: 12%;
  background: var(--primary-border);
  transform: rotate(6deg);
  opacity: 0.5;
  animation-delay: -1.5s;
}
.empty-sparkle {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--primary);
  border-radius: 50%;
  top: 20%;
  left: 25%;
  animation: sparkle 2s ease-in-out infinite;
}
.empty-sparkle--2 {
  top: 30%;
  left: auto;
  right: 20%;
  width: 4px;
  height: 4px;
  animation-delay: -1s;
}
@keyframes empty-float {
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-6px) rotate(-4deg); }
}
@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.hist-empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.hist-empty-sub {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 16px;
}
.hist-empty-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--surface);
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px dashed var(--border);
}
.hist-empty-hint svg {
  color: var(--primary);
}

.hist-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  transition: background .12s;
}
.hist-item:last-child { border-bottom: none; }
.hist-item:hover { background: var(--surface); }

.hist-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .3s ease;
  overflow: hidden;
}
.hist-content > div {
  overflow: hidden;
}
.hist-content--open {
  grid-template-rows: 1fr;
}

.hist-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hist-icon--factura { background: var(--primary-bg); color: var(--primary); }
.hist-icon--pago    { background: var(--success-bg); color: var(--success); }

.hist-tipo-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.badge--factura { background: var(--primary-bg); color: var(--primary); }
.badge--pago    { background: var(--success-bg); color: var(--success); }

.hist-suc-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 2px 8px;
}

.hist-parties {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hist-emisor, .hist-receptor { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.hist-arrow { color: var(--text-muted); flex-shrink: 0; }

.hist-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.hist-sep { opacity: .4; }
.hist-total { font-weight: 600; color: var(--text); }
.hist-uuid { font-family: monospace; font-size: 0.75rem; }

.hist-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

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
