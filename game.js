document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-btn");
  const usernameInput = document.getElementById("username");
  const introScreen = document.getElementById("intro-screen");
  const gameContainer = document.getElementById("game-container");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  let username = "";
  let running = false;
  let y = 800, vy = 0, gravity = 1.5;
  let score = 0;

  startBtn.addEventListener("click", () => {
    username = usernameInput.value.trim();
    if (!username) return;
    introScreen.style.display = "none";
    gameContainer.style.display = "block";
    running = true;
    gameLoop();
  });

  function gameLoop() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    vy += gravity;
    y += vy;

    if (y > 960) {
      y = 960;
      vy = 0;
    }

    ctx.fillStyle = "#0ff";
    ctx.fillRect(100, y, 60, 80);
    ctx.fillText("Vault ID: " + username, 30, 40);
    ctx.fillText("Score: " + score, 30, 70);

    requestAnimationFrame(gameLoop);
  }

  window.addEventListener("keydown", e => {
    if (e.code === "Space" && y >= 960) {
      vy = -25;
    }
  });
});
