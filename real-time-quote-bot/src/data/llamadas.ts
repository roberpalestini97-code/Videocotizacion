/**
 * Las tres llamadas de la semilla local (SEMILLA_LOCAL=1).
 * Los id públicos coinciden con proyecto/backend/internal/semillalocal.
 */
export type LlamadaArmada = {
  id: string;
  enlace: string;
  nombre: string;
  inicial: string;
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
    rubro: "Pintura",
    especialidad: "Pintura interior, exterior y acabados",
    zona: "Cobo",
  },
  {
    id: "tito",
    enlace: "demoLocalVideocotiz002",
    nombre: "Tito",
    inicial: "T",
    rubro: "Jardinería",
    especialidad: "Corte, poda y mantenimiento de parque",
    zona: "Cobo",
  },
  {
    id: "juan",
    enlace: "demoLocalVideocotiz003",
    nombre: "Juan",
    inicial: "J",
    rubro: "Mantenimiento",
    especialidad: "Preventivo y correctivo",
    zona: "Cobo",
  },
];
