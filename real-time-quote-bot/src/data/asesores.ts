import martaImg from "@/assets/avatar-marta.jpg";
import diegoImg from "@/assets/avatar-diego.jpg";
import luciaImg from "@/assets/avatar-lucia.jpg";

/** Voces P-Video-Avatar (inference.sh / belt) para Spanish. */
export type AvatarVoz = {
  voice: string;
  voiceLanguage: string;
  voicePrompt: string;
  videoPrompt: string;
  /** Ruta relativa al JPG fuente para generación offline. */
  imagenFuente: string;
};

export type Asesor = {
  id: string;
  nombre: string;
  inicial: string;
  rubro: string;
  especialidad: string;
  tono: string;
  foto: string;
  avatar: AvatarVoz;
  guion: Turno[];
};

export type Turno = {
  de: "asesor" | "cliente";
  texto: string;
  /** Dato que el asesor registra en ese turno (observabilidad de la cotización). */
  dato?: { etiqueta: string; valor: string };
  presupuesto?: { total: string; detalle: string; plazo: string };
};

/** Clip talking-head pregenerado: public/avatars/{asesorId}/{indiceGuion}.mp4 */
export function clipAvatarPath(asesorId: string, indiceGuion: number): string {
  return `/avatars/${asesorId}/${indiceGuion}.mp4`;
}

export const asesores: Asesor[] = [
  {
    id: "marta",
    nombre: "Marta",
    inicial: "M",
    rubro: "Pintura",
    especialidad: "Pintura interior, exterior y acabados",
    tono: "Cálida y detallista",
    foto: martaImg,
    avatar: {
      voice: "Kore (Female)",
      voiceLanguage: "Spanish",
      voicePrompt: "Cálida, cercana y detallista, ritmo natural rioplatense",
      videoPrompt:
        "Professional tradeswoman on a video call, looking at camera, natural gestures, soft indoor lighting",
      imagenFuente: "src/assets/avatar-marta.jpg",
    },
    guion: [
      {
        de: "asesor",
        texto:
          "¡Hola! Soy Marta. Mostrame con la cámara el ambiente que querés pintar y te armo el presupuesto en el momento.",
      },
      { de: "cliente", texto: "Quiero pintar la sala, son unos 20 m².", dato: { etiqueta: "Superficie", valor: "20 m²" } },
      {
        de: "asesor",
        texto: "Veo humedad en el zócalo y dos manos necesarias sobre el tono actual. ¿La pared está fisurada?",
        dato: { etiqueta: "Preparación", valor: "Sellado de humedad" },
      },
      { de: "cliente", texto: "Sí, hay unas fisuras finas cerca de la ventana.", dato: { etiqueta: "Esfuerzo", valor: "Medio · 1,5 jornadas" } },
      {
        de: "asesor",
        texto: "Listo. Con enduido, sellador y dos manos de látex premium el trabajo queda en:",
        presupuesto: { total: "$185.400", detalle: "Materiales + mano de obra", plazo: "2 días de obra" },
      },
    ],
  },
  {
    id: "diego",
    nombre: "Diego",
    inicial: "D",
    rubro: "Jardinería",
    especialidad: "Corte, poda y mantenimiento de parque",
    tono: "Práctico y directo",
    foto: diegoImg,
    avatar: {
      voice: "Puck (Male)",
      voiceLanguage: "Spanish",
      voicePrompt: "Práctico, directo y confiado, sin rodeos",
      videoPrompt:
        "Professional gardener on a video call, looking at camera, casual outdoor workwear feel, natural light",
      imagenFuente: "src/assets/avatar-diego.jpg",
    },
    guion: [
      {
        de: "asesor",
        texto: "¡Hola! Soy Diego. Recorré el jardín con la cámara así mido el trabajo y el mantenimiento que necesita.",
      },
      { de: "cliente", texto: "Es un fondo de 120 m², hace tres meses que no se corta.", dato: { etiqueta: "Superficie", valor: "120 m²" } },
      {
        de: "asesor",
        texto: "Veo pasto alto y dos árboles para poda de altura. Eso suma retiro de residuos.",
        dato: { etiqueta: "Retiro", valor: "3 bolsones" },
      },
      { de: "cliente", texto: "Sí, y quisiera dejarlo con mantenimiento mensual.", dato: { etiqueta: "Recurrencia", valor: "Mensual" } },
      {
        de: "asesor",
        texto: "Te dejo puesta a punto inicial más abono mensual:",
        presupuesto: { total: "$96.800", detalle: "Puesta a punto + primer mes", plazo: "1 jornada" },
      },
    ],
  },
  {
    id: "lucia",
    nombre: "Lucía",
    inicial: "L",
    rubro: "Limpieza",
    especialidad: "Limpieza profunda y post obra",
    tono: "Clara y organizada",
    foto: luciaImg,
    avatar: {
      voice: "Zephyr (Female)",
      voiceLanguage: "Spanish",
      voicePrompt: "Clara, organizada y profesional, tono amable",
      videoPrompt:
        "Professional cleaning specialist on a video call, looking at camera, neat appearance, bright indoor lighting",
      imagenFuente: "src/assets/avatar-lucia.jpg",
    },
    guion: [
      {
        de: "asesor",
        texto: "¡Hola! Soy Lucía. Mostrame los ambientes y te digo cuántas personas y horas lleva dejarlo impecable.",
      },
      { de: "cliente", texto: "Es un depto de 3 ambientes después de una obra.", dato: { etiqueta: "Tipo", valor: "Post obra" } },
      {
        de: "asesor",
        texto: "Veo polvo fino en carpinterías y restos de cemento en pisos: eso pide productos específicos.",
        dato: { etiqueta: "Insumos", valor: "Línea post obra" },
      },
      { de: "cliente", texto: "Necesito que quede para mudarme el viernes.", dato: { etiqueta: "Plazo", valor: "Antes del viernes" } },
      {
        de: "asesor",
        texto: "Con dos personas durante una jornada completa queda listo:",
        presupuesto: { total: "$74.200", detalle: "2 personas · 8 horas", plazo: "1 jornada" },
      },
    ],
  },
];

export const asesorPorDefecto: Asesor = asesores[0]!;
