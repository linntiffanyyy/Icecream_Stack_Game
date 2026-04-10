// Access exposed Electron API
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');
const playBtn = document.getElementById('playBtn');

const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const characterToggleBtn = document.getElementById('characterToggleBtn');

const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore');

const cloudsCanvas = document.getElementById('clouds');
const cloudsCtx = cloudsCanvas.getContext('2d');

const gameCanvas = document.getElementById('game');
const ctx = gameCanvas.getContext('2d');
cloudsCtx.imageSmoothingEnabled = false;
ctx.imageSmoothingEnabled = false;

const electronAPI = window.electronAPI || {
  minimize: () => {},
  close: () => {}
};

if (!window.electronAPI) {
  document.body.classList.add('web-mode');
}

let score = 0;
let highscore = localStorage.getItem('highscore') || 0;
let currentCharacter = 'girl';
highscoreEl.textContent = highscore;

// Load asset images
const images = {
  startscreen: new Image(),
  girl: new Image(),
  girlJump: new Image(),
  boy: new Image(),
  boyJump: new Image(),
  purpleScoop: new Image(),
  yellowScoop: new Image(),
  blueScoop: new Image(),
  background: new Image(),
  endscreen: new Image(),
  cone: new Image()
};

images.startscreen.src = './assets/Startscreen.png';
images.girl.src = './assets/Girl.png';
images.girlJump.src = './assets/Girljump.png';
images.boy.src = './assets/Boy.png';
images.boyJump.src = './assets/Boyjump.png';
images.purpleScoop.src = './assets/Purplescoop.png';
images.yellowScoop.src = './assets/Yellowscoop.png';
images.blueScoop.src = './assets/Bluescoop.png';
images.background.src = './assets/Background.png';
images.endscreen.src = './assets/Endscreen.png';
images.cone.src = './assets/Cone.png';


// Window controls using exposed API
minimizeBtn.addEventListener('click', () => {
  electronAPI.minimize();
});

closeBtn.addEventListener('click', () => {
  electronAPI.close();
});

function updateCharacterToggleButton() {
  const nextCharacter = currentCharacter === 'girl' ? 'boy' : 'girl';
  characterToggleBtn.classList.toggle('is-boy', currentCharacter === 'boy');
  characterToggleBtn.title = `Switch to ${nextCharacter}`;
  characterToggleBtn.setAttribute('aria-label', `Switch to ${nextCharacter}`);
}

characterToggleBtn.addEventListener('click', () => {
  currentCharacter = currentCharacter === 'girl' ? 'boy' : 'girl';
  updateCharacterToggleButton();
  if (gameScreen.classList.contains('active')) {
    render();
  }
});

updateCharacterToggleButton();

// Screen switching
playBtn.addEventListener('click', () => {
  homeScreen.classList.remove('active');
  gameScreen.classList.add('active');
  startGame();
});
// --- Game variables and helpers ---
const gameWidth = gameCanvas.width;
const gameHeight = gameCanvas.height;

let running = false;
let scoops = []; // active scoops (moving) and landed ones
let stack = []; // landed scoops (cone included)
let lastSpawn = 0;
let spawnDelay = 700; // ms between spawn attempts
let gravity = 1400; // px/s^2

const girl = {
  w: 55,
  h: 105,
  x: gameWidth / 2 - 27.5,
  y: 0,
  vy: 0,
  onGround: false
};

let cameraY = 0;
let currentScale = 1;
let targetScale = 1;
let cameraTarget = 0; // desired camera Y (only changes on landing)
let cameraX = 0;
let cameraTargetX = 0; // desired camera X (only changes on landing)

function getCameraTargetForGirl() {
  const centerOffset = gameHeight / 2 - girl.h / 2;
  return girl.y - centerOffset;
}

function getCameraTargetForGirlX() {
  const centerOffsetX = gameWidth / 2 - girl.w / 2;
  return girl.x - centerOffsetX;
}

const scoopImages = ['purpleScoop', 'yellowScoop', 'blueScoop']; // scoop image keys

const gameOverEl = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const newHighEl = document.getElementById('new-high');
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');

function resetGameState() {
  scoops = [];
  stack = [];
  lastSpawn = 0;
  running = true;
  currentScale = 1;
  targetScale = 1;
  score = 0;
  scoreEl.textContent = score;
  highscore = localStorage.getItem('highscore') || 0;
  highscoreEl.textContent = highscore;

  // base cone
  // place the base cone lower-than-center so the girl starts roughly centered on screen
  const coneWidth = 75;
  const cone = { x: Math.round((gameWidth - coneWidth) / 2), y: Math.round(gameHeight / 2 + 80), w: coneWidth, h: 70, isCone: true };
  stack.push(cone);

  // place girl on cone
  // center girl horizontally on the cone
  girl.x = Math.round(cone.x + (cone.w - girl.w) / 2);
  girl.y = cone.y - girl.h;
  girl.vy = 0;
  girl.onGround = true;  // Girl starts on the cone!

  cameraY = Math.max(0, girl.y - gameHeight / 2 + girl.h / 2);
  // initialize camera target centered on the girl
  cameraTarget = getCameraTargetForGirl();
  cameraY = cameraTarget;
}

function spawnScoop() {
  // place new scoop so it will cross the girl's x at stack-top level
  const top = stack[stack.length - 1];
  const targetY = top.y - 45; // scoop height ~45
  const fromLeft = Math.random() < 0.5;
  const w = 90;
  const h = 45;
  const x = fromLeft ? -w - 10 : gameWidth + 10;
  const speed = 80 + Math.random() * 160; // px/s
  const vx = fromLeft ? speed : -speed;
  const scoopImageKey = scoopImages[Math.floor(Math.random() * scoopImages.length)];

  const scoop = { x, y: targetY, w, h, vx, imageKey: scoopImageKey, landed: false, fromLeft };
  scoops.push(scoop);
}

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

let lastTime = 0;

function gameLoop(ts) {
  if (!running) return;
  if (!lastTime) lastTime = ts;
  const dt = Math.min(40, ts - lastTime) / 1000; // clamp to avoid big jumps
  lastTime = ts;

  // spawn logic
  lastSpawn += dt * 1000;
  // spawn only when there are no active scoops (one-by-one)
  if (scoops.length === 0 && lastSpawn > spawnDelay) {
    spawnScoop();
    lastSpawn = 0;
    spawnDelay = 800 + Math.random() * 700;
  }

  // update scoops
  for (let i = scoops.length - 1; i >= 0; i--) {
    const s = scoops[i];
    if (!s.landed) {
      s.x += s.vx * dt;

      // check passing entirely off screen
      if (s.fromLeft && s.x > gameWidth + 50) scoops.splice(i, 1);
      if (!s.fromLeft && s.x + s.w < -50) scoops.splice(i, 1);
    }
  }

  // apply gravity to girl
  girl.vy += gravity * dt;
  girl.y += girl.vy * dt;
  girl.onGround = false;

  // keep girl standing on current top of stack (cone or last landed scoop)
  const top = stack[stack.length - 1];
  if (top) {
    const girlBottom = girl.y + girl.h;
    const overlap = Math.min(girl.x + girl.w, top.x + (top.w||0)) - Math.max(girl.x, top.x);
    
    // Girl lands if bottom is falling through or touching top surface and has horizontal overlap
    if (girlBottom >= top.y && girlBottom <= top.y + 30 && girl.vy >= 0 && overlap > 5) {
      girl.y = top.y - girl.h;
      girl.vy = 0;
      girl.onGround = true;
    }
  }

  // collision / landing checks against moving scoops
  for (let i = scoops.length - 1; i >= 0; i--) {
    const s = scoops[i];
    
    const girlBottom = girl.y + girl.h;
    const horizOverlap = Math.min(girl.x + girl.w, s.x + s.w) - Math.max(girl.x, s.x);
    
    // Check if girl is overlapping with scoop
    const girlRect = { x: girl.x, y: girl.y, w: girl.w, h: girl.h };
    const scoopRect = { x: s.x, y: s.y, w: s.w, h: s.h };
    
    if (!rectsOverlap(girlRect, scoopRect)) continue; // no collision
    
    // Girl is overlapping - check if it's a safe landing from above
    const isSafeLanding = (girl.vy > 0 && girlBottom >= s.y && girlBottom <= s.y + 30 && horizOverlap > 5);
    
    if (isSafeLanding) {
      // successful landing
      s.landed = true;
      s.vx = 0;
      
      // position scoop on top of current stack (stack grows upward = negative Y)
      const stackTop = stack[stack.length - 1];
      s.y = stackTop.y - s.h;
      
      scoops.splice(i, 1);
      stack.push(s);
      
      // position girl on top of new scoop
      girl.y = s.y - girl.h;
      girl.vy = 0;
      girl.onGround = true;
      score += 1;
      scoreEl.textContent = score;
      cameraTarget = getCameraTargetForGirl();
      cameraTargetX = getCameraTargetForGirlX();
      cameraY = cameraTarget;
      cameraX = cameraTargetX;
    } else {
      // collision from side or other direction = death
      endGame();
      return;
    }
  }

  // falling below base => game over
  const baseY = stack[0].y + 200; // generous bottom
  if (girl.y > gameHeight + 80) {
    endGame();
    return;
  }

  // update camera to keep girl roughly centered
  // camera only moves toward cameraTarget (set when stack increases)
  const lerpSpeed = 8;
  cameraY += (cameraTarget - cameraY) * Math.min(1, lerpSpeed * dt);
  cameraX += (cameraTargetX - cameraX) * Math.min(1, lerpSpeed * dt);

  // render
  render();

  requestAnimationFrame(gameLoop);
}

function render() {
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, gameWidth, gameHeight);

  // Draw background (stays still - not affected by camera)
  if (images.background.complete) {
    ctx.drawImage(images.background, 0, 0, gameWidth, gameHeight);
  } else {
    ctx.fillStyle = '#ffd1dc';
    ctx.fillRect(0, 0, gameWidth, gameHeight);
  }

  // apply zoom (scale) and camera translate for game elements only
  ctx.save();
  ctx.scale(currentScale, currentScale);
  ctx.translate(-cameraX, -cameraY);

  // draw stack (cone + landed scoops)
  for (let i = 0; i < stack.length; i++) {
    const item = stack[i];
    if (item.isCone) {
      const coneImg = images.cone;
      if (coneImg.complete) {
        ctx.drawImage(coneImg, item.x, item.y, item.w, item.h);
      } else {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(item.x, item.y, item.w, item.h);
      }
    } else {
      const scoopImg = images[item.imageKey];
      if (scoopImg && scoopImg.complete) {
        ctx.drawImage(scoopImg, item.x, item.y, item.w, item.h);
      } else {
        ctx.fillStyle = '#a8e6ff';
        ctx.fillRect(item.x, item.y, item.w, item.h);
      }
    }
  }

  // draw moving scoops
  for (let i = 0; i < scoops.length; i++) {
    const s = scoops[i];
    const scoopImg = images[s.imageKey];
    if (scoopImg && scoopImg.complete) {
      ctx.drawImage(scoopImg, s.x, s.y, s.w, s.h);
    } else {
      ctx.fillStyle = '#a8e6ff';
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // draw active character (use jump sprite if in air, otherwise normal)
  const standingSprite = currentCharacter === 'girl' ? images.girl : images.boy;
  const jumpSprite = currentCharacter === 'girl' ? images.girlJump : images.boyJump;
  const girlImg = girl.onGround ? standingSprite : jumpSprite;
  if (girlImg.complete) {
    ctx.drawImage(girlImg, girl.x, girl.y, girl.w, girl.h);
  } else {
    ctx.fillStyle = 'purple';
    ctx.fillRect(girl.x, girl.y, girl.w, girl.h);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function endGame() {
  running = false;
  // compute tower bounds including the girl so we can frame the whole stack
  const stackTop = Math.min(...stack.map(s => s.y));
  const stackBottom = Math.max(...stack.map(s => s.y + s.h));
  const towerTop = Math.min(stackTop, girl.y);
  const towerBottom = Math.max(stackBottom, girl.y + girl.h);
  const towerHeight = towerBottom - towerTop;

  // compute scale to fit tower into view with a margin
  const margin = 40; // pixels of padding
  const availableHeight = gameHeight - margin * 2;
  const scaleForHeight = availableHeight / towerHeight;
  const scaleForWidth = gameWidth / gameWidth; // tower width fits canvas
  const desiredScale = Math.min(1, scaleForHeight, scaleForWidth);

  // compute camera target so tower is centered on screen after scaling
  const towerCenter = (towerTop + towerBottom) / 2;
  const targetCameraY = towerCenter - (gameHeight / (2 * desiredScale));
  // compute horizontal center of the tower and target camera X so tower centers horizontally
  const towerLeft = Math.min(...stack.map(s => s.x));
  const towerRight = Math.max(...stack.map(s => s.x + s.w));
  const towerCenterX = (towerLeft + towerRight) / 2;
  const targetCameraX = towerCenterX - (gameWidth / (2 * desiredScale));

  // snap instantly to the final framing (no animation)
  currentScale = desiredScale;
  cameraY = targetCameraY;
  cameraX = targetCameraX;
  render();
  showGameOver();
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function showGameOver() {
  finalScoreEl.textContent = `Score: ${score}`;
  const stored = parseInt(localStorage.getItem('highscore') || '0', 10);
  let isNew = false;
  if (score > stored) {
    localStorage.setItem('highscore', String(score));
    isNew = true;
  }
  newHighEl.style.display = isNew ? 'block' : 'none';
  highscoreEl.textContent = localStorage.getItem('highscore') || 0;
  gameOverEl.classList.remove('hidden');
}

function attemptJump() {
  if (!running) return;
  if (girl.onGround) {
    girl.vy = -550;
    girl.onGround = false;
  }
}

function isInteractiveTarget(target) {
  return target instanceof Element && !!target.closest('button');
}

// input
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    attemptJump();
  }
});

if (document.body.classList.contains('web-mode')) {
  window.addEventListener('touchstart', (e) => {
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
    attemptJump();
  }, { passive: false });

  window.addEventListener('click', (e) => {
    if (isInteractiveTarget(e.target)) return;
    attemptJump();
  });
}

yesBtn.addEventListener('click', () => {
  console.log('YES button clicked - restarting game');
  gameOverEl.classList.add('hidden');
  resetGameState();
  lastTime = 0;
  requestAnimationFrame(gameLoop);
});

noBtn.addEventListener('click', () => {
  gameOverEl.classList.add('hidden');
  gameScreen.classList.remove('active');
  homeScreen.classList.add('active');
  lastTime = 0;
});

function startGame() {
  gameOverEl.classList.add('hidden');
  resetGameState();
  lastTime = 0;
  requestAnimationFrame(gameLoop);
}
