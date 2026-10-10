/**
 * Pizarrón en vivo (DOM). Muestra los datos anotados; no interrumpe la conversación:
 * región `aria-live="polite"`, resaltado breve de lo que cambió, sin modales ni foco robado.
 * Todo el texto se inserta con textContent (R19): nunca innerHTML.
 */
import type { EventoPizarronActualizado, EventoPizarronCorregir } from '../contrato/eventos';
import {
  ESTADO_INICIAL,
  eventoCorreccion,
  reducirPizarron,
  vistaPizarron,
  type EstadoPizarron,
} from './reductor';

export interface OpcionesPizarron {
  /** Se llama con el evento a mandar por el socket cuando el cliente corrige un dato. */
  alCorregir?: (ev: EventoPizarronCorregir) => void;
  /** Generador de `seq` (por dirección, creciente) que comparte el cliente del socket. */
  siguienteSeq?: () => number;
  titulo?: string;
  /** ms que dura el resaltado de un dato nuevo/cambiado. */
  resaltadoMs?: number;
}

export class Pizarron {
  readonly raiz: HTMLElement;
  private readonly lista: HTMLDListElement;
  private estado: EstadoPizarron = ESTADO_INICIAL;
  private seqLocal = 0;

  constructor(contenedor: HTMLElement, private readonly op: OpcionesPizarron = {}) {
    this.raiz = document.createElement('section');
    this.raiz.className = 'vc-pizarron';
    this.raiz.setAttribute('aria-label', op.titulo ?? 'Datos anotados');
    const h = document.createElement('h2');
    h.textContent = op.titulo ?? 'Lo que vamos anotando';
    this.lista = document.createElement('dl');
    this.lista.setAttribute('aria-live', 'polite');
    this.raiz.append(h, this.lista);
    contenedor.appendChild(this.raiz);
  }

  get estadoActual(): EstadoPizarron {
    return this.estado;
  }

  recibir(ev: EventoPizarronActualizado): boolean {
    const antes = this.estado;
    this.estado = reducirPizarron(this.estado, { tipo: 'servidor', evento: ev });
    if (this.estado.version !== antes.version) {
      this.render();
      return true;
    }
    return false;
  }

  corregir(clave: string, valor: string): EventoPizarronCorregir | null {
    this.estado = reducirPizarron(this.estado, { tipo: 'corregir', clave, valor });
    const seq = this.op.siguienteSeq ? this.op.siguienteSeq() : ++this.seqLocal;
    const ev = eventoCorreccion(this.estado, clave, seq);
    if (ev) {
      this.render();
      this.op.alCorregir?.(ev);
    }
    return ev;
  }

  private render(): void {
    const filas = vistaPizarron(this.estado);
    const frag = document.createDocumentFragment();
    for (const f of filas) {
      const dt = document.createElement('dt');
      dt.textContent = f.etiqueta;
      const dd = document.createElement('dd');
      dd.textContent = f.estado === 'faltante' ? 'Falta' : f.valor;
      dd.dataset.clave = f.clave;
      dd.dataset.estado = f.estado;
      if (f.pendiente) dd.dataset.pendiente = 'si';
      if (f.cambiada) {
        dd.classList.add('vc-cambio');
        setTimeout(() => dd.classList.remove('vc-cambio'), this.op.resaltadoMs ?? 1500);
      }
      frag.append(dt, dd);
    }
    this.lista.replaceChildren(frag);
  }

  destruir(): void {
    this.raiz.remove();
  }
}
