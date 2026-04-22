# Farmacia Tepa · Convertidor XML → PDF

Herramienta web interna para convertir comprobantes fiscales CFDI 4.0 (`.xml`) en documentos PDF listos para imprimir o compartir.

## Características

- **CFDI 4.0** — Soporta facturas (`TipoDeComprobante="I"`) y recibos de pago (`TipoDeComprobante="P"`)
- **19 sucursales** — Selector de sucursal integrado; el nombre aparece en el encabezado del PDF
- **PDF profesional** — Logo, código QR de verificación SAT, tabla de conceptos, totales, importe en letras y sellos digitales
- **Optimizado para impresión** — Paleta en escala de grises, tamaño carta (216×279 mm)
- **Historial local** — Los últimos 30 comprobantes procesados se guardan en el navegador; se puede re-descargar el PDF en cualquier momento
- **Procesamiento local** — Ningún archivo sale del navegador; todo se procesa en el cliente

## Tecnologías

| Paquete | Uso |
|---|---|
| [Vue 3](https://vuejs.org/) | Framework UI (Composition API) |
| [Vite](https://vitejs.dev/) | Build tool |
| [jsPDF](https://github.com/parallax/jsPDF) + [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) | Generación de PDF |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | Parseo de CFDI 4.0 |
| [qrcode](https://github.com/soldair/node-qrcode) | QR de verificación SAT |
| [lucide-vue-next](https://lucide.dev/) | Iconos |

## Instalación y desarrollo

```bash
# Instalar dependencias
pnpm install

# Servidor de desarrollo
pnpm dev

# Build de producción
pnpm build
```

## Uso

1. Selecciona la **sucursal** desde la que emites el comprobante.
2. Arrastra o selecciona el archivo `.xml` del CFDI.
3. Revisa el resumen de datos.
4. Descarga el PDF o ábrelo en vista previa.

Los comprobantes procesados quedan en el **historial** para descargarse de nuevo sin volver a subir el XML.

## Estructura del proyecto

```
src/
├── assets/          # Logo e ícono de Farmacia Tepa
├── utils/
│   ├── xmlParser.js     # Parser CFDI 4.0 (factura y pago)
│   └── pdfGenerator.js  # Generador PDF con layout completo
└── App.vue          # Componente principal
```

## Despliegue

El proyecto está configurado para desplegarse en **Vercel** con build automático en cada push a `main`.
