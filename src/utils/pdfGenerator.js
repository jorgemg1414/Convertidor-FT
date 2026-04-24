import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import logoUrl from '../assets/LOGO FARMACIAS TEPA.png'

const C_PRIMARY       = [30, 30, 30]       // negro suave (imprime sólido)
const C_PRIMARY_LIGHT = [232, 232, 232]    // gris muy claro
const C_PRIMARY_MID   = [160, 160, 160]    // gris medio
const C_HEADER        = [40, 40, 40]       // casi negro — header tabla
const C_DARK          = [15, 15, 15]       // negro texto
const C_MUTED         = [110, 110, 110]    // gris texto secundario
const C_WHITE         = [255, 255, 255]
const C_BORDER        = [140, 140, 140]    // gris borde (contraste suficiente)
const C_BOX_BG        = [250, 250, 250]    // blanco hueso
const C_SHADOW        = [185, 185, 185]    // sombra gris
const C_ALTROW        = [245, 245, 245]    // fila alterna gris muy claro
const C_TOTROW        = [205, 205, 205]    // fila totales gris medio

// ── Logo cache ────────────────────────────────────────────────────────────────
let _logoDataUrl = null
let _logoAspect = 1

async function getLogo() {
  if (_logoDataUrl) return { dataUrl: _logoDataUrl, aspect: _logoAspect }
  const resp = await fetch(logoUrl)
  const blob = await resp.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      _logoDataUrl = e.target.result
      const img = new Image()
      img.onload = () => {
        _logoAspect = img.width / img.height
        resolve({ dataUrl: _logoDataUrl, aspect: _logoAspect })
      }
      img.src = _logoDataUrl
    }
    reader.readAsDataURL(blob)
  })
}

// ── Number to words (Spanish) ─────────────────────────────────────────────────
const _UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const _VEINTES = ['VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const _DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const _CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function _enLetras(n) {
  if (n === 0) return 'CERO'
  let s = ''
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000)
    s += (m === 1 ? 'UN MILLON' : _enLetras(m) + ' MILLONES') + ' '
    n %= 1000000
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000)
    s += (k === 1 ? 'MIL' : _enLetras(k) + ' MIL') + ' '
    n %= 1000
  }
  if (n >= 100) {
    s += (n === 100 ? 'CIEN' : _CENTENAS[Math.floor(n / 100)]) + ' '
    n %= 100
  }
  if (n >= 20 && n < 30) { s += _VEINTES[n - 20] + ' ' }
  else if (n >= 20) {
    s += _DECENAS[Math.floor(n / 10)]
    if (n % 10) s += ' Y ' + _UNIDADES[n % 10]
    s += ' '
  } else if (n > 0) {
    s += _UNIDADES[n] + ' '
  }
  return s.trim()
}

function numeroALetras(num, moneda = 'MXN') {
  const entero = Math.floor(Math.abs(num))
  const centavos = Math.round((Math.abs(num) - entero) * 100)
  return `${_enLetras(entero)} ${String(centavos).padStart(2, '0')}/100 ${moneda}`
}

// ── SAT verification URL ──────────────────────────────────────────────────────
function satQrUrl(factura) {
  const cf = factura.cfdi
  if (!cf?.uuid) return ''
  const tt = factura.totales.total.toFixed(6).padStart(17, '0')
  const fe = cf.selloEmisor ? cf.selloEmisor.slice(-8) : ''
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cf.uuid}&re=${factura.emisor.nif}&rr=${factura.receptor.nif}&tt=${tt}&fe=${fe}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMXN(n, mon = 'MXN') {
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)
}

// ── Main PDF generator ────────────────────────────────────────────────────────
const SUCURSAL_LABELS = {
  ACATIC: 'Acatic', AGULILLAS: 'Aguilillas', ARANDAS: 'Arandas',
  CAPILLA: 'Capilla', CENTRO: 'Centro', COLONIA: 'Colonia',
  COLOSIO: 'Colosio', GONZALEZ: 'González', JARDINES: 'Jardines',
  LAMANGA: 'La Manga', MAPELO: 'Mapelo', MEZCALA: 'Mezcala',
  PEGUEROS: 'Pegueros', SANIGNACIO: 'San Ignacio', SANJOSE: 'San José', SANTABARBARA: 'Santa Bárbara',
  VIVEROS: 'Viveros', YAHUALICA: 'Yahualica', ZAPOTLANEJO: 'Zapotlanejo',
}

export async function generatePDF(factura, sucursalId = null) {
  const { dataUrl: logo, aspect: logoAspect } = await getLogo()

  const qrUrl = satQrUrl(factura)
  let qrDataUrl = null
  if (qrUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1, errorCorrectionLevel: 'M' })
    } catch (e) {
      console.warn('QR generation failed:', e.message)
    }
  }

  // Carta size: 216×279mm
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [216, 279] })
  const W = 216
  const H = 279
  const ML = 10
  const MR = 10
  const CW = W - ML - MR // 196mm

  const cf = factura.cfdi || {}

  const qrSize = 30
  const headW = CW - qrSize - 4
  const logoH = 22
  const logoW = Math.min(logoH * logoAspect, 90)

  // ── Header reutilizable (página 1 y páginas siguientes) ───────────────────────
  const drawHeader = () => {
    doc.setFillColor(...C_PRIMARY)
    doc.rect(0, 0, W, 4, 'F')

    let hY = 7

    // Logo
    doc.addImage(logo, 'PNG', ML, hY, logoW, logoH)

    // Emisor nombre + sucursal
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C_DARK)
    const sucursalLabel = sucursalId ? SUCURSAL_LABELS[sucursalId] : null
    const nombreDisplay = sucursalLabel
      ? `FARMACIA TEPA ${sucursalLabel.toUpperCase()}`
      : factura.emisor.nombre.toUpperCase()
    doc.text(nombreDisplay, ML + headW / 2, hY + 4, { align: 'center', maxWidth: headW })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C_MUTED)
    let hy = hY + 9
    doc.text(`RFC: ${factura.emisor.nif}`, ML + headW / 2, hy, { align: 'center' }); hy += 4
    if (cf.regimenEmisor) {
      doc.text(cf.regimenEmisor, ML + headW / 2, hy, { align: 'center', maxWidth: headW }); hy += 4
    }
    if (cf.lugarExpedicion) {
      doc.text(`Lugar de Expedición CP: ${cf.lugarExpedicion}`, ML + headW / 2, hy, { align: 'center' }); hy += 4
    }

    // UUID pill
    const uuidText = `FOLIO FISCAL: ${cf.uuid || 'N/A'}`
    doc.setFontSize(6.5)
    const uuidW = doc.getTextWidth(uuidText) + 8
    const uuidX = ML + headW / 2 - uuidW / 2
    doc.setFillColor(...C_PRIMARY_LIGHT)
    doc.setDrawColor(...C_PRIMARY_MID)
    doc.roundedRect(uuidX, hy - 1, uuidW, 6, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C_PRIMARY)
    doc.text(uuidText, ML + headW / 2, hy + 3.2, { align: 'center' })
    hy += 8

    // QR
    if (qrDataUrl) {
      doc.setFillColor(...C_WHITE)
      doc.setDrawColor(...C_BORDER)
      doc.roundedRect(W - MR - qrSize - 1, hY - 1, qrSize + 2, qrSize + 2, 2, 2, 'FD')
      doc.addImage(qrDataUrl, 'PNG', W - MR - qrSize, hY, qrSize, qrSize)
    }

    const bottomY = Math.max(hy, hY + qrSize + 3)

    // Separador
    doc.setDrawColor(...C_PRIMARY_MID)
    doc.setLineWidth(0.5)
    doc.line(ML, bottomY, W - MR, bottomY)
    doc.setLineWidth(0.2)

    return bottomY + 4
  }

  // Footer helper
  const drawFooter = (pageNum, totalPages) => {
    doc.setFillColor(...C_PRIMARY)
    doc.rect(0, H - 10, W, 10, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C_WHITE)
    doc.text('Farmacia Tepa · Documento generado digitalmente', ML, H - 4)
    doc.text(`Página ${pageNum} de ${totalPages}`, W - MR, H - 4, { align: 'right' })
  }

  // Dibujar header en página 1
  let y = drawHeader()

  // ── BLOQUE RECEPTOR + COMPROBANTE (2 columnas) ────────────────────────────────
  const colW = (CW - 3) / 2
  const col2X = ML + colW + 3
  const blockH = 33

  const drawBox = (x, bw, bh, headerLabel) => {
    // Sombra sutil
    doc.setFillColor(...C_SHADOW)
    doc.roundedRect(x + 0.6, y + 0.6, bw, bh, 2.5, 2.5, 'F')
    // Caja principal
    doc.setFillColor(...C_BOX_BG)
    doc.setDrawColor(...C_BORDER)
    doc.roundedRect(x, y, bw, bh, 2.5, 2.5, 'FD')
    // Barra izquierda azul
    doc.setFillColor(...C_PRIMARY)
    doc.roundedRect(x, y, 2.5, bh, 1, 1, 'F')
    // Línea separadora de header
    doc.setDrawColor(...C_BORDER)
    doc.line(x + 3, y + 7, x + bw - 2, y + 7)
    // Label del header
    doc.setTextColor(...C_PRIMARY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(headerLabel, x + 6, y + 4.8)
  }

  // Columna izquierda — Receptor
  drawBox(ML, colW, blockH, 'RECEPTOR')
  let ly = y + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_DARK)
  const usoClave = (factura.receptor.usoCFDI || cf.usoCFDI || '').split(' ')[0]
  doc.text(`RFC: ${factura.receptor.nif}   Clave Uso: ${usoClave}`, ML + 3, ly); ly += 4
  doc.setFont('helvetica', 'bold')
  const recLines = doc.splitTextToSize(factura.receptor.nombre, colW - 6)
  doc.text(recLines, ML + 3, ly); ly += recLines.length * 3.5 + 1
  doc.setFont('helvetica', 'normal')
  const usoFull = factura.receptor.usoCFDI || cf.usoCFDI || ''
  if (usoFull) { const ul = doc.splitTextToSize(`Uso CFDI: ${usoFull}`, colW - 6); doc.text(ul, ML + 3, ly); ly += ul.length * 3.5 }
  const cpRec = factura.receptor.domicilioFiscal || factura.receptor.codigoPostal || ''
  if (cpRec) { doc.text(`Domicilio Fiscal: CP ${cpRec}`, ML + 3, ly); ly += 4 }
  const regRec = factura.receptor.regimenFiscal || cf.regimenReceptor || ''
  if (regRec) { const rl = doc.splitTextToSize(`Régimen: ${regRec}`, colW - 6); doc.text(rl, ML + 3, ly) }

  // Columna derecha — Datos comprobante
  drawBox(col2X, colW, blockH, 'DATOS DEL COMPROBANTE')
  let ry = y + 10

  const kv = (label, value, bold = false) => {
    if (!value) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...C_MUTED)
    doc.text(`${label}:`, col2X + 3, ry)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C_DARK)
    const vLines = doc.splitTextToSize(String(value), colW - 6)
    doc.text(vLines[0], col2X + 3 + doc.getTextWidth(`${label}: `), ry)
    ry += 3.8
  }

  kv('Serie/Folio', `${cf.serie || ''} ${cf.folio || ''}`.trim())
  kv('Cert. Emisor', cf.noCertificadoEmisor || '')
  kv('Cert. SAT', cf.noCertificadoSAT || '')
  kv('Fecha emisión', cf.fechaEmision || '')
  kv('Fecha certific.', cf.fechaCertificacion || '')
  kv('Moneda', factura.moneda || 'MXN')

  y += blockH + 3

  // ── BLOQUE PAGO + TIPO COMPROBANTE (2 columnas) ───────────────────────────────
  const pagoH = 20

  drawBox(ML, colW, pagoH, 'FORMA DE PAGO')
  let py = y + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_DARK)
  if (cf.formaPago) { const fl = doc.splitTextToSize(`Forma de Pago: ${cf.formaPago}`, colW - 6); doc.text(fl, ML + 3, py); py += fl.length * 3.8 }
  if (cf.metodoPago) { const ml2 = doc.splitTextToSize(`Método de Pago: ${cf.metodoPago}`, colW - 6); doc.text(ml2, ML + 3, py); py += ml2.length * 3.8 }
  if (cf.usoCFDI)    { const ul2 = doc.splitTextToSize(`Uso CFDI: ${cf.usoCFDI}`, colW - 6); doc.text(ul2, ML + 3, py) }

  drawBox(col2X, colW, pagoH, 'TIPO DE COMPROBANTE')
  let ty = y + 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_DARK)
  if (cf.tipoDeComprobante) { doc.text(`Tipo: ${cf.tipoDeComprobante}`, col2X + 3, ty); ty += 3.8 }
  if (cf.condicionesDePago) { doc.text(`Condiciones: ${cf.condicionesDePago}`, col2X + 3, ty); ty += 3.8 }

  y += pagoH + 4

  // ── TABLA DE CONCEPTOS ────────────────────────────────────────────────────────
  const tableBody = factura.lineas.map((l) => [
    `${l.claveProdServ || ''}\n${l.descripcion || l.concepto || ''}`,
    fmtMXN(l.cantidad),
    l.claveUnidad || l.unidad || '',
    fmtMXN(l.valorUnitario ?? l.precioUnitario),
    fmtMXN(l.importe),
    fmtMXN(l.descuento),
    fmtMXN(l.subtotal ?? (l.importe - (l.descuento || 0))),
    fmtMXN(l.ieps?.importe),
    `${fmtMXN(l.iva?.importe)}\n${l.iva ? `IVA ${((l.iva.tasa || 0) * 100).toFixed(0)}%` : ''}`,
    fmtMXN(l.total),
  ])

  // Fila de totales
  const sumImporte = factura.lineas.reduce((s, l) => s + (l.importe || 0), 0)
  const sumDesc    = factura.totales.descuento || 0
  const sumSub     = sumImporte - sumDesc
  const iepsTax   = factura.totales.impuestos?.filter(i => i.tipo === 'IEPS') ?? []
  const ivaTax    = factura.totales.impuestos?.filter(i => i.tipo === 'IVA') ?? []
  const sumIeps   = iepsTax.reduce((s, i) => s + i.cuota, 0)
  const sumIva    = ivaTax.reduce((s, i) => s + i.cuota, 0)
  const sumTotal   = factura.totales.total

  tableBody.push([
    'TOTALES', '', '', '',
    fmtMXN(sumImporte), fmtMXN(sumDesc), fmtMXN(sumSub),
    fmtMXN(sumIeps), fmtMXN(sumIva), fmtMXN(sumTotal),
  ])

  let pageCount = 1
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR, top: 50, bottom: 16 },
    head: [['Clave/Prod\nDescripción', 'Cant.', 'UdM', 'Unitario', 'Importe', 'Descuento', 'SubTotal', 'IEPS', 'IVA', 'Total']],
    body: tableBody,
    styles: {
      font: 'helvetica', fontSize: 6.5, cellPadding: 1.5,
      textColor: C_DARK, lineColor: C_BORDER, lineWidth: 0.1, overflow: 'linebreak',
    },
    headStyles: {
      fillColor: C_PRIMARY, textColor: C_WHITE, fontStyle: 'bold',
      fontSize: 6.5, halign: 'center', minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: C_ALTROW },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 12, halign: 'right' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 19, halign: 'right' },
      4: { cellWidth: 19, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 19, halign: 'right' },
      7: { cellWidth: 14, halign: 'right' },
      8: { cellWidth: 17, halign: 'right' },
      9: { cellWidth: 13, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = C_TOTROW
        data.cell.styles.textColor = C_PRIMARY
      }
    },
    didDrawPage: (data) => {
      pageCount = data.pageCount
      if (data.pageNumber > 1) drawHeader()
      drawFooter(data.pageNumber, data.pageCount)
    },
  })

  y = doc.lastAutoTable.finalY + 5

  // ── IMPORTE CON LETRA ──────────────────────────────────────────────────────────
  const letra = numeroALetras(sumTotal, factura.moneda || 'MXN')
  doc.setFillColor(...C_PRIMARY_LIGHT)
  doc.setDrawColor(...C_PRIMARY_MID)
  doc.roundedRect(ML, y, CW, 9, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C_PRIMARY)
  doc.text(`** ${letra} **`, W / 2, y + 5.5, { align: 'center', maxWidth: CW - 4 })
  y += 13

  // ── RESUMEN DE IMPUESTOS ────────────────────────────────────────────────────────
  const impuestosTax = factura.totales.impuestos ?? []
  const totalImp = impuestosTax.reduce((s, i) => s + i.cuota, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_DARK)
  doc.text(`Total de Impuestos: ${fmtMXN(totalImp)}`, ML, y); y += 3.5

  for (const imp of impuestosTax) {
    doc.text(`   ${imp.tipo}: ${imp.tasa}%   Base=${fmtMXN(imp.base)}   TasaOCuota=${imp.tasa}%   Importe=${fmtMXN(imp.cuota)}`, ML, y)
    y += 3.5
  }
  y += 3

  // ── SELLOS ─────────────────────────────────────────────────────────────────────
  doc.setFillColor(...C_BOX_BG)
  doc.setDrawColor(...C_BORDER)
  doc.setLineWidth(0.3)
  doc.line(ML, y, W - MR, y); y += 4

  const selloBlock = (titulo2, texto) => {
    if (!texto) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...C_DARK)
    doc.text(titulo2, ML, y); y += 3.5
    doc.setFont('courier', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(50, 50, 50)
    const lines = doc.splitTextToSize(texto, CW)
    doc.text(lines, ML, y)
    y += lines.length * 3.2 + 3
  }

  selloBlock('SELLO DIGITAL DEL EMISOR:', cf.selloEmisor || '')
  selloBlock('SELLO DIGITAL DEL SAT:', cf.selloSAT || '')

  y += 2
  doc.setFillColor(...C_PRIMARY)
  doc.roundedRect(ML + CW / 4, y - 1, CW / 2, 7, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...C_WHITE)
  doc.text('ESTE DOCUMENTO ES UNA REPRESENTACION IMPRESA DE UN CFDI 4.0', W / 2, y + 3.5, { align: 'center' })

  // Dibujar footer en última página (autoTable ya lo hizo en páginas anteriores)
  drawFooter(doc.internal.getNumberOfPages(), doc.internal.getNumberOfPages())

  return doc
}

export async function downloadPDF(factura, sucursal = null) {
  const doc = await generatePDF(factura, sucursal)
  const prefix = factura.tipo === 'pago' ? 'recibo_pago' : 'factura'
  doc.save(`${prefix}_${factura.numero.replace(/[^a-z0-9]/gi, '_')}.pdf`)
}

export async function previewPDF(factura, sucursal = null) {
  const doc = await generatePDF(factura, sucursal)
  return doc.output('bloburl')
}
