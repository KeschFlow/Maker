class MakerFlowEngine {
  constructor() {
    this.curriculum = null;

    this.state = this.loadState() || {
      mode: "transfer", // 👶 discover | 🌍 transfer | 👴 maintain
      progress: {
        currentModuleIndex: 0,
        currentUnitIndex: 0,
        completedUnits: {},
        attempts: {},
        unlocks: {
          scannerTier: 0 // 0..3 (milestones)
        }
      }
    };

    // Ensure older states keep working
    this.migrateState();

    this.recognition = null;
    this.gateRecognition = null;
    this.currentTask = null;

    this.modeIcons = {
      discover: "👶",
      transfer: "🌍",
      maintain: "👴"
    };

    this.el = {
      gate: document.getElementById("gatekeeper"),
      app: document.getElementById("app"),
      startCircle: document.getElementById("start-circle"),
      gatePrompt: document.getElementById("gate-prompt"),
      gateFallbackBtn: document.getElementById("gate-fallback-btn"),
      iosHint: document.createElement("div"),
      modeBtnGate: document.getElementById("mode-btn-gate"),
      modeBtnApp: document.getElementById("mode-btn-app"),
      resetBtn: document.getElementById("reset-btn"),
      conceptImage: document.getElementById("concept-image"),
      focusWord: document.getElementById("focus-word"),
      prompt: document.getElementById("prompt"),
      interaction: document.getElementById("interaction-area"),
      micBtn: document.getElementById("mic-button"),
      feedback: document.getElementById("feedback"),
      diagnostic: document.getElementById("diagnostic"),
      progressGlyph: null
    };

    // Gate speech anti-spam state
    this.gateSpeech = {
      delayMs: 900,
      maxDelayMs: 6000,
      lastStartAt: 0,
      startsInWindow: 0,
      windowStartAt: Date.now(),
      windowMs: 60_000,
      disabled: false
    };

    // iOS hint (hidden by default)
    this.el.iosHint.id = "ios-hint";
    this.el.iosHint.textContent = "Für beste Spracherkennung: Chrome verwenden.";
    this.el.iosHint.style.display = "none";
    const coreDisplay = document.getElementById("core-display");
    if (coreDisplay && this.el.app) {
      this.el.app.insertBefore(this.el.iosHint, coreDisplay);
    }

    // Inline styles for the progress glyph (no extra files)
    this.injectProgressStyles();

    // Expose engine for zero-dep AR bridge
    window.makerEngine = this;

    this.init();
  }

  loadState() {
    try {
      return JSON.parse(localStorage.getItem("maker_state_v2"));
    } catch {
      return null;
    }
  }

  saveState() {
    try {
      localStorage.setItem("maker_state_v2", JSON.stringify(this.state));
    } catch {}
  }

  migrateState() {
    if (!this.state || typeof this.state !== "object") return;

    if (!this.state.progress || typeof this.state.progress !== "object") {
      this.state.progress = {
        currentModuleIndex: 0,
        currentUnitIndex: 0,
        completedUnits: {},
        attempts: {},
        unlocks: { scannerTier: 0 }
      };
    }

    if (!this.state.progress.completedUnits) this.state.progress.completedUnits = {};
    if (!this.state.progress.attempts) this.state.progress.attempts = {};

    if (!this.state.progress.unlocks || typeof this.state.progress.unlocks !== "object") {
      this.state.progress.unlocks = { scannerTier: 0 };
    }
    if (typeof this.state.progress.unlocks.scannerTier !== "number") {
      this.state.progress.unlocks.scannerTier = 0;
    }

    if (typeof this.state.progress.currentModuleIndex !== "number") this.state.progress.currentModuleIndex = 0;
    if (typeof this.state.progress.currentUnitIndex !== "number") this.state.progress.currentUnitIndex = 0;

    this.applyUnlockTierClass();
    this.saveState();
  }

  injectProgressStyles() {
    const id = "maker-progress-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      #maker-progress {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 50;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        font-size: 16px;
        line-height: 1;
        user-select: none;
        -webkit-user-select: none;
      }
      #maker-progress .slot {
        width: 10px;
        height: 18px;
        border-radius: 4px;
        background: rgba(255,255,255,0.18);
      }
      #maker-progress .slot.filled {
        background: rgba(255,255,255,0.92);
      }
      #maker-progress.pulse {
        animation: makerPulse 320ms ease-out 1;
      }
      @keyframes makerPulse {
        0% { transform: scale(1); }
        45% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        #maker-progress.pulse { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  ensureProgressGlyph() {
    if (!this.el.app) return;
    if (this.el.progressGlyph) return;

    const appStyle = window.getComputedStyle(this.el.app);
    if (appStyle.position === "static") this.el.app.style.position = "relative";

    const glyph = document.createElement("div");
    glyph.id = "maker-progress";
    glyph.setAttribute("aria-label", "Fortschritt");
    glyph.setAttribute("role", "img");

    // 12 slots baseline (modules can have different lengths; we fill proportionally)
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("div");
      s.className = "slot";
      glyph.appendChild(s);
    }

    this.el.app.appendChild(glyph);
    this.el.progressGlyph = glyph;
  }

  getModuleProgressCounts() {
    const mod = this.curriculum?.modules?.[this.state.progress.currentModuleIndex];
    const units = Array.isArray(mod?.units) ? mod.units : [];
    const total = Math.max(1, units.length);

    const modId = mod?.mod_id || "m";
    let done = 0;

    for (const u of units) {
      const unitId = u?.unit_id || "unit";
      const key = `${modId}:${unitId}`;
      if (this.state.progress.completedUnits?.[key]) done += 1;
    }

    return { done, total, modId };
  }

  updateProgressUI(doPulse = false) {
    if (!this.el.app || this.el.app.classList.contains("hidden")) return;
    if (!this.curriculum) return;

    this.ensureProgressGlyph();
    if (!this.el.progressGlyph) return;

    const { done, total } = this.getModuleProgressCounts();

    const slots = Array.from(this.el.progressGlyph.querySelectorAll(".slot"));
    const filledCount = Math.round((done / total) * slots.length);

    slots.forEach((slot, idx) => {
      if (idx < filledCount) slot.classList.add("filled");
      else slot.classList.remove("filled");
    });

    if (doPulse) {
      this.el.progressGlyph.classList.remove("pulse");
      void this.el.progressGlyph.offsetWidth; // restart animation
      this.el.progressGlyph.classList.add("pulse");
      setTimeout(() => this.el.progressGlyph?.classList.remove("pulse"), 400);
    }

    this.updateUnlocksFromProgress(done, total);
  }

  updateUnlocksFromProgress(done, total) {
    // Milestones: ~1/3, ~2/3, 100% per module
    let tier = 0;
    if (done >= Math.ceil(total * 0.34)) tier = 1;
    if (done >= Math.ceil(total * 0.67)) tier = 2;
    if (done >= total) tier = 3;

    const prev = this.state.progress.unlocks.scannerTier || 0;
    if (tier > prev) {
      this.state.progress.unlocks.scannerTier = tier;
      this.applyUnlockTierClass();
      this.saveState();
    }
  }

  applyUnlockTierClass() {
    const t = this.state?.progress?.unlocks?.scannerTier ?? 0;
    document.body.classList.remove("scanner-tier-0", "scanner-tier-1", "scanner-tier-2", "scanner-tier-3");
    document.body.classList.add(`scanner-tier-${Math.max(0, Math.min(3, t))}`);
  }

  async init() {
    // Prevent black screen: always show gate first
    this.showGate();

    // Bind UI early so tap fallback always works
    this.bindUI();
    this.setupSpeech();
    this.syncModeButtons();

    // Pause gate speech on tab hide (reduces permission / restart issues)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        try { this.gateRecognition?.stop(); } catch {}
      } else {
        this.startGateSpeech();
      }
    });

    // Load curriculum safely
    const ok = await this.loadCurriculumSafe();
    if (!ok) return;

    // Optional gate speech ("Start"), never blocks
    this.startGateSpeech();
  }

  showGate() {
    if (this.el.app) this.el.app.classList.add("hidden");
    if (this.el.gate) this.el.gate.classList.remove("hidden");
  }

  async loadCurriculumSafe() {
    try {
      // ✅ no cache-busting query; Service Worker controls caching
      const resp = await fetch("./curriculum.json", { cache: "no-cache" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();

      // Minimal shape check
      if (!data || !Array.isArray(data.modules)) {
        throw new Error("Invalid curriculum shape");
      }

      this.curriculum = data;
      return true;
    } catch {
      // Keep linear UX: show gate + tap fallback
      if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Fehler beim Laden. Tippe Start.";
      if (this.el.diagnostic) {
        this.el.diagnostic.style.display = "block";
        this.el.diagnostic.textContent =
          "Curriculum konnte nicht geladen werden (offline/404/JSON). Bitte neu laden oder später erneut versuchen.";
      }
      return false;
    }
  }

  setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    this.gateRecognition = new SR();
    this.gateRecognition.lang = "de-DE";
    this.gateRecognition.continuous = false;
    this.gateRecognition.interimResults = false;

    this.recognition = new SR();
    this.recognition.lang = "de-DE";
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
  }

  canStartGateSpeech() {
    if (!this.gateRecognition) return false;
    if (!this.el.gate || this.el.gate.classList.contains("hidden")) return false;
    if (document.hidden) return false;
    if (this.gateSpeech.disabled) return false;

    const now = Date.now();

    // Sliding window limiter (anti spam)
    if (now - this.gateSpeech.windowStartAt > this.gateSpeech.windowMs) {
      this.gateSpeech.windowStartAt = now;
      this.gateSpeech.startsInWindow = 0;
    }
    if (this.gateSpeech.startsInWindow >= 10) {
      // too many restarts → disable speech, rely on tap fallback
      this.gateSpeech.disabled = true;
      if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Tippe Start";
      return false;
    }

    // Avoid tight restart loops
    if (now - this.gateSpeech.lastStartAt < 700) return false;

    return true;
  }

  startGateSpeech() {
    if (!this.canStartGateSpeech()) return;

    try {
      this.gateRecognition.onresult = (e) => {
        const txt = (e.results?.[0]?.[0]?.transcript || "").toLowerCase().trim();
        if (txt.includes("start") || txt.includes("los")) {
          this.startApp();
        } else {
          if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Sag „Start“ oder tippe";
        }
        // Reset backoff on success
        this.gateSpeech.delayMs = 900;
      };

      this.gateRecognition.onerror = () => {
        if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Tippe Start";
        // Increase backoff on errors
        this.gateSpeech.delayMs = Math.min(this.gateSpeech.maxDelayMs, Math.round(this.gateSpeech.delayMs * 1.35));
      };

      this.gateRecognition.onend = () => {
        if (!this.el.gate || this.el.gate.classList.contains("hidden")) return;
        if (document.hidden) return;

        setTimeout(() => {
          if (!this.canStartGateSpeech()) return;
          try {
            this.gateSpeech.lastStartAt = Date.now();
            this.gateSpeech.startsInWindow += 1;
            this.gateRecognition.start();
          } catch {}
        }, this.gateSpeech.delayMs);
      };

      this.gateSpeech.lastStartAt = Date.now();
      this.gateSpeech.startsInWindow += 1;
      this.gateRecognition.start();
    } catch {
      // Tap fallback remains
    }
  }

  bindUI() {
    const cycleMode = () => {
      const order = ["discover", "transfer", "maintain"];
      const idx = order.indexOf(this.state.mode);
      this.state.mode = order[(idx + 1) % 3];
      this.syncModeButtons();
      this.saveState();
      if (this.el.app && !this.el.app.classList.contains("hidden")) this.loadCurrentTask();
    };

    if (this.el.modeBtnGate) this.el.modeBtnGate.onclick = cycleMode;
    if (this.el.modeBtnApp) this.el.modeBtnApp.onclick = cycleMode;

    if (this.el.resetBtn) {
      this.el.resetBtn.onclick = () => {
        if (confirm("Alles zurücksetzen?")) {
          localStorage.removeItem("maker_state_v2");
          location.reload();
        }
      };
    }

    // Tap fallbacks (linear)
    if (this.el.gateFallbackBtn) this.el.gateFallbackBtn.onclick = () => this.startApp();
    if (this.el.startCircle) this.el.startCircle.onclick = () => this.startApp();
    if (this.el.gatePrompt) this.el.gatePrompt.onclick = () => this.startApp();
  }

  syncModeButtons() {
    const icon = this.modeIcons[this.state.mode] || "🌍";
    if (this.el.modeBtnGate) this.el.modeBtnGate.textContent = icon;
    if (this.el.modeBtnApp) this.el.modeBtnApp.textContent = icon;
  }

  startApp() {
    // Stop gate speech to avoid conflicts
    try {
      if (this.gateRecognition) this.gateRecognition.onend = null;
      if (this.gateRecognition) this.gateRecognition.stop();
    } catch {}

    if (this.el.gate) this.el.gate.classList.add("hidden");
    if (this.el.app) this.el.app.classList.remove("hidden");

    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      this.el.iosHint.style.display = "block";
    }

    // Ensure progress UI on app start
    this.updateProgressUI(false);

    this.loadCurrentTask();
  }

  loadCurrentTask() {
    if (!this.curriculum || !Array.isArray(this.curriculum.modules)) {
      if (this.el.prompt) this.el.prompt.textContent = "Laden…";
      return;
    }

    const mod = this.curriculum.modules[this.state.progress.currentModuleIndex];
    if (!mod) {
      if (this.el.prompt) this.el.prompt.textContent = "Alles abgeschlossen!";
      if (this.el.feedback) this.el.feedback.textContent = "🏆 Fertig!";
      this.updateProgressUI(false);
      return;
    }

    const units = Array.isArray(mod.units) ? mod.units : [];
    if (this.state.progress.currentUnitIndex >= units.length) {
      if (this.state.progress.currentModuleIndex + 1 < this.curriculum.modules.length) {
        this.state.progress.currentModuleIndex += 1;
        this.state.progress.currentUnitIndex = 0;
        this.saveState();
        if (this.el.feedback) this.el.feedback.textContent = "Nächstes Modul!";
      } else {
        if (this.el.prompt) this.el.prompt.textContent = "Curriculum abgeschlossen!";
        if (this.el.feedback) this.el.feedback.textContent = "🏆 Fertig!";
        this.updateProgressUI(false);
        return;
      }
      this.loadCurrentTask();
      return;
    }

    const unit = units[this.state.progress.currentUnitIndex];
    const layer = unit?.mode_layer?.[this.state.mode];
    const fallbackLayer =
      unit?.mode_layer?.transfer || unit?.mode_layer?.discover || unit?.mode_layer?.maintain;
    const activeLayer = layer || fallbackLayer;

    const focusWord = unit?.universal_core?.focus_word || "—";
    const conceptImage = unit?.universal_core?.concept_image || "⬛";

    this.currentTask = {
      unit_id: unit?.unit_id || "unit",
      mod_id: mod?.mod_id || "module",
      focus_word: focusWord,
      concept_image: conceptImage,
      prompt: activeLayer?.prompt || "Tippe.",
      task_type: activeLayer?.task_type || "cognitive",
      target_element_id:
        activeLayer?.target_element_id || (String(focusWord).toLowerCase().trim() || "target"),
      expected_answer: activeLayer?.expected_answer ?? true
    };

    this.renderTask(mod);

    // Update glyph each time we render
    this.updateProgressUI(false);

    // AR/Layer hook (zero-dep)
    try {
      window.dispatchEvent(
        new CustomEvent("maker:task", {
          detail: {
            mode: this.state.mode,
            mod_id: this.currentTask.mod_id,
            unit_id: this.currentTask.unit_id,
            task_type: this.currentTask.task_type,
            focus_word: this.currentTask.focus_word,
            scannerTier: this.state.progress.unlocks.scannerTier
          }
        })
      );
    } catch {}
  }

  renderTask(mod) {
    const t = this.currentTask;

    if (this.el.focusWord) this.el.focusWord.textContent = t.focus_word;
    if (this.el.prompt) this.el.prompt.textContent = t.prompt;
    if (this.el.feedback) this.el.feedback.textContent = "";
    if (this.el.diagnostic) this.el.diagnostic.style.display = "none";

    if (this.el.conceptImage) {
      this.el.conceptImage.innerHTML = `${t.concept_image}<span>${t.focus_word}</span>`;
    }

    if (this.el.interaction) this.el.interaction.innerHTML = "";
    if (this.el.micBtn) this.el.micBtn.style.display = "none";

    if (t.task_type === "motor") {
      const options = this.buildMotorOptions(mod, t.target_element_id);
      options.forEach((opt) => {
        const box = document.createElement("div");
        box.className = "clickable";
        box.id = opt.id;
        box.textContent = opt.label;
        box.onclick = () => this.submitResponse(opt.id);
        this.el.interaction.appendChild(box);
      });
    }

    if (t.task_type === "vocal") {
      if (this.el.micBtn) {
        this.el.micBtn.style.display = "block";
        this.el.micBtn.onclick = () => this.startSpeechRecognition();
      }
    }

    if (t.task_type === "cognitive") {
      ["Ja", "Nein"].forEach((text) => {
        const btn = document.createElement("button");
        btn.className = "cog-btn";
        btn.textContent = text;
        btn.onclick = () => this.submitResponse(text === "Ja");
        this.el.interaction.appendChild(btn);
      });
    }
  }

  buildMotorOptions(mod, correctId) {
    const units = Array.isArray(mod?.units) ? mod.units : [];

    const pool = units
      .map((u) => {
        const fw = u?.universal_core?.focus_word || "";
        const id =
          u?.mode_layer?.discover?.target_element_id ||
          u?.mode_layer?.transfer?.target_element_id ||
          String(fw).toLowerCase().trim();
        return { id: id || "x", label: fw || id || "?" };
      })
      .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);

    let decoys = pool.filter((x) => x.id !== correctId);
    decoys = decoys.sort(() => Math.random() - 0.5).slice(0, 2);

    const correct = pool.find((x) => x.id === correctId) || { id: correctId, label: correctId };

    const options = [correct, ...decoys];
    return options.sort(() => Math.random() - 0.5);
  }

  startSpeechRecognition() {
    if (!this.recognition) return;

    if (this.el.feedback) this.el.feedback.textContent = "…höre zu";

    try {
      this.recognition.onresult = (e) => {
        const txt = e.results?.[0]?.[0]?.transcript || "";
        this.submitResponse(txt);
      };
      this.recognition.onerror = () => {
        if (this.el.feedback) this.el.feedback.textContent = "Nicht verstanden – nochmal.";
      };
      this.recognition.start();
    } catch {
      if (this.el.feedback) this.el.feedback.textContent = "Sprechen nicht verfügbar.";
    }
  }

  submitResponse(response) {
    const r = this.validateResponse(response);
    if (r.success) this.handleSuccess();
    else this.handleFailure(r.feedback);
  }

  validateResponse(response) {
    const t = this.currentTask;

    if (t.task_type === "vocal") {
      if ((response || "").toLowerCase().trim().includes(t.focus_word.toLowerCase())) {
        return { success: true };
      }
      return { success: false, feedback: `Sag: „${t.focus_word}“.` };
    }

    if (t.task_type === "motor") {
      if ((response || "").toLowerCase() === t.target_element_id.toLowerCase()) {
        return { success: true };
      }
      return { success: false, feedback: "Daneben." };
    }

    if (t.task_type === "cognitive") {
      if (response === t.expected_answer) return { success: true };
      return { success: false, feedback: "Nochmal schauen." };
    }

    // AR layer reports boolean true, tap fallback can also be true
    if (t.task_type === "motor_ar") {
      if (response === true) return { success: true };
      return { success: false, feedback: "Nochmal probieren." };
    }

    return { success: false, feedback: "Ungültig." };
  }

  handleSuccess() {
    if (this.el.feedback) {
      this.el.feedback.textContent = "✅ Richtig!";
      this.el.feedback.style.color = "#0a0";
    }

    const modId = this.curriculum?.modules?.[this.state.progress.currentModuleIndex]?.mod_id || "m";
    const key = `${modId}:${this.currentTask.unit_id}`;
    this.state.progress.completedUnits[key] = true;

    this.state.progress.currentUnitIndex += 1;
    this.saveState();

    // Pulse progress glyph on success
    this.updateProgressUI(true);

    setTimeout(() => this.loadCurrentTask(), 800);
  }

  handleFailure(msg) {
    if (this.el.feedback) {
      this.el.feedback.textContent = `❌ ${msg || "Nochmal schauen."}`;
      this.el.feedback.style.color = "#d00";
    }

    const modId = this.curriculum?.modules?.[this.state.progress.currentModuleIndex]?.mod_id || "m";
    const key = `${modId}:${this.currentTask.unit_id}`;
    const a = (this.state.progress.attempts[key] || 0) + 1;
    this.state.progress.attempts[key] = a;
    this.saveState();

    if (a >= 3) {
      this.state.progress.attempts[key] = 0;

      if (this.el.diagnostic) {
        this.el.diagnostic.textContent = `Schwierigkeit bei „${this.currentTask.focus_word}“. Wir wiederholen die Grundlage.`;
        this.el.diagnostic.style.display = "block";
      }

      if (this.state.progress.currentUnitIndex > 0) this.state.progress.currentUnitIndex -= 1;
      this.saveState();
      setTimeout(() => this.loadCurrentTask(), 2000);
    }
  }
}

new MakerFlowEngine();
