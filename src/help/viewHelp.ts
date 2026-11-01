export interface ViewHelp {
    title: string;
    intro: string;
    steps?: string[];
    tips?: string[];
}

const egresoTips = [
    'El responsable interno se asigna automáticamente con tu usuario de Authentik.',
    'Usa “Limpiar” para empezar de nuevo; el borrador se guarda mientras completas el formulario.'
];

export const viewHelp: Record<string, ViewHelp> = {
    donaciones: {
        title: 'Registrar donaciones',
        intro: 'Registra aportes en dinero (pecuniarios) o en bienes (en especie). Elige el tipo arriba.',
        steps: [
            'Pecuniaria: busca al donante por nombre o RUT, revisa el responsable, indica monto y fondo destino.',
            'En especie: identifica donador y receptor, busca cada ítem del catálogo, ingresa cantidad y precio y presiona “Agregar ítem”.',
            'Revisa el total y presiona “Registrar donación”.'
        ],
        tips: [
            'La fecha es hoy por defecto; tócala para cambiarla.',
            'Los fondos se administran en “Cuentas”.',
            'Si un ítem no existe en el catálogo puedes crearlo desde el buscador.',
            'Con “Escanear” apuntas la cámara al código de barras: confirma cantidad y precio y presiona Enter o “Agregar”; la cámara sigue abierta para el siguiente producto. Si el código ya está en la lista se suma la cantidad. Toca “Terminar” al acabar.',
            'Si un producto escaneado no está en el catálogo se sugiere su nombre (Open Food Facts) o lo escribes tú; se crea al registrar.'
        ]
    },
    compras: {
        title: 'Registrar compras',
        intro: 'Ingresa compras de inventario con su cuenta de origen, documento tributario y detalle de ítems.',
        steps: [
            'Busca el proveedor y confirma el responsable interno.',
            'Ingresa monto neto e IVA; el total se calcula solo. Elige la cuenta de origen.',
            'Adjunta la boleta si la tienes (foto, galería o PDF).',
            'Agrega cada ítem con su cantidad y precio unitario.',
            'Presiona “Registrar compra”.'
        ],
        tips: [
            'Puedes ver la boleta de la última compra justo bajo el formulario, o todas en “Logs”.',
            'Con “Escanear” apuntas la cámara al código de barras: confirma cantidad y precio y presiona Enter o “Agregar”; la cámara sigue abierta para el siguiente producto. Si el código ya está en la lista se suma la cantidad. Toca “Terminar” al acabar.',
            'La cámara necesita permiso del navegador; si no funciona, usa el ícono del teclado para escribir el código.'
        ]
    },
    ayudaSocial: {
        title: 'Entregar ayuda social',
        intro: 'Registra la salida de recursos hacia un beneficiario, ya sea dinero o bienes del inventario.',
        steps: [
            'Elige si es un egreso pecuniario o en especie.',
            'Busca al beneficiario.',
            'Pecuniario: indica monto, cuenta de origen y método de pago. En especie: agrega los ítems con su cantidad (se valorizan a precio promedio ponderado).',
            'Revisa el total y presiona “Registrar egreso”.'
        ],
        tips: egresoTips
    },
    consumoInterno: {
        title: 'Consumo interno',
        intro: 'Registra recursos usados por la propia fundación (programas, eventos, operación).',
        steps: [
            'Elige pecuniario o en especie.',
            'Indica el programa o evento y agrega una anotación si hace falta.',
            'Completa monto/cuenta o los ítems consumidos y presiona “Registrar egreso”.'
        ],
        tips: egresoTips
    },
    ajusteBienes: {
        title: 'Ajuste de bienes',
        intro: 'Corrige el stock físico cuando el inventario no coincide con lo registrado.',
        steps: [
            'Elige si el ajuste es un egreso (faltan unidades) o un ingreso (sobran).',
            'Agrega los ítems y la cantidad a ajustar.',
            'Explica el motivo en las anotaciones y registra.'
        ]
    },
    ajustePecuniario: {
        title: 'Ajuste pecuniario',
        intro: 'Corrige el saldo de una cuenta o fondo cuando no coincide con la realidad.',
        steps: [
            'Elige si el ajuste es un egreso o un ingreso.',
            'Indica monto y cuenta, y explica el motivo en las anotaciones.',
            'Presiona “Registrar egreso”.'
        ]
    },
    entidades: {
        title: 'Personas e instituciones',
        intro: 'Administra a todas las personas e instituciones de la fundación desde un solo lugar.',
        steps: [
            'Cambia entre Personas e Instituciones con el selector de arriba.',
            'Busca por nombre, RUT o comuna, o identifica a alguien con el huellero.',
            'Marca personas en la tabla para asignarles etiquetas o enviarles un WhatsApp.',
            'Usa “+ Persona” o “+ Institución” para registrar nuevas.'
        ],
        tips: ['El botón de etiquetas junto al filtro permite crear y editar etiquetas.']
    },
    familias: {
        title: 'Familias',
        intro: 'Agrupa personas por hogar, registra la jefatura y documenta la vulnerabilidad.',
        steps: [
            'Selecciona una familia de la lista o crea una con “Nueva familia”.',
            'Completa nombre, jefe/a de hogar, puntaje y justificación, y presiona “Guardar”.',
            'En Miembros, busca a cada persona, indica su rol (opcional) y presiona “Agregar”.'
        ],
        tips: ['Si una persona no existe, puedes registrarla desde el buscador.']
    },
    asistencia: {
        title: 'Asistencia',
        intro: 'Cada encuentro tiene su propia lista. Registra a las personas a medida que llegan.',
        steps: [
            'Crea un evento (por ejemplo “18 de septiembre”) o abre uno existente.',
            'En “Registrar llegada”, busca por nombre o RUT y selecciona a la persona (o a su grupo familiar).',
            'También puedes registrar con el huellero: deja el lector activo y cada huella marca la llegada.',
            'Agrega columnas (Sí/No, texto o número) para registrar datos extra, como “Recibió colación”.'
        ],
        tips: [
            'Los cambios se guardan automáticamente y la lista se comparte entre todos los equipos (se actualiza cada pocos segundos).',
            'Las columnas Sí/No muestran el total de respuestas; las numéricas, la suma.',
            'Usa “Copiar enlace” para que otro equipo abra la misma lista.'
        ]
    },
    campanas: {
        title: 'Campañas',
        intro: 'Relaciona beneficiarios con padrinos o madrinas y sigue cada entrega y agradecimiento.',
        steps: [
            'Crea una campaña: “Apadrinamiento” trae columnas de regalos y agradecimientos; “Personalizada” parte vacía.',
            'Agrega beneficiarios y asígnales un padrino o madrina (puede ser después).',
            'Marca el avance en cada columna y usa las columnas de WhatsApp para enviar mensajes.'
        ],
        tips: [
            'Una fila por beneficiario; un mismo padrino puede apoyar a varios.',
            'Los cambios se guardan por casilla. Usa “Actualizar” para ver lo que hizo el resto del equipo.',
            'Una campaña cerrada no se puede editar; cámbiala a “Activa” para continuar.'
        ]
    },
    solicitudes: {
        title: 'Solicitudes',
        intro: 'Registra necesidades de insumos de programas y talleres, vinculadas a un solicitante.',
        steps: [
            'Busca al solicitante e indica el programa o actividad, la fecha y la hora.',
            'Agrega ítems desde el catálogo o escríbelos manualmente si no existen.',
            'Revisa el resumen y presiona “Registrar solicitud”.'
        ]
    },
    catalogo: {
        title: 'Catálogo de ítems',
        intro: 'Gestiona los artículos, productos y recursos valorizados de la fundación.',
        tips: [
            'Haz clic en el encabezado de una columna para ordenar.',
            'PPM es el precio promedio ponderado; el valor total es stock × PPM.',
            'Usa el lápiz para editar un ítem.',
            'Puedes asignar o escanear el código de barras de cada ítem al crearlo o editarlo; el buscador también encuentra por código.',
            'El precio de referencia se recalcula con la mediana de las compras de los últimos 180 días; la fecha indica cuándo se actualizó.'
        ]
    },
    cuentas: {
        title: 'Cuentas y fondos',
        intro: 'Administra las cuentas operativas (cuentas corrientes, caja chica, fondos especiales), sus saldos y movimientos.',
        steps: [
            'Selecciona una cuenta en la tabla para ver su detalle y movimientos recientes.',
            'Crea una cuenta nueva con el formulario lateral, o usa “Editar” para renombrar la seleccionada.'
        ],
        tips: ['Los saldos se actualizan en tiempo real con cada ingreso y egreso.']
    },
    usuarios: {
        title: 'Usuarios',
        intro: 'Crea accesos al sistema y define sus permisos en Authentik.',
        steps: [
            'Usa “Nuevo usuario”, vincúlalo a la persona interna y define una contraseña temporal.',
            'Marca si pertenece a renacer-admin o renacer-puerta y guarda.',
            'Los íconos de cada fila permiten editar, cambiar contraseña, activar/desactivar y dar o quitar permisos de admin.'
        ]
    },
    logs: {
        title: 'Logs',
        intro: 'Historial de ingresos y egresos para auditoría, reportes e impresión de informes.',
        steps: [
            'Filtra por tipo, estado, programa o rango de fechas y presiona “Actualizar”.',
            'Revisa el comparativo global y la tabla de registros.',
            'Usa “Imprimir resumen” para obtener un informe.'
        ],
        tips: [
            'Diferencia = Ingresos − (egresos pecuniarios + egresos no pecuniarios + valor inventario + saldo en fondos). Debería ser cercana a cero.',
            'En “Compras y boletas” puedes abrir la boleta adjunta de cada compra.'
        ]
    },
    dashboardAi: {
        title: 'Dashboard AI',
        intro: 'Pregunta en lenguaje normal. La IA consulta asistencia, campañas, ingresos, egresos, inventario y personas, y responde con cifras, tablas y gráficos.',
        tips: [
            'Puede crear o modificar registros, pero siempre te pide confirmación antes.',
            'Las consultas se calculan en tu navegador. Al proveedor de IA nunca se envían RUT, teléfonos, correos ni direcciones.',
            'Los chats se guardan sólo en este navegador.'
        ]
    }
};
