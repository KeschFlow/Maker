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

  loadState() {
    try { return JSON.parse(localStorage.getItem("maker_state_v2")); } catch { return null; }
  }

  saveState() {
    try { localStorage.setItem("maker_state_v2", JSON.stringify(this.state)); } catch {}
  }

  async init() {
    await this.loadCurriculum();
    this.setupSpeech();
    this.bindUI();
    this.syncModeButtons();
  }

  async loadCurriculum() {
    const resp = await fetch("./curriculum.json?" + Date.now());
    this.curriculum = await resp.json();
  }

  setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      this.gateRecognition = new SR();
      this.gateRecognition.lang = "de-DE";
      this.recognition = new SR();
      this.recognition.lang = "de-DE";
    }
  }

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

    this.el.gateFallbackBtn.onclick = () => this.startApp();
  }

  syncModeButtons() {
    const icon = this.modeIcons[this.state.mode];
    this.el.modeBtnGate.textContent = icon;
    this.el.modeBtnApp.textContent = icon;
  }

  startApp() {
    this.el.gate.classList.add("hidden");
    this.el.app.classList.remove("hidden");

    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      this.el.iosHint.style.display = "block";
    }

    this.loadCurrentTask();
  }

  loadCurrentTask() {
    const mod = this.curriculum.modules[this.state.progress.currentModuleIndex];
    if (!mod) {
      this.el.prompt.textContent = "Alles abgeschlossen!";
      this.el.feedback.textContent = "🏆 Fertig!";
      return;
    }

    if (this.state.progress.currentUnitIndex >= mod.units.length) {
      if (this.state.progress.currentModuleIndex + 1 < this.curriculum.modules.length) {
        this.state.progress.currentModuleIndex += 1;
        this.state.progress.currentUnitIndex = 0;
        this.saveState();
        this.el.feedback.textContent = "Nächstes Modul!";
      } else {
        this.el.prompt.textContent = "Curriculum abgeschlossen!";
        this.el.feedback.textContent = "🏆 Fertig!";
        return;
      }
      this.loadCurrentTask();
      return;
    }

    const unit = mod.units[this.state.progress.currentUnitIndex];
    const layer = unit.mode_layer[this.state.mode];

    this.currentTask = {
      unit_id: unit.unit_id,
      mod_id: mod.mod_id,
      focus_word: unit.universal_core.focus_word,
      concept_image: unit.universal_core.concept_image,
      prompt: layer.prompt,
      task_type: layer.task_type,
      target_element_id: layer.target_element_id || unit.universal_core.focus_word.toLowerCase(),
      expected_answer: layer.expected_answer ?? true,
    };

    this.renderTask(mod);
  }

  renderTask(mod) {
    const t = this.currentTask;

    this.el.focusWord.textContent = t.focus_word;
    this.el.prompt.textContent = t.prompt;
    this.el.feedback.textContent = "";
    this.el.diagnostic.style.display = "none";

    this.el.conceptImage.innerHTML = `${t.concept_image}<span>${t.focus_word}</span>`;

    this.el.interaction.innerHTML = "";
    this.el.micBtn.style.display = "none";

    if (t.task_type === "motor") {
      const options = this.buildMotorOptions(mod, t.target_element_id);
      options.forEach(opt => {
        const box = document.createElement("div");
        box.className = "clickable";
        box.id = opt.id;
        box.textContent = opt.label;
        box.onclick = () => this.submitResponse(opt.id);
        this.el.interaction.appendChild(box);
      });
    }

    if (t.task_type === "vocal") {
      this.el.micBtn.style.display = "block";
      this.el.micBtn.onclick = () => this.startSpeechRecognition();
    }

    if (t.task_type === "cognitive") {
      ["Ja", "Nein"].forEach(text => {
        const btn = document.createElement("button");
        btn.className = "cog-btn";
        btn.textContent = text;
        btn.onclick = () => this.submitResponse(text === "Ja");
        this.el.interaction.appendChild(btn);
      });
    }
  }

  buildMotorOptions(mod, correctId) {
    const pool = mod.units.map(u => ({
      id: u.mode_layer.discover?.target_element_id || u.universal_core.focus_word.toLowerCase(),
      label: u.universal_core.focus_word
    })).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

    let decoys = pool.filter(x => x.id !== correctId);
    decoys = decoys.sort(() => Math.random() - 0.5).slice(0, 2);

    const correct = pool.find(x => x.id === correctId) || { id: correctId, label: correctId };

    const options = [correct, ...decoys];
    return options.sort(() => Math.random() - 0.5);
  }

  startSpeechRecognition() {
    if (!this.recognition) return;
    this.el.feedback.textContent = "…höre zu";
    this.recognition.start();
    this.recognition.onresult = e => this.submitResponse(e.results[0][0].transcript);
    this.recognition.onerror = () => this.el.feedback.textContent = "Nicht verstanden – nochmal.";
  }

  submitResponse(response) {
    const r = this.validateResponse(response);
    if (r.success) this.handleSuccess();
    else this.handleFailure(r.feedback);
  }

  validateResponse(response) {
    const t = this.currentTask;

    if (t.task_type === "vocal") {
      if ((response||"").toLowerCase().trim().includes(t.focus_word.toLowerCase())) {
        return { success: true };
      }
      return { success: false, feedback: `Sag: „${t.focus_word}“.` };
    }

    if (t.task_type === "motor") {
      if ((response||"").toLowerCase() === t.target_element_id.toLowerCase()) {
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
    this.el.feedback.textContent = "✅ Richtig!";
    this.el.feedback.style.color = "#0a0";

    const key = `${this.curriculum.modules[this.state.progress.currentModuleIndex].mod_id}:${this.currentTask.unit_id}`;
    this.state.progress.completedUnits[key] = true;

    this.state.progress.currentUnitIndex += 1;
    this.saveState();

    setTimeout(() => this.loadCurrentTask(), 800);
  }

  handleFailure(msg) {
    this.el.feedback.textContent = `❌ ${msg || "Nochmal schauen."}`;
    this.el.feedback.style.color = "#d00";

    const key = `${this.curriculum.modules[this.state.progress.currentModuleIndex].mod_id}:${this.currentTask.unit_id}`;
    const a = (this.state.progress.attempts[key] || 0) + 1;
    this.state.progress.attempts[key] = a;
    this.saveState();

    if (a >= 3) {
      this.state.progress.attempts[key] = 0;
      this.el.diagnostic.textContent = `Schwierigkeit bei „${this.currentTask.focus_word}“. Wir wiederholen die Grundlage.`;
      this.el.diagnostic.style.display = "block";

      if (this.state.progress.currentUnitIndex > 0) this.state.progress.currentUnitIndex -= 1;
      this.saveState();
      setTimeout(() => this.loadCurrentTask(), 2000);
    }
  }
}

new MakerFlowEngine();
