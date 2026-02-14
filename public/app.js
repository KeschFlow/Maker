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
      diagnostic: document.getElementById("diagnostic"),
    };

    this.el.iosHint.id = "ios-hint";
    this.el.iosHint.textContent = "Für beste Spracherkennung: Chrome verwenden.";
    document.getElementById("app").insertBefore(this.el.iosHint, document.getElementById("core-display"));

    this.init();
  }

  // ... (loadState, saveState, init, loadCurriculum, setupSpeech – unverändert)

  bindUI() {
    const cycleMode = () => {
      const order = ["discover", "transfer", "maintain"];
      const idx = order.indexOf(this.state.mode);
      this.state.mode = order[(idx + 1) % 3];
      this.syncModeButtons();
      this.saveState();
      if (!this.el.app.classList.contains("hidden")) this.loadCurrentTask();
    };
    this.el.modeBtnGate.onclick = cycleMode;
    this.el.modeBtnApp.onclick = cycleMode;

    this.el.resetBtn.onclick = () => {
      if (confirm("Alles zurücksetzen?")) {
        localStorage.removeItem("maker_state_v2");
        location.reload();
      }
    };

    // Fallback immer sichtbar – Start durch Tippen
    this.el.gateFallbackBtn.onclick = () => this.startApp();

    this.syncModeButtons();
  }

  syncModeButtons() {
    const icon = this.modeIcons[this.state.mode];
    this.el.modeBtnGate.textContent = icon;
    this.el.modeBtnApp.textContent = icon;
  }

  // ... (Rest des Codes unverändert – loadCurrentTask, renderTask, etc.)
}

new MakerFlowEngine();
