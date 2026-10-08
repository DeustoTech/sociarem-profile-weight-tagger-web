# SOCIAREM · PoC Web — Perfiles de Vulnerabilidad Energética

Demo web estática del evaluador de perfiles de vulnerabilidad energética del Piloto Messina.
Migrada desde Python/Tkinter a HTML + CSS + JavaScript vanilla.

---

## Cómo ejecutar

### Opción 1 — servidor local (recomendado)
```bash
cd sociarem-profile-weight-tagger-web
python -m http.server 8765
```
Abrir: **http://localhost:8765**

### Opción 2 — directo en navegador
Abrir `index.html` directamente. Todos los scripts son `<script src>`, sin módulos ES.
Funciona en Chrome, Firefox y Edge modernos.

---

## Estructura de archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Estructura HTML: login, topbar, sidebar, área principal |
| `styles.css` | Diseño visual, layout, tarjetas, botones, sliders, tooltip |
| `i18n.js` | Diccionarios y selector de idioma español, italiano e inglés |
| `data.js` | Hogares, perfiles, indicadores, umbrales, funciones de cálculo |
| `app.js` | Estado, renderizado, eventos, optimización, exportación |
| `indicator-expression.js` | Nodos AST, constructores, validación de tipos y vistas derivadas |
| `indicator-evaluator.js` | Evaluación genérica `evaluateExpression(ast, context)` y traza |
| `indicator-units.js` | Inferencia ligera y compatibilidad de unidades |
| `indicator-dependencies.js` | Grafo de dependencias y detección de ciclos |
| `indicator-serialization.js` | Persistencia V2, import/export y migración del rule builder anterior |
| `profile-definitions.js` | Seis perfiles documentados, activación, priorización y persistencia |
| `profile-builder.js` | Interfaz compacta para construir y publicar perfiles en Fase 0 |

---

## Flujo de la demo

La barra superior presenta el roadmap completo de siete fases: construcción de perfiles, evaluación experta, consenso experto, preferencias de participantes, consenso comunitario y dos fases de reparto de beneficios. Las tres primeras disponen de interacción; las demás están marcadas explícitamente como roadmap.

### Roles de demostración

- **Diseño metodológico**: edita borradores de perfiles, reglas activadoras y variables ponderables.
- **Persona experta**: etiqueta casos, ajusta pesos y envía propuestas.
- **Facilitación del consenso**: compara propuestas y guarda una candidata pendiente de deliberación.
- **Observación y auditoría**: consulta sin editar.

Estos roles solo deshabilitan controles en el navegador. No son autenticación ni autorización real; para producción hacen falta servidor, base de datos, cuentas y registro de auditoría.

### Fase 0 — Constructor de perfiles

- Precarga P1–P6 a partir de D1.5 v2 y de la propuesta de perfiles v1.1.
- Separa explícitamente la **regla activadora** de la **regla de priorización**.
- Cada condición indica qué criterio del indicador produce `TRUE`; AND, OR y NOT combinan esos resultados.
- La regla activadora no contiene pesos. Si devuelve `FALSE`, el score del perfil es cero.
- Las variables ponderables pasan a la fase experta con los pesos anteriores como punto de partida; un peso cero es válido.
- I13 e I14 permanecen visibles como pendientes en P6 hasta disponer de datos y normalización ejecutable.
- P5 muestra la cautela de versión de I19: aparece en D1.5, pero el catálogo V3.0 lo marca retirado.
- Permite crear perfiles adicionales, guardarlos como `DRAFT`, enviarlos a `REVIEW` y publicarlos para expertos.
- Importa y exporta definiciones JSON con `schemaVersion: 2`.
- La pantalla de edición usa dos columnas, limita la altura de la regla y mueve fuentes, versiones y cautelas a una pestaña metodológica separada.

#### Modelo de perfil

```text
indicadores calculados
        ↓
regla activadora booleana (TRUE/FALSE)
        ↓ TRUE
suma ponderada normalizada
        ↓
score 0–1 utilizado en la fase experta
```

Los indicadores mantienen sus propios criterios y umbrales. La fase 0 decide qué indicadores activan un perfil y cómo se combinan; la fase experta decide cuánto pesa cada variable cuando el perfil está activo.

### Idiomas

El selector de idioma está disponible en el acceso y en la barra superior. La navegación general y el constructor de perfiles funcionan en español, italiano e inglés. La preferencia se guarda localmente.

### Login
Pantalla inicial con campo de nombre de evaluador y campo de contraseña. El nombre se guarda en `localStorage` y se muestra en la topbar. La contraseña es única y compartida (constante `APP_PASSWORD` en `data.js`); no es un mecanismo de seguridad real, solo evita que alguien abra la app sin saberla durante una demo en directo. El botón «Cambiar» vuelve al login.

### Fase 1 — Etiquetado experto ordinal
El experto evalúa cada hogar para el perfil activo.

- Selector de perfil (P1–P6) en la barra superior.
- Listado de 10 hogares sintéticos en el sidebar.
- Tarjetas de indicadores **neutrales** (sin rojo/verde para no sesgar al experto).
- **5 botones ordinales**: `0 · No | 1 · Baja | 2 · Media | 3 · Alta | 4 · Muy alta`
- Auto-avance al siguiente hogar al asignar etiqueta nueva.
- Botón **Auto-demo** para animación paso a paso (perfil activo).
- Botón **Asignar todo (6 perfiles)** para rellenar instantáneamente las etiquetas de referencia en los 10 hogares y en los 6 perfiles a la vez.
- Con ≥ 3 etiquetas aparece el botón **Optimizar pesos**.

### Fase 1b — Scores, pesos y métricas (dentro de la evaluación experta)

**Columna izquierda:**
- Banner de score compacto con nivel ordinal predicho vs. etiqueta experto.
- Métricas ordinales: MAE, RMSE, exactitud exacta, precisión ±1.
- Sliders de pesos (actualizan todo en tiempo real).
- Un peso de **0** excluye realmente el indicador; los pesos restantes se normalizan al 100 %.
- Panel de versiones de pesos: guardar / cargar / eliminar / exportar por nombre.
- Botones de exportación JSON / CSV.

**Columna derecha:**
- Tabla compacta de los 10 hogares, con cabecera de columnas (Hogar · Score · Nivel · Experto · Error).

### Fase 2 — Consenso experto

- Recibe una propuesta por usuario y perfil.
- Compara mínimo, mediana, máximo, dispersión y número de votos a peso cero.
- Señala desacuerdos altos y mantiene las propuestas visibles.
- Permite cargar tres ejemplos sintéticos para la reunión.
- La mediana es solo una candidata para deliberación; nunca se presenta como consenso automático.

---

## Perfiles disponibles

| Perfil | Nombre | Indicadores clave |
|---|---|---|
| P1 | Vulnerabilidad económica estructural | I1, I2, I3, I4, I11, I12, I21, I25 |
| P2 | Condiciones de la vivienda | I9, I10, I5, I6, I7, I20 |
| P3 | Pobreza energética oculta | I8, I5, I6, I1, I3, I4, I9, I10 |
| P4 | Fragilidad / dependencia eléctrica | I15, I16, I17, I5, I6, I9, I10 |
| P5 | Territorial y acceso | I18, I19, I22, I23 |
| P6 | Socio-comunitaria | I22, I23, I24, I1, I3, I18 |

Cada perfil mantiene estado independiente: etiquetas experto, pesos optimizados y fase actual.

---

## Escala ordinal de vulnerabilidad

| Nivel | Etiqueta | Color |
|---|---|---|
| 0 | No vulnerable | Verde |
| 1 | Vulnerabilidad baja | Lima |
| 2 | Vulnerabilidad media | Naranja |
| 3 | Vulnerabilidad alta | Rojo |
| 4 | Muy vulnerable | Violeta |

---

## Fórmula de score

Cada indicador ponderable se normaliza a `[0, 1]` (0 = sin vulnerabilidad, 1 = máxima). Primero se evalúa la activación:

```
score(hogar, perfil) = 0                                      si activación = FALSE
score(hogar, perfil) = Σ(w_i × norm_i(hogar)) / Σ(w_i)        si activación = TRUE
```

El nivel predicho se obtiene con `scoreToLevel(score)` usando umbrales:

```
[0.20, 0.40, 0.60, 0.80] → niveles 0, 1, 2, 3, 4
```

---

## Optimización de pesos (MSE ordinal)

Descenso de gradiente con regularización L2 hacia los pesos iniciales:

```
target  = etiqueta_experto / 4          # normaliza 0-4 → 0-1
loss    = MSE(score, target) + λ × Σ(w_i − w_i_init)²
```

- λ = 15 (mantiene pesos cerca del conocimiento experto previo)
- Solo usa hogares con etiqueta asignada por el experto
- No usa etiquetas de referencia como fallback silencioso

---

## Métricas ordinales (Fase 2)

| Métrica | Descripción |
|---|---|
| MAE | Error absoluto medio entre nivel predicho y nivel experto |
| RMSE | Raíz del error cuadrático medio |
| Exactas | % de predicciones con nivel idéntico al experto |
| ±1 | % de predicciones dentro de 1 nivel del experto |
| Matriz 5×5 | Distribución de predicciones vs. etiquetas experto |

---

## Versiones de pesos

Los pesos optimizados (o modificados manualmente con sliders) pueden guardarse con un nombre libre. Las versiones se almacenan en `localStorage` bajo la clave `sociarem_weight_versions_v1`, organizadas por usuario y perfil. Se pueden cargar, eliminar y exportar a JSON.

---

## Indicadores derivados

- **I2** — Derivado de I1/ISEE. Informativo, sin peso propio en ningún perfil.
- **I8** — Pobreza energética oculta (infraconsumo forzado). Derivado pero ponderado en P3.

---

## Etiquetas de referencia

Las etiquetas de referencia (`gt`, valores 0-4) están ocultas por defecto para no sesgar al experto.
Para verlas, activar el toggle **Mostrar etiquetas de referencia** en la barra superior.

El botón **Auto-demo** copia las etiquetas de referencia a las etiquetas experto del perfil activo, a petición del usuario, para preparar la demo paso a paso.
El botón **Asignar todo (6 perfiles)** hace lo mismo de golpe, pero para los 6 perfiles simultáneamente.

---

## Carga de datos XLSX

El botón **Subir XLSX** acepta archivos con columnas:

```
id, nombre, edad, composicion, desc,
I1, I3, I4, I5, I6, I7, I9, I10, I11, I12,
I15, I16, I17, I18, I19, I20, I21, I22, I23, I24, I25,
gt_P1, gt_P2, gt_P3, gt_P4, gt_P5, gt_P6   ← opcionales, valores 0-4
```

Si los valores `gt_P*` son todos 0/1 (formato binario antiguo), se detecta automáticamente
y se reasigna 1 → 4 (Muy vulnerable) con aviso.

El botón **Descargar plantilla** genera un XLSX de ejemplo con hoja `hogares` y hoja `leyenda`.

---

## Exportación

- **JSON**: perfil, umbrales, pesos, métricas, hogares con todos los campos ordinales.
- **CSV**: columnas `expert_label`, `expert_label_text`, `score`, `predicted_level`, `predicted_level_text`, `ordinal_error` + indicadores.
- Las etiquetas de referencia no se incluyen por defecto (checkbox «Incluir ref.»).

---

## Financiación y logos

El footer inferior muestra los logos de financiación (Unión Europea / Horizon Europe y SERI) y, al pasar el cursor por el icono ⓘ, el texto oficial de reconocimiento de financiación bajo el Grant Agreement Nº 101235482. Los logos y el icono de SOCIAREM se cargan directamente desde `sociarem.eu`; si la máquina donde se hace la demo no tiene conexión a internet, no se mostrarán (se puede sustituir por copias locales en `assets/` si hace falta).

## Limitaciones del PoC

- Dataset sintético de 10 hogares — no representativo estadísticamente.
- La optimización JS usa gradiente numérico sobre la regla completa y no replica scipy SLSQP; se espera divergencia en pesos.
- El login pide nombre y contraseña, pero la contraseña es una constante en texto plano (`APP_PASSWORD` en `data.js`); es una barrera para demos en directo, no una medida de seguridad real.
- Las versiones de pesos se guardan en `localStorage`; se pierden si se limpia el navegador.
- Los indicadores cualitativos (I7, I9, I10…) usan escalas ordinales simplificadas.
- Las reglas de activación y los pesos iniciales siguen marcados como preliminares hasta validación experta. P5 conserva I19 por trazabilidad aunque el catálogo V3.0 lo retire.

## Verificación

```bash
node --check app.js
node --check data.js
node tests/indicator-engine-tests.js
node tests/profile-engine-tests.js
node tests/smoke-tests.js
node tests/script-loading-tests.js
```

Las pruebas cubren el motor de expresiones, los seis perfiles documentados, las compuertas de activación, los pesos cero, la serialización JSON, los tres idiomas, el orden de carga y los 60 casos históricos de paridad del núcleo ponderado.

El detalle reversible de esta entrega está en `CHANGELOG_DEMO.md`. El trabajo vive en la rama `codex/demo-ready`, separada de `main`.
