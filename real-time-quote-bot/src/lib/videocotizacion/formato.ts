/** Formato de montos y etiquetas para pantalla. */
import type { ItemCotizacion } from "./tipos";

/** Centavos enteros (int64 del contrato) → "$ 123.456,78". No usa floats para partir enteros y decimales. */
export function formatearCentavos(centavos: number, moneda: string = "ARS"): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.trunc(centavos));
  const enteros = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const miles = String(enteros).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const simbolo = moneda === "USD" ? "US$" : "$";
  return `${neg ? "-" : ""}${simbolo} ${miles},${dec}`;
}

const UNIDADES: Record<string, string> = {
  m2: "m²",
  ml: "m lineales",
  unidad: "u.",
  hora: "h",
  jornada: "jornada(s)",
  visita: "visita(s)",
  global: "global",
};

/** cantidad_centesimas (m² × 100) → "24,5 m²". */
export function formatearCantidad(
  item: Pick<ItemCotizacion, "cantidad_centesimas" | "unidad">,
): string {
  const c = item.cantidad_centesimas;
  const ent = Math.floor(c / 100);
  const dec = c % 100;
  const num = dec === 0 ? String(ent) : `${ent},${String(dec).padStart(2, "0").replace(/0$/, "")}`;
  return `${num} ${UNIDADES[item.unidad] ?? item.unidad}`;
}

export function etiquetaCatalogo(
  textos: Record<string, string> | undefined,
  clave: string,
  defecto: string,
): string {
  return textos?.[clave] ?? defecto;
}

export function reloj(segundos: number): string {
  return `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
}

export const INCISOS_AVISO: Record<string, string> = {
  finalidad: "Para qué usamos tus datos: armar un presupuesto orientativo de tu trabajo.",
  destinatarios:
    "Quiénes los reciben: el profesional que te atiende y los proveedores técnicos del servicio.",
  responsable: "Quién es responsable del tratamiento de tus datos.",
  obligatoriedad: "La cámara y el micrófono son obligatorios para cotizar.",
  consecuencias: "Qué pasa si no los das: no podemos hacer la cotización por video.",
  derechos_arco: "Tus derechos de acceso, rectificación y supresión de datos.",
  transferencia_internacional: "Algunos servicios técnicos pueden procesar datos fuera del país.",
  autoridad_de_control: "Dónde reclamar: la autoridad de control de datos personales.",
};
