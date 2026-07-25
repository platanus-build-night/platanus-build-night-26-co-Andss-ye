# CLAUDE.md

Instrucciones para Claude Code sobre este repositorio. Léelo completo antes de tocar código.

---

## Qué es este proyecto

`glyphsphere` es una **librería de renderizado de cuerpos celestes en una grilla de caracteres**.
Dibuja un planeta con ASCII, braille y bloques de cuadrante combinados, con zoom continuo desde
órbita alta hasta nivel de calle y navegación tipo canvas.

El primer y único cuerpo implementado es la Tierra, y tiene que quedar excepcionalmente bien
antes de que se agregue cualquier otro. Pero **la arquitectura no puede tener la Tierra
cableada**: el radio, los datasets, la rampa hipsométrica y la atmósfera son propiedades de un
`Body`, no constantes globales. La Luna y una escena multi-cuerpo son trabajo futuro, y el
diseño de hoy tiene que dejarles lugar sin pagar complejidad hoy.

**La primitiva fundamental es la grilla de caracteres.** Todo —continentes, relieve, curvas de
nivel, calles, ciudades, labels, HUD— se escribe en la misma `Grid`. No hay overlays de DOM
flotando encima del mapa.

### Esto no es un conversor de imágenes a ASCII

Es la distinción más importante del proyecto y la que hay que defender en cada decisión. Un
conversor toma píxeles y elige caracteres por luminancia. Nosotros **conocemos la geometría**:
sabemos que eso es una costa, que aquello es un río, que esa banda es la curva de nivel de
2 000 m. Cada carácter se elige porque significa algo, no porque el promedio de brillo cayó en
un rango.

Si alguna vez una decisión de render se puede describir como "promediar luminancia y buscar en
una rampa", está mal.

---

## Prioridades

En este orden. Cuando algo compite, gana lo de más arriba.

1. **Calidad del planeta.** Que la Tierra se vea detallada, correcta y hermosa a todo zoom.
2. **Calidad de la librería.** API chica, estable, documentada, que otro dev pueda extender.
3. **Rendimiento.** Dentro del presupuesto de frame, siempre.
4. **Extensibilidad a otros cuerpos.** Sin cablear la Tierra, sin construir el sistema solar hoy.
5. **Aplicaciones de ejemplo.** El radar de vuelos es *opcional*. Se hace si sobra tiempo.

El radar existe como `examples/flight-radar` para demostrar que la librería acepta datos externos
en tiempo real. **No es el producto.** No se le dedica tiempo hasta que las fases 1 a 5 del
roadmap estén cerradas.

---

## Restricciones duras

No se negocian. Si una tarea parece requerir romper una, para y pregunta.

1. **Tres registros de glifo, con roles fijos.** Braille dibuja líneas. Cuadrantes dibujan bordes
   de área. ASCII rellena áreas y pone marcadores y texto. No se usa braille como textura de
   relleno ni ASCII para linework fino. Ver `docs/RENDERING.md`.
2. **Nada de geometría 3D.** No hay meshes, no hay Three.js, no hay esferas texturizadas. La GPU
   solo dibuja quads con glifos. La proyección es matemática 2D en CPU.
3. **Un solo draw call por frame** en el backend WebGL, más uno para el limbo. Si el conteo sube,
   es un bug.
4. **El core no toca el DOM.** `@glyphsphere/core` debe correr en un Web Worker, en Node y en
   React Native sin cambios. Cero referencias a `window`, `document`, `HTMLElement`.
5. **Nada de constantes de la Tierra en `core`.** No existe `EARTH_RADIUS_KM`. Existe
   `body.radiusKm`. Ver `docs/BODIES.md`.
6. **Paleta indexada de 16 colores.** Los colores se referencian por índice, nunca por RGB en el
   pipeline de render.
7. **Presupuesto de frame: 10 ms en CPU.** Hay benchmarks en `packages/core/bench/` y CI falla
   si se pasan en más de 30 %.

---

## Comandos

```bash
pnpm install            # pnpm >= 9
pnpm dev                # playground en :5173
pnpm build              # build de todos los paquetes
pnpm test               # vitest
pnpm test:visual        # snapshots de grilla en texto plano
pnpm bench              # benchmarks por etapa del pipeline
pnpm data:build         # regenera assets geográficos desde Natural Earth
pnpm font:build         # compila el subset de Iosevka
pnpm typecheck
pnpm lint
```

Antes de dar por terminada cualquier tarea: `pnpm typecheck && pnpm test && pnpm lint`.

---

## Mapa de paquetes

```
packages/
  core/              @glyphsphere/core             Grid, Camera, Projection, registros, LayerStack. Cero DOM.
  bodies/            @glyphsphere/bodies           Definición de Body + perfil de la Tierra.
  layers/            @glyphsphere/layers           Capas: ocean, relief, contours, land, hydro, roads, places…
  sources/           @glyphsphere/sources          Fuentes de tiles: PMTiles, XYZ vectorial.
  data/              @glyphsphere/data             Assets preprocesados + scripts de build.
  renderer-webgl/    @glyphsphere/renderer-webgl   Backend WebGL2. Default.
  renderer-canvas/   @glyphsphere/renderer-canvas  Backend Canvas2D. Fallback y React Native.
  renderer-dom/      @glyphsphere/renderer-dom     Backend <pre>. Accesibilidad, export, tests.
  react/             @glyphsphere/react            Componente <Glyphsphere /> y hooks.
```

Dependencias permitidas: `bodies` → `core`. `layers` → `core` + `bodies`. `sources` → `core`.
`renderer-*` → `core`. `react` → `core` + un renderer. **`core` no depende de nadie del workspace.**

Árbol de archivos completo en `docs/REPOSITORY.md`.

---

## Documentación

| Documento | Cuándo leerlo |
|---|---|
| `docs/ARCHITECTURE.md` | Siempre, antes de la primera tarea. Pipeline y modelo de hilos. |
| `docs/REPOSITORY.md` | Dónde va cada archivo. Consultalo antes de crear uno nuevo. |
| `docs/RENDERING.md` | Los tres registros, selección de glifo, atlas, backends. |
| `docs/RELIEF.md` | Realce hipsométrico: cómo se logra que la tierra se vea *sobre* el agua. |
| `docs/CAMERA.md` | Proyección, zoom, paneo, LOD. Matemática derivada. |
| `docs/DATA.md` | Fuentes geográficas, tiles, detalle a escala de ciudad. |
| `docs/BODIES.md` | Abstracción de cuerpo celeste. Camino a la Luna y a la escena 3D. |
| `docs/API.md` | Superficie pública. Contrato. |
| `docs/AESTHETIC.md` | Paleta, charsets, tipografía, lenguaje visual. |
| `docs/ROADMAP.md` | Fases y orden de trabajo. Empezá acá si no sabés qué hacer. |

Referencia visual en `docs/reference/`.

---

## Convenciones de código

- **TypeScript estricto.** `strict`, `noUncheckedIndexedAccess`. Sin `any`.
- **Sin clases salvo para objetos con ciclo de vida** (`Grid`, `Camera`, `Renderer`, `LayerStack`,
  `TileCache`). Todo lo demás son funciones puras.
- **Typed arrays en el hot path.** Nada de arrays de objetos. Cero asignaciones dentro del loop
  de render: los buffers se preasignan y se reusan.
- **Nombres de coordenadas con su espacio.** Nunca `x`, `y`, `pos` a secas. Usá `lonLat`,
  `screenPx`, `cellXY`, `subXY` (subcelda braille), `tileXY`. Los bugs de este proyecto son casi
  todos confusión de espacio de coordenadas.
- **Unidades en el nombre.** `altitudeKm`, `radiusPx`, `bearingDeg`, `frameMs`, `elevationM`.
- **Comentarios solo para el porqué.** La matemática de proyección y la codificación de braille
  sí llevan comentario con la derivación.

## Errores frecuentes en este proyecto

- **Relación de aspecto de celda.** Vive en un solo lugar (`Projection.cellAspect`). No la
  repliques. Sin ella el planeta sale ovalado y las subceldas braille dejan de ser cuadradas.
- **Codificación de braille.** El orden de bits de los puntos 7 y 8 no sigue el patrón de los
  puntos 1 a 6. Usá la tabla de `core/src/raster/registers/braille.ts`, no la deduzcas.
- **Culling del hemisferio oculto.** Todo punto testea visibilidad antes de proyectarse. Objetos
  con altura propia (aviones, satélites) ven más allá del horizonte del suelo.
- **Mezclar registros en la misma celda.** Una celda tiene un registro y uno solo. La resolución
  de conflictos es por prioridad, en `reduce.ts`.
- **Reasignar typed arrays en resize.** Preasigná al máximo esperado y usá subvistas.
- **`getImageData` más de una vez por frame.** Una sola llamada, buffer reusado.
- **Asumir cobertura de fuente.** Braille y cuadrantes pueden faltar. El atlas detecta glifos
  ausentes al construirse y activa el set de respaldo. No asumas que están.

---

## Qué NO hacer

- No agregues dependencias sin justificarlo. Runtime permitido: `d3-geo`, `d3-geo-projection`,
  `topojson-client`, `versor`, `pmtiles`, `@mapbox/vector-tile`, `pbf`. Nada más.
- No metas React en `core`, `bodies`, `layers`, `sources` ni `renderer-*`.
- No pongas constantes ni datasets de la Tierra en `core`.
- No implementes features que no estén en `docs/ROADMAP.md` sin preguntar.
- No trabajes en `examples/flight-radar` hasta que el roadmap lo habilite.
- No "arregles" la matemática de `docs/CAMERA.md`. Está derivada y verificada.
- No construyas la escena multi-cuerpo todavía. `docs/BODIES.md` dice exactamente qué preparar
  hoy y qué no.
