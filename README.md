# TEG SIM® v0.2

Simulador educativo de interpretación de tromboelastografía en hemorragia obstétrica.

## Novedades de la versión 0.2

- Carga dinámica de casos desde `cases.json` y `caseXX.json`.
- Menú de casos generado automáticamente.
- Casos 1, 2 y 3 funcionales con el mismo motor.
- Flujo: presentación clínica → trazado → valores → preguntas → evolución → debriefing.
- Puntuación configurada desde `scoring.json`.
- Biblioteca alimentada por `algorithm.json`.
- Separación permanente entre pérdida acumulada, sangrado activo y control de la fuente.
- Diseño adaptable para iPad y dispositivos móviles.

## Estructura

- `index.html`: interfaz principal.
- `styles.css`: diseño visual.
- `app.js`: motor del simulador.
- `cases.json`: catálogo de casos.
- `case01.json`, `case02.json`, `case03.json`: contenido clínico.
- `algorithm.json`: algoritmo educativo.
- `scoring.json`: reglas de puntuación.

## Ejecución

El proyecto debe abrirse mediante un servidor web (por ejemplo, Vercel), ya que el navegador carga los archivos JSON mediante `fetch`.

## Aviso

Material exclusivamente educativo. No sustituye protocolos institucionales ni valoración médica integral.
