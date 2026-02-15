# MAKER

Deterministisches Handlungssystem  
Offline-First · Zero-Dependency · Linear

---

## Definition

MAKER ist ein zustandsbasiertes, lineares Ausführungssystem zur Validierung physischer Interaktion.

Es implementiert eine kontrollierte Handlungsschleife:

    Trigger → Response → Validation → State-Transition

Keine Menüs.  
Keine Parallelpfade.  
Keine externen Abhängigkeiten.  

Die Mechanik ist das Produkt.  
Der Inhalt ist austauschbar.

---

## Systemcharakter

MAKER ist:

- kein Content-Container  
- kein Lernmanagementsystem  
- kein Cloud-Service  
- kein Framework  

MAKER ist eine deterministische Engine mit optionalen Werkzeug-Layern.

---

## Kernprinzipien

- Linearität vor Navigation
- Validierung vor Darstellung
- Kompetenz vor Information
- Werkzeuge werden verdient (Tier-Gating)
- Offline-First (PWA)
- Zero-Dependency (Vanilla JS)

---

# Architektur

    ┌──────────────────────────────────────────────┐
    │                  MAKER                      │
    │       Deterministisches Handlungssystem     │
    └──────────────────────────────────────────────┘

            (Offline / PWA / No Cloud)

            sw.js  →  Service Worker
            - safePrecache
            - stale-while-revalidate
            - stable curriculum caching

                    │
                    ▼

            index.html (Shell)
            Loads strictly in order:
                1. app.js
                2. motor_ar.js

                    │
                    ▼

            app.js  (ENGINE)
            - Curriculum parsing
            - Rendering
            - Validation (motor / vocal / cognitive / motor_ar)
            - State transitions
            - Tier computation
            - localStorage persistence
            - Event broadcast: "maker:task"
            - Public handle: window.makerEngine

                    │
                    │ CustomEvent("maker:task")
                    ▼

            motor_ar.js (Tool Layer)
            - No imports
            - No dependency injection
            - Tier-gated activation
            - Calls engine.submitResponse(...)

Kommunikation ist einseitig:

    Engine → Broadcast → Tool → submitResponse → Engine

Keine zyklischen Abhängigkeiten.

---

# Formale State Machine

## States

1. BOOT  
2. GATE  
3. TASK_RENDERED  
4. AWAITING_RESPONSE  
5. VALIDATING  
6. SUCCESS_TRANSITION  
7. FAILURE_TRANSITION  

---

## Transition Matrix

| From               | Event        | Condition       | To                  |
|--------------------|-------------|----------------|--------------------|
| GATE               | EV_START    | -              | TASK_RENDERED      |
| AWAITING_RESPONSE  | EV_RESPONSE | -              | VALIDATING         |
| VALIDATING         | EV_OK       | -              | SUCCESS_TRANSITION |
| VALIDATING         | EV_FAIL     | attempts < 3   | TASK_RENDERED      |
| VALIDATING         | EV_FAIL     | attempts ≥ 3   | FAILURE_TRANSITION |

Keine impliziten Zustände.  
Kein Hintergrundprozess.  
Keine versteckte Logik.

---

# Persistenz

State-Tree (localStorage):

    maker_state_v2 = {
      mode,
      progress: {
        currentModuleIndex,
        currentUnitIndex,
        completedUnits,
        attempts
      }
    }

Deterministisch reproduzierbar.  
Kein Server-Sync.  
Kein Tracking.  
Keine Telemetrie.

---

# Tool Interface Contract

Ein Tool darf:

- "maker:task" Events lesen
- window.makerEngine.submitResponse() aufrufen

Ein Tool darf nicht:

- Engine-State direkt verändern
- Persistenz manipulieren
- Globale DOM-Struktur überschreiben

Tools sind Sidecar-Module.  
Die Engine bleibt souverän.

---

# PWA

- Service Worker Versionierung (maker-vX)
- Safe Precache (Install darf nicht fehlschlagen)
- Curriculum cache-stabilisiert
- Standalone Mode
- 100% offline lauffähig nach Erstinstallation

---

# Repository Struktur

    public/
        index.html
        app.js
        motor_ar.js
        sw.js
        curriculum.json
        manifest.json

Kein Build-System.  
Kein Bundler.  
Kein Transpiler.  
Kein CDN.

---

# Erweiterbarkeit

Neue Werkzeuge müssen:

- Zero-Dependency bleiben
- Den Event-Contract einhalten
- Tier-Gating respektieren
- Die deterministische Schleife nicht unterbrechen

Beispiele:

- motor_haptics.js
- vocal_coach.js
- sensor_layer.js

---

# Lizenz

MIT
