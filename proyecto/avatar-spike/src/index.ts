/** API pública del spike (lo que T10 integraría en el front). */
export { Avatar3D, ErrorSinWebGL, relacionPixeles, type OpcionesAvatar3D, type Calidad } from './Avatar3D';
export { AvatarClips, MedioPlaceholder, MedioVideo, type MedioClip } from './clips/AvatarClips';
export { ColaClips, catalogoPlaceholder, CLIP_POR_ACCION, type CatalogoClips } from './clips/ColaClips';
export { Pizarron } from './pizarron/Pizarron';
export { reducirPizarron, vistaPizarron, ESTADO_INICIAL } from './pizarron/reductor';
export { MuestreadorFotogramas, programarMuestreo, dimensionesDestino, REGLA_POR_DEFECTO } from './camara/muestreo';
export { abrirCamara, cerrarCamara, fuenteDeVideo, crearLienzoNavegador } from './camara/captura';
export { RelojAudioContext, RelojManual, type RelojAudio } from './visemas/reloj';
export { MotorVisemas } from './visemas/motor';
export { SincronizadorVisemas } from './visemas/sincronizador';
export { itemsDesdeTexto } from './visemas/desdeTexto';
export { crearModeloProcedural, type ModeloAvatar } from './modelo/procedural';
export { cargarModeloGLB } from './modelo/glb';
export * from './contrato/eventos';
export * from './contrato/encabezado';
