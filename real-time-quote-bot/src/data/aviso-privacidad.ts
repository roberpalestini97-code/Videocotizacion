/** Aviso que acompaña al consentimiento de la llamada (versión del contrato). */
export const AVISO_VIGENTE = "2026-10-08.1";

export const LEY_DATOS_URL =
  "https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion";

export const AAIP_URL = "https://www.argentina.gob.ar/aaip";

export type SeccionAviso = {
  id: string;
  titulo: string;
  parrafos: string[];
};

export const SECCIONES_AVISO: SeccionAviso[] = [
  {
    id: "responsable",
    titulo: "Quién es responsable",
    parrafos: [
      "El responsable del tratamiento es quien opera VideoCotización. En cada llamada, el profesional que te atiende recibe el presupuesto de su consulta y, solo si lo pedís, tus datos de contacto.",
      "La razón social, el domicilio y el medio definitivo para ejercer tus derechos se publican en este aviso antes de abrir el servicio al público.",
    ],
  },
  {
    id: "finalidad",
    titulo: "Para qué usamos tus datos",
    parrafos: [
      "Usamos la imagen y la voz de la llamada para entender el trabajo y armar un presupuesto orientativo. Esa es la finalidad. No los usamos para publicidad ni para entrenar modelos.",
      "El presupuesto no es un contrato de obra. Lo confirma el profesional cuando ve el trabajo.",
    ],
  },
  {
    id: "datos",
    titulo: "Qué datos entran en la llamada",
    parrafos: [
      "Durante la videollamada se usan la cámara y el micrófono. Los fotogramas y el audio no se guardan: se leen en el momento para estimar superficie, estado y esfuerzo, y después se descartan.",
      "Si pedís que te contacten, guardamos el nombre, el teléfono, la zona del trabajo y el detalle del presupuesto, con un consentimiento aparte y no premarcado.",
      "También registramos que declaraste ser mayor de 18 años y que aceptaste este aviso, con el número de versión.",
    ],
  },
  {
    id: "destinatarios",
    titulo: "Quiénes los reciben",
    parrafos: [
      "El profesional de esa consulta. Los proveedores técnicos que transcriben, interpretan el trabajo y generan la voz del asistente, únicamente para prestar la llamada.",
      "No cedemos tus datos para que un tercero te ofrezca otra cosa.",
    ],
  },
  {
    id: "obligatoriedad",
    titulo: "Si el dato es obligatorio",
    parrafos: [
      "La cámara y el micrófono son necesarios para cotizar por video. Sin ellos no podemos ver el trabajo ni cerrar un número.",
      "El contacto posterior es opcional. Podés terminar la llamada con el presupuesto y no dejar teléfono.",
    ],
  },
  {
    id: "consecuencias",
    titulo: "Qué pasa si no los das",
    parrafos: [
      "Si no aceptás el aviso, o si negás la cámara o el micrófono, la llamada no empieza. No se abre ningún dispositivo y no se arma el presupuesto.",
    ],
  },
  {
    id: "transferencia",
    titulo: "Tratamiento fuera de Argentina",
    parrafos: [
      "Algunos proveedores técnicos pueden procesar datos de la llamada fuera del país. El inventario de proveedores, el país y las cláusulas de esa transferencia se cierran con asesoramiento legal antes de abrir el servicio al público.",
    ],
  },
  {
    id: "derechos",
    titulo: "Tus derechos",
    parrafos: [
      "Podés pedir acceso, rectificación, actualización o supresión de tus datos, sin cargo. La Ley 25.326 de Protección de los Datos Personales reconoce esos derechos.",
      "En esta etapa el pedido se hace desde Contacto. El formulario de esta demo todavía no despacha el mensaje a un responsable: el canal definitivo queda publicado en este aviso antes de la apertura.",
    ],
  },
  {
    id: "autoridad",
    titulo: "Dónde reclamar",
    parrafos: [
      "La autoridad de control es la Agencia de Acceso a la Información Pública (AAIP). Podés consultar tus derechos y presentar un reclamo en su sitio.",
    ],
  },
  {
    id: "asistente",
    titulo: "Asistente automático",
    parrafos: [
      "En la llamada te atiende un asistente automático, con apariencia de trabajador. No es una persona. El número que ves es orientativo.",
    ],
  },
];
