# Entrega de demo para reunión

Rama: `codex/demo-ready`  
Base conservada: `main` en el commit previo a esta entrega.

## Cambios numerados

1. **Roadmap completo en pantalla.** Se añade una navegación de fases 0–6 para explicar el proceso actual y el futuro sin presentar como funcional lo que aún es roadmap.
2. **Roles de demostración.** El acceso permite elegir Diseño metodológico, Persona experta, Facilitación u Observación. Los controles se habilitan según el rol y la interfaz advierte que no existe seguridad real en el frontend.
3. **Catálogo V3.0.** Se incorpora un catálogo de 24 indicadores activos, incluyendo I13 e I14. I19 queda visible como retirado para preservar la trazabilidad.
4. **Indicator Builder basado en AST.** La Fase 0 ya no es una lista de condiciones. La definición autoritativa es un árbol estructurado, serializable y ejecutable con inputs, operaciones, comparaciones, lógica, condicionales y transformaciones.
5. **Peso cero real.** Los sliders admiten 0; ese indicador se excluye del cálculo y los demás pesos se normalizan. Se impide dejar todos los pesos a cero simultáneamente.
6. **Propuestas expertas.** Una persona experta puede enviar sus pesos de cada perfil al espacio de consenso; reenviar sustituye su propuesta anterior para ese perfil.
7. **Panel de consenso.** Se muestran mínimo, mediana, máximo, dispersión y votos a cero por indicador. La dispersión alta se destaca y la mediana se etiqueta como candidata, no como decisión.
8. **Datos sintéticos para la reunión.** El panel de consenso puede cargar tres propuestas de ejemplo claramente identificadas como sintéticas.
9. **Candidata facilitada.** El rol Facilitación puede guardar localmente una candidata como “pendiente de deliberación”, con autor, fecha, método y número de propuestas.
10. **Fases futuras explicables.** Preferencias de usuarios, asamblea y reparto de beneficios incluyen objetivo, participantes, resultados y salvaguardas, pero no aceptan datos todavía.
11. **Avisos metodológicos.** La demo identifica el catálogo V3.0, el modelo de perfiles provisional, los datos sintéticos y la incompatibilidad histórica de P5/I19.
12. **Pruebas.** Se añade una prueba de humo para los 24 indicadores activos, I13/I14, retirada de I19, pesos cero y 60/60 casos de paridad del cálculo existente.
13. **Motor separado de la UI.** Se crean módulos independientes para AST/validación, evaluación/traza, unidades, dependencias, serialización y constructor visual.
14. **Sandbox de indicadores.** La Fase 0 genera inputs de prueba, calcula el resultado y muestra una traza determinista de cada operación hasta OUTPUT.
15. **Tipos y unidades.** Se bloquean combinaciones obvias como AND sobre números o suma de EUR y kWh; las unidades compuestas dudosas generan advertencias y permiten especificar OUTPUT manualmente.
16. **Dependencias explícitas.** Las referencias I1–I25 forman un grafo; se muestran `Depends on`/`Used by` y no se guarda una definición circular.
17. **Persistencia V2 e import/export.** El JSON incluye AST, metadata, parámetros, dependencias, OUTPUT, estado, fecha y autor. El import reconstruye el mismo árbol.
18. **Migración no destructiva.** Los borradores V1 de condiciones se convierten a comparaciones y AND/OR, conservando el original como `legacyDefinition` y marcándolo para revisión.
19. **Formalización prudente.** Solo I2 e I8 reciben AST inicial porque sus reglas ya existían con precisión suficiente; el resto queda explícitamente pendiente para no inventar metodología.
20. **Tests unitarios del motor.** Se cubren aritmética, división, árboles anidados, comparación, lógica, IF, dependencias, ciclos, tipos, unidades, división por cero, migración y round-trip JSON.

## Cómo volver atrás

- Para comparar con la versión anterior: cambiar a la rama `main`.
- Para descartar esta entrega completa: eliminar la rama `codex/demo-ready` una vez fuera de ella.
- Para revertir un cambio concreto tras integrar: usar el commit de esta entrega como unidad reversible o aplicar manualmente el número anterior con ayuda de este listado.

No se han modificado el remoto Git, las claves SSH, las credenciales ni la configuración global de Git.
