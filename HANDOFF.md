# Movy + Twister + KeyStep Pro: estado para continuar

Última actualización: 2026-11-16. Escribe al usuario en español.

## Montaje del usuario
- Ableton Move con Schwung 1.9.3 y Movy v0.37.0 como arranque (boot target). Se accede por SSH: `root@move.local` y `ableton@move.local`, clave `~/.ssh/move_key`.
- En el puerto MIDI (USB-A) del Move hay un hub alimentado con un **Midi Fighter Twister** (de fábrica) y un **KeyStep Pro**.
- Por MIDI DIN: MicroBrute en el canal 2 y PRO-800 en el canal 4. Ojo: chocan con "canal = pista".
- La pantalla del Move se puede ver con el stream SSE `http://move.local:7700/stream-auto?v=2` (formato mono1_packed, 128x64, páginas de 8 px) renderizado a PNG. Hay un script de ejemplo en la memoria del proyecto.

## Hecho: Twister en Movy (funciona en el Move del usuario)
- Instalado en el Move: `/data/UserData/schwung/modules/tools/movy/ui.js` (parche sobre v0.37.0). La versión original está en `/data/UserData/schwung/backup-movy-ui-v0.37.0-original.js`.
- Si se actualiza Movy desde el Manager, el parche se pierde y hay que reaplicarlo.
- Mapa de encoders: 1 = jog (1 página cada 10 valores) y su pulsación = clic del jog; 3 = presets (desde cualquier página); 4 pulsado = Back; 9–16 = knobs 1–8. El encoder 2 (CC 1, rueda de modulación) no se usa. Aros verdes en los encoders asignados y apagados en el resto.
- Versión v0.37.0 compilada en `ui.js`, con el parche en `movy-v0.37.0-twister.patch` (incluye logs de diagnóstico; la versión limpia es la de main).

## Contribución upstream (preparada, NO publicada)
- Repositorio de trabajo: `schwung-movy/`, rama `external-knob-controller`, commit 203c9130 sobre el main de DimaDake/schwung-movy. Parche en `0001-...patch`.
- Borradores en inglés: `1-ISSUE.md` y `2-PULL-REQUEST.md`.
- Tests offline: todos pasan menos `abi-parity`, que falla también en main sin cambios.
- Para ejecutar los tests: `npm ci`, clonar `charlesvestal/schwung` en `../schwung` (al lado del repo) y luego `node build/browser.mjs` y `node browser-test/logic.mjs`, etc.
- `gh` tiene sesión iniciada como `rogerbacardit`. **No publicar nada sin confirmación explícita del usuario:** primero el issue, luego el fork y el PR.

## Siguiente: "canal = pista" (KeyStep Pro). PENDIENTE de decidir
Problema: el motor de Movy (`engine/crates/movy-dsp/src/ext_route.rs`) junta todos los canales en la pista seleccionada. El usuario quiere tocar, por ejemplo, un arpegio en el canal 2 y otro en el canal 4 en pistas distintas.

Propuesta hablada:
- Un ajuste en Settings: "MIDI In: pista seleccionada (por defecto) / canal N → pista N".
- Pistas de batería: nota 36 + i → pad i, como ahora.
- Grabación: cada canal graba en su pista.

KeyStep Pro: pista 1 en modo drum, pistas 2–4 con secuenciador o arpegiador. Comprobar que las notas de batería empiecen en C1 (36).

Pendientes y dudas:
- Choque con el MicroBrute (canal 2) y el PRO-800 (canal 4). Opción alternativa: que cada pista elija su canal de entrada.
- Movy ignora el reloj MIDI de entrada y no envía reloj, así que los clips de Movy y el KeyStep se desfasarán.
- Hay que tocar Rust. En el Mac NO están instalados `rustup` ni `cargo` (Homebrew sí). Hace falta `rustup` con el target `aarch64-unknown-linux-gnu` y `brew install messense/macos-cross-toolchains/aarch64-unknown-linux-gnu`, ver `scripts/build-dsp.sh`. **Pedir permiso antes de instalar.**
- Para probar en el Move (v0.37.0) hay que portar el cambio también a la v0.37.0: `ui.js` + `dsp.so`, con el mismo ENGINE_VERSION.

El usuario tiene dudas sobre la implementación: empezar por escucharlas.

## 2026-11-16: los aros del Twister siguen al parámetro
- Problema: el Twister de fábrica es absoluto (0–127). Al llegar a su tope dejaba de mandar mensajes y el parámetro del Move no llegaba al final.
- Arreglo en el `ui.js` del Move: `twisterFollow(levels)` se llama desde `updateKnobLEDsFrom` y manda el valor de cada knob al Twister (canal 1, CC 8–15). También pone `absLast` a ese valor. Solo empieza a mandar después de recibir el primer CC del Twister. `paintTwister` vuelve a mandarlo todo.
- Copia local: `ui-device-con-sync.js`. Copia de seguridad en el Move: `/data/UserData/schwung/backup-movy-ui-twister-antes-de-sync.js`.
- Falta pasarlo al repo `schwung-movy` (ext-knobs.ts) si funciona en el Move.

## 2026-11-16: pulsar encoders 9–16 = volver al valor del preset
- `twBaseNote` (en el manejador de giros de knob, tanto del Move como del Twister) guarda el primer valor de cada parámetro en `twBase`, con la clave `track:componentKey:ioKey`.
- `twBaseForget` borra esos valores al cambiar de preset: con el encoder 3 (`extPresetTurn`) o con el knob 1 en la página de presets.
- `twResetKnob`: al pulsar en el canal 2 los CC 8–15, escribe el valor guardado con `setParam` en la misma fuente que usa la página (virtual, propia de Movy o `componentPort`). El valor guardado no se borra tras el reset. Deja una línea `twReset` en el log.
- Limitación: un preset cargado por el navegador (jog) no borra los valores guardados.
- PROBADO Y FUNCIONA en el Move (2026-11-16), junto con los aros que siguen al parámetro. Copia local: `ui-device-con-sync.js`. La copia de seguridad de antes de ambos cambios sigue en el Move: `/data/UserData/schwung/backup-movy-ui-twister-antes-de-sync.js`.
