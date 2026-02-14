class MakerFlowEngine {
  constructor() {
    this.curriculum = null;

    this.state = this.loadState() || {
      mode: "transfer", // 👶 discover | 🌍 transfer | 👴 maintain
      progress: {
        currentModuleIndex: 0,
        currentUnitIndex: 0,
        completedUnits: {},
        attempts: {}
      }
    };

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
      diagnostic: document.getElementById("diagnostic")
    };

    // iOS hint (hidden by default; app.css can style this if desired)
    this.el.iosHint.id = "ios-hint";
    this.el.iosHint.textContent = "Für beste Spracherkennung: Chrome verwenden.";
    this.el.iosHint.style.display = "none";
    const coreDisplay = document.getElementById("core-display");
    if (coreDisplay) {
      this.el.app.insertBefore(this.el.iosHint, coreDisplay);
    }

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

  async init() {
    // Always show a screen first (prevents black screen)
    this.showGate();

    // Bind UI early so tap-fallback always works
    this.bindUI();
    this.setupSpeech();
    this.syncModeButtons();

    // Load curriculum (robust)
    const ok = await this.loadCurriculumSafe();
    if (!ok) return;

    // Gate speech: say "Start" (optional, never blocks)
    this.startGateSpeech();
  }

  showGate() {
    if (this.el.app) this.el.app.classList.add("hidden");
    if (this.el.gate) this.el.gate.classList.remove("hidden");
  }

  async loadCurriculumSafe() {
    try {
      const resp = await fetch("./curriculum.json?" + Date.now(), { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();

      // Minimal shape check (defensive)
      if (!data || !Array.isArray(data.modules)) {
        throw new Error("Invalid curriculum shape");
      }

      this.curriculum = data;
      return true;
    } catch (err) {
      // Keep UI linear: show gate + clear instruction to use tap fallback
      if (this.el.gatePrompt) {
        this.el.gatePrompt.textContent = "Fehler beim Laden. Tippe Start.";
      }
      if (this.el.feedback) {
        this.el.feedback.textContent = "";
      }
      if (this.el.diagnostic) {
        this.el.diagnostic.style.display = "block";
        this.el.diagnostic.textContent =
          "Curriculum konnte nicht geladen werden (offline/404/JSON). Bitte neu laden oder später erneut versuchen.";
      }
      // Do not throw; prevents total blank
      return false;
    }
  }

  setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // Gate recognition (Start)
    this.gateRecognition = new SR();
    this.gateRecognition.lang = "de-DE";
    this.gateRecognition.continuous = false;
    this.gateRecognition.interimResults = false;

    // In-app recognition (vocal tasks)
    this.recognition = new SR();
    this.recognition.lang = "de-DE";
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
  }

  startGateSpeech() {
    if (!this.gateRecognition) return;

    // Only run while gate is visible
    if (!this.el.gate || this.el.gate.classList.contains("hidden")) return;

    try {
      this.gateRecognition.onresult = (e) => {
        const txt = (e.results?.[0]?.[0]?.transcript || "").toLowerCase().trim();
        // Accept common variants
        if (txt.includes("start") || txt.includes("los")) {
          this.startApp();
        } else {
          // Keep it short + action-oriented
          if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Sag „Start“ oder tippe";
        }
      };

      this.gateRecognition.onerror = () => {
        // Never block; tap fallback remains
        if (this.el.gatePrompt) this.el.gatePrompt.textContent = "Tippe Start";
      };

      this.gateRecognition.onend = () => {
        // Soft-retry while gate is visible (no busy loop)
        if (this.el.gate && !this.el.gate.classList.contains("hidden")) {
          setTimeout(() => {
            try {
              this.gateRecognition.start();
            } catch {}
          }, 800);
        }
      };

      this.gateRecognition.start();
    } catch {
      // Ignore; tap fallback
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

    // Tap fallbacks (linear, no menus)
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
        return;
      }
      this.loadCurrentTask();
      return;
    }

    const unit = units[this.state.progress.currentUnitIndex];
    const layer = unit?.mode_layer?.[this.state.mode];

    // Defensive: if mode layer missing, fall back to transfer/discover
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
