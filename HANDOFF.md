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

## 2026-11-16 (tarde): MIDI IN (un canal por pista). HECHO y probado en el Move
- El usuario eligió "cada pista elige su canal". Rust + compilador cruzado instalados (`~/.cargo`, brew `aarch64-unknown-linux-gnu`, solo esa fórmula marcada como trusted).
- Para el autor (sobre main): rama `midi-channel-per-track` (06e2d6b3 + 936c00a3), parches en `patches-midi-in/`.
  - Motor `ext_route.rs`: el formato de `extmap` pasa a ser `<activa>[;<ch>:<dest>]*`; ledger por canal; 6 tests nuevos.
  - Interfaz: `track/midi-in.ts`, guardado en `ui-state.json` (`midiIn`), fila MIDI IN en el menú de pista (Shift + botón de pista; jog para elegir la fila, knob 1 para cambiar), `markUiStateDirty` al girar.
  - Manual: `site/manual/playing.md` ("A channel for each track") y `controls.md`. Escena de captura `track_menu_midi_in`.
- En el Move (v0.37.0): rama `device-v037` = Twister + aros que siguen el parámetro (ya en el código fuente: `midi/ext-follow.ts`) + MIDI IN con un menú de pista mínimo (solo la fila MIDI IN, porque la v0.37 no tiene Freeze). Parches en `patches-device-v037/`.
  - Desplegados `ui.js` y `dsp.so` (copias: `ui-device-v037-midi-in.js`, `dsp-device-v037-midi-in.so`). Copia de seguridad previa en el Move: `/data/UserData/schwung/backup-movy-<fecha-hora>/`.
  - Probado por el usuario con el KeyStep Pro: T1=CH10 (batería), T2–T4 = CH2–4. Funciona y se guarda en el Set.
- Pendiente: decidir la publicación upstream (¿issue/PR del Twister y de MIDI IN por separado?), sincronizar el reloj MIDI con el KeyStep, y que el usuario cargue un módulo de batería en T1.

## 2026-11-16 (noche): Twister con parámetros de pasos + reset, en el código fuente (rama device-v037, SIN commit)
- Ojo: el `ui.js` de MIDI IN sobrescribió el parche del reset (que se había hecho a mano en el `ui.js`). Ahora el reset está en el código fuente.
- `ext-knob-map.ts`: los encoders 9–16 dan `{kind:'knob', knob, delta, pos}`; la pulsación (canal 2, CC 8–15) da `{kind:'reset', knob}`.
- `ext-param-steps.ts` (puro): un enum o un int de 2 a 32 valores es "de pasos" y se maneja por zonas de la posición del aro. Los parámetros continuos van por pasos relativos, como antes.
- `ext-param.ts`: `extKnobTurn` / `extKnobReset` / `extBaseNote` (también desde `router.ts`) / `extBaseForget` (cambio de preset). Escribe con `pageSourceFor` (exportado desde `schwung-grid.ts`).
- `ext-follow.ts`: `twisterTouched` deja el aro quieto 350 ms mientras se gira, y lo resincroniza al soltar.
- Tests: `browser-test/logic/ext-knobs.mjs` (+21) y entradas nuevas en `build/browser.mjs`. Suites locales en verde salvo `abi-parity` (ya fallaba antes). Typecheck limpio.
- Desplegado (solo `ui.js`, md5 e058c612…). PENDIENTE: que lo pruebe el usuario, y el commit cuando lo apruebe. Copia de seguridad de la versión MIDI IN: `/data/UserData/schwung/backup-movy-ui-device-v037-midi-in.js`.

## 2026-11-16 (noche): colores de pista = colores del Twister (rama device-v037, SIN commit)
- `seq/colors.ts`: las pistas 1–4 son verde (126), azul (125), naranja (3) y morado (23, #972BFF; la 22 "Purple" es azul). Los grupos 2–4 rotan esos mismos 4 colores. Versiones tenues: 85/99/69/109.
- `midi/ext-colors.ts`: los aros asignados toman el color de la pista activa (`TW_HUE`: verde 50, azul 1, naranja 72, morado 112). Son valores ESTIMADOS de la escala de color del Twister y hay que ajustarlos a ojo. Se pinta desde `twisterFollow` solo cuando cambia el color.
- `track-colors.mjs` (se salta si no encuentra la ruta de Schwung de /Users/dake): con estos colores fallarían sus reglas de separación (azul/morado, verde/naranja en daltonismo). Es una preferencia del usuario para su Move, no para el PR upstream.
- Además, el verde de la pista 1 se parece al verde del cursor de reproducción (C_GREEN 11).
- Desplegado solo el `ui.js`.

## 2026-11-16 (noche): cortes de audio → es el módulo Model-72
- Síntoma: una pista se queda en un micro-click unos segundos y vuelve sola. Descartado (con pruebas): el Twister, MIDI IN y nuestros cambios (también pasa con el Movy original), la CPU (medidor ~4-5 %) y Movy (sin "slow frame" en el log). Solo falla la pista de Model-72; con OB-Xd en su lugar no hay cortes.
- Borrador del reporte para el autor: `3-ISSUE-model72.md` (sd88me/schwung-model72, v1.0.0). Sin publicar.
- Pendiente: probar Model-72 con voices=1 como apaño.

## 2026-11-16 (noche): envío al Twister con ritmo + despertar solo con CC del Twister (rama device-v037)
- Causa de los aros mal pintados (la diagnosticó el usuario): un repintado manda 43 mensajes de golpe, y por USB-A solo cabe un paquete de 64 bytes (16 eventos) por tick; el resto se perdía.
- `midi/ext-out.ts`: cola con `twisterSend()`; `twisterOutFlush()` envía como mucho `PER_TICK` = 10 por tick. Se llama desde `tick()` en `app/tick.ts`, después de `tickBody()`. Fusiona mensajes del mismo control (estado + CC; en el canal 3, el brillo RGB y el del indicador por separado) y gana el último valor. `ext-colors.ts` y `ext-follow.ts` envían a través de la cola.
- `isTwisterCc(ch, cc)` en `ext-knob-map.ts` (canal 1 o 2, CC 0–15): solo esos CC cuentan para el "despertar" de 10 s; los del KeyStep ya no.
- Tests +9 en `ext-knobs.mjs`; todas las suites locales en verde. Desplegado solo el `ui.js`, sin probar en el Move.
- COMMIT 826b82cf en `device-v037`, solo en local: todo el trabajo del Twister de esta tarde y los colores. El usuario lo ha probado y funciona. No se ha subido a ningún remoto: `backup` = rogerbacardit/movy-twister (privado; ramas code-snapshot y notes) y `origin` = el repositorio del autor.

## 2026-11-16 (noche, 2): Mini-JV causa parones en Movy. PENDIENTE
- Síntoma: con el Mini-JV cargado, "slow frame" de unos 38 ms cada ~250 ms (4/s), la CPU se dispara y el audio se corta. Sin el Mini-JV va bien. El JE-8086 también se cargó (3 núcleos) y se quitó.
- Descartado (medido en el Move): la prioridad RT del hilo del emulador (chrt a FIFO 45 y 69 no cambia nada), el disco (no hay escrituras; el hilo de audio solo espera en ablspi), las consultas de la página (pasa igual en otra pista) y las expansiones (aparcadas y restauradas; las 11 están de vuelta en roms/expansions con su patch_cache.bin).
- Siguiente prueba pendiente: el Mini-JV con el Movy ORIGINAL (backups: /data/UserData/schwung/backup-movy-ui-v0.37.0-original.js + backup-movy-20261116-1726/dsp.so). Guardar antes `midiIn` del ui-state.json, porque el original lo borra (ya pasó una vez y se restauró a mano con Movy cerrado).
- Borrador del reporte: `4-ISSUE-minijv.md`. Sin publicar.
- Cuidado: otra sesión trabajó a la vez en la rama device-v037 (commit 826b82cf: colores de pista en los aros, cola de salida, pulsar = valor del preset). Usar una sola sesión.

## 2026-11-16 (cierre del día)
- **MIDI IN pasa a ser global** (commit fe2709b5): se guarda en `prefs.json` de Movy, no en cada Set. Valores del usuario: T1=CH10, T2=CH2, T3=CH3, T4=CH4. Funciona con el KeyStep Pro en cualquier Set.
- **Krautdrums** (24e41a23): la plantilla de Movy enviaba las notas 68-83 (rawMidi) y el módulo actual espera 36-51. Corregido a padNoteStart 36 con rawMidi false. Esto también hay que reportarlo al autor de Movy.
- **El Twister NO responde después de reiniciar el Move y moverlo a los altavoces.** Con un diagnóstico (log de los mensajes USB que llegan) se vio que llegan las notas del KeyStep (canal 3) pero CERO mensajes CC del Twister. El Twister hace su animación de encendido. Es un problema físico o de reconocimiento USB, no del código. Pendiente: probar el Twister directo al Move sin hub, o reiniciar el Move con todo conectado.
- En el Move está desplegado el ui.js limpio (md5 4f1b7b9c, la rama device-v037 en HEAD), con dsp.so f6c3aa1d.
- Parches: `patches-device-v037/` (0001-0007).

## 2026-11-16: TODO FUNCIONA en todos los Sets
- Twister: el problema era el **puerto del hub**. En otro puerto del mismo hub funciona. Directo al Move también funciona.
- Commit 2be657cb: el Twister se arma al cargar el Set (pinta los aros y sigue los parámetros sin tocarlo). Si se enchufa con Movy ya abierto, hace falta girar un encoder.
- Estado final desplegado en el Move: ui.js md5 7e6a46a6 (device-v037 HEAD 2be657cb), dsp.so f6c3aa1d.
- Backup: GitHub rogerbacardit/movy-twister, ramas `code-snapshot` (código) y `notes` (este archivo + parches).

## 2026-11-16 (noche): Twister llega al 0 y al 100% (commit 53adadec en device-v037)
- Causa: cada paso relativo movía range/200 (knob_engine de Schwung) → 128 pasos del Twister = 64% del rango. Además el aro solo se resincronizaba en un frame renderizado; con la página quieta se quedaba en el tope.
- Arreglo: parámetros continuos con min/max se fijan por la POSICIÓN del aro (`continuousAt`, lineal como `normalizedOf`); `twisterFollowRest()` en cada tick resincroniza el aro al soltar (HOLD_MS 350).
- Probado a mano por el usuario: funciona. Desplegado en el Move. Snapshot en GitHub: rama `code-snapshot` (02a3d3ae).
