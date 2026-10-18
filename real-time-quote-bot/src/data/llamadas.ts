import fotoJuan from "@/assets/avatar-valid-juan.jpg";
import fotoLaura from "@/assets/avatar-valid-laura.jpg";
import fotoTito from "@/assets/avatar-valid-tito.jpg";

/**
 * Las tres llamadas de la semilla local (SEMILLA_LOCAL=1).
 * Los id públicos coinciden con proyecto/backend/internal/semillalocal.
 */
export type LlamadaArmada = {
  id: string;
  enlace: string;
  nombre: string;
  inicial: string;
  /** Retrato del avatar 3D (scripts/generar-fotos-avatares.mjs). */
  foto: string;
  rubro: string;
  especialidad: string;
  zona: string;
};

export const llamadasArmadas: LlamadaArmada[] = [
  {
    id: "laura",
    enlace: "demoLocalVideocotiz001",
    nombre: "Laura",
    inicial: "L",
    foto: fotoLaura,
    rubro: "Pintura",
    especialidad: "Pintura interior, exterior y acabados",
    zona: "Cobo",
  },
  {
    id: "tito",
    enlace: "demoLocalVideocotiz002",
    nombre: "Tito",
    inicial: "T",
    foto: fotoTito,
    rubro: "Jardinería",
    especialidad: "Corte, poda y mantenimiento de parque",
    zona: "Cobo",
  },
  {
    id: "juan",
    enlace: "demoLocalVideocotiz003",
    nombre: "Juan",
    inicial: "J",
    foto: fotoJuan,
    rubro: "Mantenimiento",
    especialidad: "Preventivo y correctivo",
    zona: "Cobo",
  },
];
