const MakerEngine = {
  currentUnit: 0,

  start() {
    this.loadUnit(this.currentUnit);
  },

  loadUnit(index) {
    const unit = Units[index];
    if (!unit) return;

    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("unitScreen").classList.remove("hidden");

    document.getElementById("unitTitle").innerText = unit.title;
    document.getElementById("unitContent").innerText = unit.content;
  }
};
