import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
})

function getText(node, ...keys) {
  for (const key of keys) {
    if (node?.[key] !== undefined && node[key] !== null && node[key] !== '') {
      return String(node[key])
    }
  }
  return ''
}

function getFloat(node, ...keys) {
  const val = getText(node, ...keys)
  const num = parseFloat(val.replace(',', '.'))
  return isNaN(num) ? 0 : num
}

const FORMA_PAGO = {
  '01': 'EFECTIVO', '02': 'CHEQUE NOMINATIVO', '03': 'TRANSFERENCIA ELECTRONICA',
  '04': 'TARJETA DE CREDITO', '05': 'MONEDERO ELECTRONICO', '06': 'DINERO ELECTRONICO',
  '28': 'TARJETA DE DEBITO', '29': 'TARJETA DE SERVICIOS', '99': 'POR DEFINIR',
}
const METODO_PAGO = {
  PUE: 'PAGO EN UNA SOLA EXHIBICION',
  PPD: 'PAGO EN PARCIALIDADES O DIFERIDO',
}
const USO_CFDI = {
  G01: 'ADQUISICION DE MERCANCIAS', G02: 'DEVOLUCIONES, DESCUENTOS O BONIFICACIONES',
  G03: 'GASTOS EN GENERAL', I01: 'CONSTRUCCIONES', I02: 'MOBILARIO Y EQUIPO DE OFICINA',
  I03: 'EQUIPO DE TRANSPORTE', I04: 'EQUIPO DE COMPUTO Y ACCESORIOS',
  D01: 'HONORARIOS MEDICOS Y GASTOS HOSPITALARIOS', D02: 'GASTOS MEDICOS POR INCAPACIDAD',
  D03: 'GASTOS FUNERALES', D04: 'DONATIVOS', D07: 'PRIMAS POR SEGUROS DE GASTOS MEDICOS',
  D10: 'PAGOS POR SERVICIOS EDUCATIVOS', S01: 'SIN EFECTOS FISCALES',
  CP01: 'PAGOS', CN01: 'NOMINA',
}
const TIPO_COMPROBANTE = {
  I: 'I.-INGRESO', E: 'E.-EGRESO', T: 'T.-TRASLADO', N: 'N.-NOMINA', P: 'P.-PAGO',
}
const REGIMEN_FISCAL = {
  '601': '601 GENERAL DE LEY PERSONAS MORALES',
  '603': '603 PERSONAS MORALES SIN FINES LUCRATIVOS',
  '605': '605 SUELDOS Y SALARIOS',
  '606': '606 ARRENDAMIENTO',
  '612': '612 PERSONAS FISICAS ACTIVIDADES EMPRESARIALES',
  '616': '616 SIN OBLIGACIONES FISCALES',
  '621': '621 INCORPORACION FISCAL',
  '624': '624 COORDINADOS',
  '626': '626 REGIMEN SIMPLIFICADO DE CONFIANZA',
}

function fNum(v) {
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function extractImpuestosConcepto(conceptoNode) {
  const imp = conceptoNode['cfdi:Impuestos'] ?? {}
  const traslados = imp['cfdi:Traslados']?.['cfdi:Traslado'] ?? []
  const trasladosArr = Array.isArray(traslados) ? traslados : [traslados]
  const retenciones = imp['cfdi:Retenciones']?.['cfdi:Retencion'] ?? []
  const retencionesArr = Array.isArray(retenciones) ? retenciones : [retenciones]

  let iva = null, ieps = null
  for (const t of trasladosArr) {
    const impuesto = String(t['@_Impuesto'] ?? '')
    const tasa = fNum(t['@_TasaOCuota'])
    const base = fNum(t['@_Base'])
    const importe = fNum(t['@_Importe'])
    if (impuesto === '002') iva = { tasa, base, importe }
    if (impuesto === '003') ieps = { tasa, base, importe }
  }
  return { iva, ieps }
}

function parseCFDI(comprobante) {
  const attr = (key) => comprobante[`@_${key}`] ?? ''

  const emisorNode = comprobante['cfdi:Emisor'] ?? {}
  const receptorNode = comprobante['cfdi:Receptor'] ?? {}
  const conceptosNode = comprobante['cfdi:Conceptos'] ?? {}
  const impuestosNode = comprobante['cfdi:Impuestos'] ?? {}
  const complemento = comprobante['cfdi:Complemento'] ?? {}
  const tfd = complemento['tfd:TimbreFiscalDigital'] ?? {}

  let conceptosRaw = conceptosNode['cfdi:Concepto'] ?? []
  if (!Array.isArray(conceptosRaw)) conceptosRaw = [conceptosRaw]
  if (conceptosRaw.length === 0) throw new Error('No se encontraron conceptos en la factura.')

  const lineas = conceptosRaw.map((c, i) => {
    const ca = (k) => c[`@_${k}`] ?? ''
    const cantidad = fNum(ca('Cantidad'))
    const valorUnitario = fNum(ca('ValorUnitario'))
    const importe = fNum(ca('Importe')) || cantidad * valorUnitario
    const descuento = fNum(ca('Descuento'))
    const subtotal = importe - descuento
    const { iva, ieps } = extractImpuestosConcepto(c)
    const total = subtotal + (iva?.importe ?? 0) + (ieps?.importe ?? 0)
    return {
      numero: i + 1,
      claveProdServ: String(ca('ClaveProdServ')),
      noIdentificacion: String(ca('NoIdentificacion')),
      claveUnidad: String(ca('ClaveUnidad')),
      unidad: String(ca('Unidad')),
      concepto: String(ca('Descripcion')) || `Línea ${i + 1}`,
      descripcion: String(ca('Descripcion')) || `Línea ${i + 1}`,
      cantidad,
      precioUnitario: valorUnitario,
      valorUnitario,
      importe,
      descuento,
      subtotal,
      objetoImp: String(ca('ObjetoImp')),
      iva,
      ieps,
      total,
    }
  })

  const subtotalComp = fNum(attr('SubTotal'))
  const totalComp = fNum(attr('Total'))
  const descuentoComp = fNum(attr('Descuento'))
  const totalIVA = fNum(impuestosNode['@_TotalImpuestosTrasladados'])
  const pctIVA = (subtotalComp - descuentoComp) > 0
    ? Math.round((totalIVA / (subtotalComp - descuentoComp)) * 100)
    : 0

  const ivaGroups = {}
  const iepsGroups = {}
  for (const l of lineas) {
    if (l.iva) {
      const k = String(l.iva.tasa)
      if (!ivaGroups[k]) ivaGroups[k] = { tasa: l.iva.tasa, base: 0, cuota: 0 }
      ivaGroups[k].base += l.iva.base || 0
      ivaGroups[k].cuota += l.iva.importe || 0
    }
    if (l.ieps) {
      const k = String(l.ieps.tasa)
      if (!iepsGroups[k]) iepsGroups[k] = { tasa: l.ieps.tasa, base: 0, cuota: 0 }
      iepsGroups[k].base += l.ieps.base || 0
      iepsGroups[k].cuota += l.ieps.importe || 0
    }
  }
  const impuestosAgrupados = [
    ...Object.values(ivaGroups).map(g => ({
      tipo: 'IVA',
      tasa: Math.round(g.tasa * 100),
      base: g.base,
      cuota: g.cuota
    })),
    ...Object.values(iepsGroups).map(g => ({
      tipo: 'IEPS',
      tasa: Math.round(g.tasa * 100),
      base: g.base,
      cuota: g.cuota
    }))
  ]

  const serie = String(attr('Serie'))
  const folio = String(attr('Folio'))
  const numero = serie && folio ? `${serie}${folio}` : folio || serie || 'S/N'

  const fpClave = String(attr('FormaPago'))
  const mpClave = String(attr('MetodoPago'))
  const tipoClave = String(attr('TipoDeComprobante'))
  const usoClave = String(receptorNode['@_UsoCFDI'] ?? '')
  const regimenEmisorClave = String(emisorNode['@_RegimenFiscal'] ?? '')
  const regimenReceptorClave = String(receptorNode['@_RegimenFiscalReceptor'] ?? '')

  return {
    numero,
    fecha: String(attr('Fecha')).split('T')[0] || '',
    fechaVencimiento: '',
    moneda: String(attr('Moneda')) || 'MXN',
    emisor: {
      nombre: String(emisorNode['@_Nombre'] ?? '') || 'Emisor desconocido',
      nif: String(emisorNode['@_Rfc'] ?? ''),
      regimenFiscal: REGIMEN_FISCAL[regimenEmisorClave] || regimenEmisorClave,
      direccion: '',
      codigoPostal: String(attr('LugarExpedicion')),
      ciudad: '',
      telefono: '',
      email: '',
    },
    receptor: {
      nombre: String(receptorNode['@_Nombre'] ?? '') || 'Receptor desconocido',
      nif: String(receptorNode['@_Rfc'] ?? ''),
      domicilioFiscal: String(receptorNode['@_DomicilioFiscalReceptor'] ?? ''),
      codigoPostal: String(receptorNode['@_DomicilioFiscalReceptor'] ?? ''),
      regimenFiscal: REGIMEN_FISCAL[regimenReceptorClave] || regimenReceptorClave,
      usoCFDI: usoClave ? `${usoClave} ${USO_CFDI[usoClave] || ''}` : '',
      ciudad: '',
      direccion: '',
    },
    lineas,
    totales: {
      subtotal: subtotalComp,
      baseImponible: subtotalComp - descuentoComp,
      porcentajeIVA: pctIVA,
      cuotaIVA: totalIVA,
      totalIva: totalIVA,
      descuento: descuentoComp,
      total: totalComp,
      impuestos: impuestosAgrupados,
    },
    cfdi: {
      uuid: String(tfd['@_UUID'] ?? ''),
      serie,
      folio,
      fechaEmision: String(attr('Fecha')),
      fechaCertificacion: String(tfd['@_FechaTimbrado'] ?? ''),
      fechaTimbrado: String(tfd['@_FechaTimbrado'] ?? '').split('T')[0],
      noCertificadoEmisor: String(attr('NoCertificado')),
      noCertificadoSAT: String(tfd['@_NoCertificadoSAT'] ?? ''),
      selloEmisor: String(attr('Sello')),
      selloSAT: String(tfd['@_SelloSAT'] ?? ''),
      formaPago: fpClave ? `${fpClave}.-${FORMA_PAGO[fpClave] || fpClave}` : '',
      metodoPago: mpClave ? `${mpClave}.-${METODO_PAGO[mpClave] || mpClave}` : '',
      tipoDeComprobante: tipoClave ? (TIPO_COMPROBANTE[tipoClave] || tipoClave) : '',
      usoCFDI: usoClave ? `${usoClave} ${USO_CFDI[usoClave] || ''}` : '',
      regimenEmisor: REGIMEN_FISCAL[regimenEmisorClave] || regimenEmisorClave,
      regimenReceptor: REGIMEN_FISCAL[regimenReceptorClave] || regimenReceptorClave,
      lugarExpedicion: String(attr('LugarExpedicion')),
      noCertificado: String(attr('NoCertificado')),
      condicionesDePago: String(attr('CondicionesDePago')),
    },
  }
}

function parseCFDIPago(comprobante) {
  const attr = (key) => comprobante[`@_${key}`] ?? ''

  const emisorNode = comprobante['cfdi:Emisor'] ?? {}
  const receptorNode = comprobante['cfdi:Receptor'] ?? {}
  const complemento = comprobante['cfdi:Complemento'] ?? {}
  const tfd = complemento['tfd:TimbreFiscalDigital'] ?? {}
  const pagosNode = complemento['pago20:Pagos'] ?? {}
  const totalesNode = pagosNode['pago20:Totales'] ?? {}

  let pagosRaw = pagosNode['pago20:Pago'] ?? []
  if (!Array.isArray(pagosRaw)) pagosRaw = [pagosRaw]

  const lineas = []
  const pagos = []

  pagosRaw.forEach((pago) => {
    const pa = (k) => pago[`@_${k}`] ?? ''
    const monto = fNum(pa('Monto'))
    const fechaPago = String(pa('FechaPago')).split('T')[0]
    const formaPago = String(pa('FormaDePagoP'))
    const moneda = String(pa('MonedaP')) || 'MXN'

    let doctosRaw = pago['pago20:DoctoRelacionado'] ?? []
    if (!Array.isArray(doctosRaw)) doctosRaw = [doctosRaw]

    const facturas = doctosRaw.map((d) => {
      const da = (k) => d[`@_${k}`] ?? ''
      return {
        serie: String(da('Serie')),
        folio: String(da('Folio')),
        uuid: String(da('IdDocumento')),
        parcialidad: String(da('NumParcialidad')),
        impPagado: fNum(da('ImpPagado')),
        saldoAnterior: fNum(da('ImpSaldoAnt')),
        saldoInsoluto: fNum(da('ImpSaldoInsoluto')),
      }
    })

    pagos.push({ fechaPago, formaPago, moneda, monto, facturas })

    facturas.forEach((f) => {
      const ref = f.serie && f.folio ? `${f.serie}${f.folio}` : f.uuid || 'Doc.'
      const parcStr = f.parcialidad ? ` (Parcialidad ${f.parcialidad})` : ''
      lineas.push({
        numero: lineas.length + 1,
        claveProdServ: '84111506',
        noIdentificacion: '',
        claveUnidad: 'ACT',
        unidad: 'ACTIVIDAD',
        concepto: `Pago a ${ref}${parcStr}`,
        descripcion: `Pago a ${ref}${parcStr}`,
        cantidad: 1,
        precioUnitario: f.impPagado,
        valorUnitario: f.impPagado,
        importe: f.impPagado,
        descuento: 0,
        subtotal: f.impPagado,
        iva: null,
        ieps: null,
        total: f.impPagado,
      })
    })
  })

  if (lineas.length === 0) throw new Error('No se encontraron pagos en el complemento.')

  const montoTotal = fNum(totalesNode['@_MontoTotalPagos'])
  const ivaBase16 = fNum(totalesNode['@_TotalTrasladosBaseIVA16'])
  const ivaImp16 = fNum(totalesNode['@_TotalTrasladosImpuestoIVA16'])
  const pctIVA = ivaBase16 > 0 ? Math.round((ivaImp16 / ivaBase16) * 100) : 0

  const serie = String(attr('Serie'))
  const folio = String(attr('Folio'))
  const numero = serie && folio ? `${serie}${folio}` : folio || serie || 'S/N'
  const fpClave = pagos[0] ? String(pagos[0].formaPago) : ''
  const regimenEmisorClave = String(emisorNode['@_RegimenFiscal'] ?? '')
  const regimenReceptorClave = String(receptorNode['@_RegimenFiscalReceptor'] ?? '')

  return {
    tipo: 'pago',
    numero,
    fecha: String(attr('Fecha')).split('T')[0] || '',
    fechaVencimiento: '',
    moneda: pagos[0]?.moneda || 'MXN',
    emisor: {
      nombre: String(emisorNode['@_Nombre'] ?? '') || 'Emisor desconocido',
      nif: String(emisorNode['@_Rfc'] ?? ''),
      regimenFiscal: REGIMEN_FISCAL[regimenEmisorClave] || regimenEmisorClave,
      direccion: '',
      codigoPostal: String(attr('LugarExpedicion')),
      ciudad: '', telefono: '', email: '',
    },
    receptor: {
      nombre: String(receptorNode['@_Nombre'] ?? '') || 'Receptor desconocido',
      nif: String(receptorNode['@_Rfc'] ?? ''),
      domicilioFiscal: String(receptorNode['@_DomicilioFiscalReceptor'] ?? ''),
      codigoPostal: String(receptorNode['@_DomicilioFiscalReceptor'] ?? ''),
      regimenFiscal: REGIMEN_FISCAL[regimenReceptorClave] || regimenReceptorClave,
      usoCFDI: 'CP01 PAGOS',
      ciudad: '', direccion: '',
    },
    lineas,
    totales: {
      subtotal: montoTotal,
      baseImponible: montoTotal - ivaImp16,
      porcentajeIVA: pctIVA,
      cuotaIVA: ivaImp16,
      totalIva: ivaImp16,
      descuento: 0,
      total: montoTotal,
    },
    cfdi: {
      uuid: String(tfd['@_UUID'] ?? ''),
      serie,
      folio,
      fechaEmision: String(attr('Fecha')),
      fechaCertificacion: String(tfd['@_FechaTimbrado'] ?? ''),
      fechaTimbrado: String(tfd['@_FechaTimbrado'] ?? '').split('T')[0],
      noCertificadoEmisor: String(attr('NoCertificado')),
      noCertificadoSAT: String(tfd['@_NoCertificadoSAT'] ?? ''),
      selloEmisor: String(attr('Sello')),
      selloSAT: String(tfd['@_SelloSAT'] ?? ''),
      formaPago: fpClave ? `${fpClave}.-${FORMA_PAGO[fpClave] || fpClave}` : '',
      metodoPago: '',
      tipoDeComprobante: 'P.-PAGO',
      usoCFDI: 'CP01 PAGOS',
      regimenEmisor: REGIMEN_FISCAL[regimenEmisorClave] || regimenEmisorClave,
      regimenReceptor: REGIMEN_FISCAL[regimenReceptorClave] || regimenReceptorClave,
      lugarExpedicion: String(attr('LugarExpedicion')),
      noCertificado: String(attr('NoCertificado')),
      condicionesDePago: '',
    },
    pagos,
  }
}

export function parseFactura(xmlString) {
  let raw
  try {
    raw = parser.parse(xmlString)
  } catch {
    throw new Error('El archivo no es un XML válido.')
  }

  if (raw['cfdi:Comprobante']) {
    const comp = raw['cfdi:Comprobante']
    if (comp['@_TipoDeComprobante'] === 'P') return parseCFDIPago(comp)
    return parseCFDI(comp)
  }

  const root = raw.Factura ?? raw.factura ?? raw.Invoice ?? raw.invoice ?? raw.FACTURA ?? null
  if (!root) throw new Error('Estructura XML no reconocida. El elemento raíz debe ser <Factura>, <Invoice> o similar.')

  const cab = root.Cabecera ?? root.cabecera ?? root.Header ?? root.header ?? {}
  const emisor = root.Emisor ?? root.emisor ?? root.Seller ?? root.seller ?? cab.Emisor ?? {}
  const receptor = root.Receptor ?? root.receptor ?? root.Buyer ?? root.buyer ?? cab.Receptor ?? {}
  const detBlock = root.Detalle ?? root.detalle ?? root.Lines ?? root.lines ?? root.Items ?? root.items ?? {}
  const lineaRaw = detBlock.Linea ?? detBlock.linea ?? detBlock.Line ?? detBlock.line ?? detBlock.Item ?? detBlock.item ?? []
  const arr = Array.isArray(lineaRaw) ? lineaRaw : lineaRaw ? [lineaRaw] : []
  const lineas = arr.map((l, i) => ({
    numero: i + 1,
    claveProdServ: '', noIdentificacion: '', claveUnidad: '', unidad: '',
    concepto: getText(l, 'Concepto', 'concepto', 'Description', 'description', 'Descripcion') || `Línea ${i + 1}`,
    descripcion: getText(l, 'Concepto', 'concepto', 'Description', 'description', 'Descripcion') || `Línea ${i + 1}`,
    cantidad: getFloat(l, 'Cantidad', 'cantidad', 'Quantity', 'quantity'),
    precioUnitario: getFloat(l, 'PrecioUnitario', 'precioUnitario', 'UnitPrice', 'unitPrice', 'Precio'),
    valorUnitario: getFloat(l, 'PrecioUnitario', 'precioUnitario', 'UnitPrice', 'unitPrice', 'Precio'),
    importe: getFloat(l, 'Importe', 'importe', 'Amount', 'amount', 'Total'),
    descuento: 0, subtotal: getFloat(l, 'Importe', 'importe', 'Amount', 'amount', 'Total'),
    iva: null, ieps: null,
    total: getFloat(l, 'Importe', 'importe', 'Amount', 'amount', 'Total'),
  }))

  const totales = root.Totales ?? root.totales ?? root.Totals ?? root.totals ?? root.Summary ?? {}
  const baseImponible = getFloat(totales, 'BaseImponible', 'baseImponible', 'TaxBase', 'taxBase', 'Subtotal')
  const porcentajeIVA = getFloat(totales, 'PorcentajeIVA', 'porcentajeIVA', 'VATRate', 'vatRate', 'TaxRate')
  const cuotaIVA = getFloat(totales, 'CuotaIVA', 'cuotaIVA', 'VATAmount', 'vatAmount', 'TaxAmount')
  const porcentajeIEPS = getFloat(totales, 'PorcentajeIEPS', 'porcentajeIEPS', 'IEPSRate', 'iepsRate')
  const cuotaIEPS = getFloat(totales, 'CuotaIEPS', 'cuotaIEPS', 'IEPSAmount', 'iepsAmount')
  const total = getFloat(totales, 'Total', 'total', 'TotalAmount', 'totalAmount', 'ImporteTotal')

  const ivaGroupsGen = {}
  const iepsGroupsGen = {}
  for (const l of lineas) {
    if (l.iva) {
      const k = String(l.iva.tasa)
      if (!ivaGroupsGen[k]) ivaGroupsGen[k] = { tasa: l.iva.tasa, base: 0, cuota: 0 }
      ivaGroupsGen[k].base += l.iva.base || 0
      ivaGroupsGen[k].cuota += l.iva.importe || 0
    }
    if (l.ieps) {
      const k = String(l.ieps.tasa)
      if (!iepsGroupsGen[k]) iepsGroupsGen[k] = { tasa: l.ieps.tasa, base: 0, cuota: 0 }
      iepsGroupsGen[k].base += l.ieps.base || 0
      iepsGroupsGen[k].cuota += l.ieps.importe || 0
    }
  }
  let impuestosAgrupadosGen = [
    ...Object.values(ivaGroupsGen).map(g => ({
      tipo: 'IVA',
      tasa: Math.round(g.tasa * 100),
      base: g.base,
      cuota: g.cuota
    })),
    ...Object.values(iepsGroupsGen).map(g => ({
      tipo: 'IEPS',
      tasa: Math.round(g.tasa * 100),
      base: g.base,
      cuota: g.cuota
    }))
  ]
  if (impuestosAgrupadosGen.length === 0) {
    if (porcentajeIVA > 0 && baseImponible > 0) {
      impuestosAgrupadosGen.push({
        tipo: 'IVA',
        tasa: Math.round(porcentajeIVA),
        base: baseImponible,
        cuota: cuotaIVA
      })
    }
    if (porcentajeIEPS > 0 && baseImponible > 0) {
      impuestosAgrupadosGen.push({
        tipo: 'IEPS',
        tasa: Math.round(porcentajeIEPS),
        base: baseImponible,
        cuota: cuotaIEPS
      })
    }
  }

  const factura = {
    numero: getText(cab, 'NumeroFactura', 'numeroFactura', 'InvoiceNumber', 'invoiceNumber', 'Numero') || 'S/N',
    fecha: getText(cab, 'Fecha', 'fecha', 'Date', 'date', 'IssueDate') || '',
    fechaVencimiento: getText(cab, 'FechaVencimiento', 'fechaVencimiento', 'DueDate', 'dueDate') || '',
    moneda: getText(cab, 'Moneda', 'moneda', 'Currency', 'currency') || 'EUR',
    emisor: {
      nombre: getText(emisor, 'Nombre', 'nombre', 'Name', 'name', 'RazonSocial') || 'Emisor desconocido',
      nif: getText(emisor, 'NIF', 'nif', 'TaxID', 'taxId', 'CIF') || '',
      regimenFiscal: '', direccion: getText(emisor, 'Direccion', 'direccion', 'Address', 'address') || '',
      codigoPostal: getText(emisor, 'CodigoPostal', 'codigoPostal', 'PostalCode', 'postalCode', 'CP') || '',
      ciudad: getText(emisor, 'Ciudad', 'ciudad', 'City', 'city', 'Municipio') || '',
      telefono: getText(emisor, 'Telefono', 'telefono', 'Phone', 'phone') || '',
      email: getText(emisor, 'Email', 'email', 'Mail', 'mail') || '',
    },
    receptor: {
      nombre: getText(receptor, 'Nombre', 'nombre', 'Name', 'name', 'RazonSocial') || 'Receptor desconocido',
      nif: getText(receptor, 'NIF', 'nif', 'TaxID', 'taxId', 'CIF') || '',
      domicilioFiscal: '', regimenFiscal: '', usoCFDI: '',
      codigoPostal: getText(receptor, 'CodigoPostal', 'codigoPostal', 'PostalCode', 'postalCode', 'CP') || '',
      ciudad: getText(receptor, 'Ciudad', 'ciudad', 'City', 'city', 'Municipio') || '',
      direccion: getText(receptor, 'Direccion', 'direccion', 'Address', 'address') || '',
    },
    lineas,
    totales: { subtotal: baseImponible, baseImponible, porcentajeIVA, cuotaIVA, totalIva: cuotaIVA, descuento: 0, total, impuestos: impuestosAgrupadosGen },
  }

  if (factura.lineas.length === 0) throw new Error('No se encontraron líneas de detalle en la factura.')
  return factura
}
