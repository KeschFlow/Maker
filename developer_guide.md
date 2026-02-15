# MAKER Developer Guide
## Sidecar Tools (Zero-Dependency Contract)

MAKER erlaubt optionale „Sidecar Tools“ (z.B. `motor_ar.js`), die Fähigkeiten ergänzen, ohne die Engine zu importieren.

**Regel:** Tools sind UI/Peripherie. Die Engine bleibt die einzige Instanz, die Zustand schreibt.

---

## 1) Contract (verbindlich)

### Engine → Tool (Broadcast)

Die Engine sendet pro gerenderter Unit ein Event:

- **Event Name:** `maker:task`
- **Transport:** `window.dispatchEvent(new CustomEvent("maker:task", { detail }))`
- **Richtung:** one-way broadcast (Tool darf daraus keinen State ableiten, nur UI steuern)

**Minimal-Shape `detail`:**
```js
{
  unit_id: string,
  mod_id: string,
  focus_word: string,
  concept_image: string,
  prompt: string,
  task_type: "motor" | "vocal" | "cognitive" | "motor_ar" | string,
  target_element_id: string,
  expected_answer: boolean,
  scannerTier: 0 | 1 | 2 | 3
}
