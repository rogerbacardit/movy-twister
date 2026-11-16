# movy-twister (privado)

Copia de trabajo de Roger: Movy (DimaDake/schwung-movy, licencia MIT) con soporte para
Midi Fighter Twister, y notas para continuar.

- **Empieza por [HANDOFF.md](HANDOFF.md)**: estado, montaje y siguientes pasos.
- Rama `external-knob-controller`: el cambio limpio sobre `main` de Movy (para el PR).
- Rama `code-snapshot`: foto completa del código de la rama del Twister (sin historial ni workflows).
- `ui-device-con-sync.js`: versión con los aros del Twister siguiendo al parámetro (ver HANDOFF).
- `ui.js`: Movy v0.37.0 con el parche instalado en el Move.
- `1-ISSUE.md`, `2-PULL-REQUEST.md`: borradores en inglés (aún sin publicar).
- `patches-midi-in/`: MIDI IN (un canal por pista) sobre main, para el autor.
- `patches-device-v037/`: lo que lleva el Move (v0.37.0 + Twister + aros + MIDI IN), con `ui-device-v037-midi-in.js` y `dsp-device-v037-midi-in.so`.
