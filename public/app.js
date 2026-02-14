// Buttons
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

startBtn.addEventListener("click", () => {
  MakerEngine.start();
});

stopBtn.addEventListener("click", () => {
  window.location.reload();
});

// Voice Recognition
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (window.SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = function (event) {
    const transcript = event.results[event.results.length - 1][0].transcript
      .trim()
      .toLowerCase();

    if (transcript === "start") {
      MakerEngine.start();
    }
  };

  recognition.start();
}
