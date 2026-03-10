// sketch.js - Simplified Snooker Game
// Controls: ← → = aim    SPACE = shoot

// ────────────────────────────────────────────────
// GLOBAL VARIABLES
// ────────────────────────────────────────────────
let gameState = 'menu'; 
let gameMode = ''; 
let currentPlayer = 1;
let player1Score = 0;
let player2Score = 0;

let balls = [];
let cueBall = null;
let reds = [];
let colors = [];

let tableWidth = 1000;
let tableHeight = 500;
let pocketRadius = 18;
let ballRadius = 11;
let pockets = []; // Initialized in setup

let cueAngle; 
let shootPower = 9;

let phase = 'red'; 
let allRedsPotted = false;
let foul = false;
let foulPoints = 0;

let menuButtons = [];

// ────────────────────────────────────────────────
// BALL CLASS
// ────────────────────────────────────────────────
class Ball {
  constructor(x, y, col, value, isRed = false) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.color = col;
    this.value = value;
    this.radius = ballRadius;
    this.potted = false;
    this.isRed = isRed;
    this.spotPos = createVector(x, y);
  }

  update() {
    if (this.potted) return;

    this.vel.mult(0.975); // Friction
    this.pos.add(this.vel);

    // Wall bounce
    if (this.pos.x < this.radius) { 
      this.pos.x = this.radius; 
      this.vel.x = abs(this.vel.x) * 0.9; 
    } else if (this.pos.x > tableWidth - this.radius) { 
      this.pos.x = tableWidth - this.radius; 
      this.vel.x = -abs(this.vel.x) * 0.9; 
    }

    if (this.pos.y < this.radius) { 
      this.pos.y = this.radius; 
      this.vel.y = abs(this.vel.y) * 0.9; 
    } else if (this.pos.y > tableHeight - this.radius) { 
      this.pos.y = tableHeight - this.radius; 
      this.vel.y = -abs(this.vel.y) * 0.9; 
    }
  }

  show() {
    if (this.potted) return;
    fill(this.color);
    noStroke();
    ellipse(this.pos.x, this.pos.y, this.radius * 2);
  }

  checkPotted() {
    if (this.potted) return false;
    for (let pocket of pockets) {
      if (dist(this.pos.x, this.pos.y, pocket.x, pocket.y) < pocketRadius + this.radius * 0.5) {
        this.potted = true;
        return true;
      }
    }
    return false;
  }
}

// ────────────────────────────────────────────────
// p5 LIFECYCLE
// ────────────────────────────────────────────────
function setup() {
  createCanvas(tableWidth, tableHeight);
  
  // Initialize P5 dependent variables
  cueAngle = -HALF_PI;
  pockets = [
    createVector(0, 0),
    createVector(tableWidth, 0),
    createVector(0, tableHeight),
    createVector(tableWidth, tableHeight),
    createVector(tableWidth / 2, 0),
    createVector(tableWidth / 2, tableHeight)
  ];

  showMenu();
}

function draw() {
  background(10, 80, 30);
  
  if (gameState !== 'game') return;

  // Draw Pockets
  fill(0);
  for (let p of pockets) ellipse(p.x, p.y, pocketRadius * 2);

  // Update and Draw Balls
  let moving = anyBallMoving();
  
  for (let b of balls) {
    b.update();
    b.show();
    if (b.checkPotted()) handlePot(b);
  }

  // Collisions
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[i].potted && !balls[j].potted) {
        checkCollision(balls[i], balls[j]);
      }
    }
  }

  // Cue Logic
  if (!moving) {
    if (currentPlayer === 2 && gameMode === 'cpu') {
       cpuAimAndShoot();
    } else {
       drawCue();
    }
  }

  drawUI();
}

// ────────────────────────────────────────────────
// GAME LOGIC & UI
// ────────────────────────────────────────────────

function drawUI() {
  fill(255);
  noStroke();
  textSize(18);
  textAlign(LEFT);
  text(`Player 1: ${player1Score}`, 20, 30);
  text(`Player ${gameMode === 'cpu' ? 'CPU' : '2'}: ${player2Score}`, 20, 55);
  text(`Turn: Player ${currentPlayer} | Phase: ${phase}`, 20, 80);

  if (foul) {
    fill(255, 100, 100);
    textAlign(CENTER);
    text(`FOUL! +${foulPoints} to opponent`, width/2, height/2);
  }
}

function anyBallMoving() {
  return balls.some(b => !b.potted && b.vel.magSq() > 0.01);
}

function drawCue() {
  let len = 150;
  stroke(200, 150, 100);
  strokeWeight(4);
  let ex = cueBall.pos.x + len * cos(cueAngle);
  let ey = cueBall.pos.y + len * sin(cueAngle);
  line(cueBall.pos.x, cueBall.pos.y, ex, ey);
}

function keyPressed() {
  if (gameState !== 'game' || anyBallMoving()) return;
  if (keyCode === LEFT_ARROW)  cueAngle -= 0.1;
  if (keyCode === RIGHT_ARROW) cueAngle += 0.1;
  if (key === ' ')             shoot();
}

function shoot() {
  foul = false; // Reset foul display on new shot
  cueBall.vel.set(shootPower * cos(cueAngle + PI), shootPower * sin(cueAngle + PI));
}

function cpuAimAndShoot() {
  setTimeout(() => {
    cueAngle = random(TWO_PI);
    shoot();
  }, 1000);
}

function checkCollision(b1, b2) {
  let d = dist(b1.pos.x, b1.pos.y, b2.pos.x, b2.pos.y);
  if (d >= b1.radius + b2.radius) return;

  let n = p5.Vector.sub(b2.pos, b1.pos).normalize();
  let rv = p5.Vector.sub(b1.vel, b2.vel);
  let velNormal = rv.dot(n);
  if (velNormal > 0) return;

  let impulse = -2 * velNormal / 2;
  b1.vel.sub(p5.Vector.mult(n, impulse));
  b2.vel.add(p5.Vector.mult(n, impulse));

  // Resolve overlap
  let overlap = (b1.radius + b2.radius) - d;
  b1.pos.sub(p5.Vector.mult(n, overlap * 0.5));
  b2.pos.add(p5.Vector.mult(n, overlap * 0.5));
}

function handlePot(ball) {
  if (ball === cueBall) {
    foul = true; foulPoints = 4;
    respot(ball);
    return;
  }
  // Simplified scoring/logic
  if (ball.isRed) {
    addScore(1);
  } else {
    addScore(ball.value);
    if (reds.some(r => !r.potted)) respot(ball);
  }
}

function respot(ball) {
  ball.potted = false;
  ball.pos.set(ball.spotPos);
  ball.vel.set(0, 0);
}

function addScore(pts) {
  if (currentPlayer === 1) player1Score += pts;
  else player2Score += pts;
}

// ────────────────────────────────────────────────
// SETUP HELPERS
// ────────────────────────────────────────────────

function initBalls() {
  balls = [];
  reds = [];
  
  cueBall = new Ball(tableWidth * 0.2, tableHeight / 2, 'white', 0);
  balls.push(cueBall);

  // Setup Colors
  let colorsData = [
    {x: 0.25, y: 0.5, c: 'yellow', v: 2},
    {x: 0.25, y: 0.4, c: 'green', v: 3},
    {x: 0.25, y: 0.6, c: 'brown', v: 4},
    {x: 0.5,  y: 0.5, c: 'blue', v: 5},
    {x: 0.75, y: 0.5, c: 'pink', v: 6},
    {x: 0.9,  y: 0.5, c: 'black', v: 7}
  ];

  for(let cd of colorsData) {
    let b = new Ball(tableWidth * cd.x, tableHeight * cd.y, cd.c, cd.v);
    balls.push(b);
  }

  // Reds
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j <= i; j++) {
      let r = new Ball(tableWidth * 0.78 + i * 20, (tableHeight/2 - i * 10) + j * 20, 'red', 1, true);
      balls.push(r);
      reds.push(r);
    }
  }
}

function showMenu() {
  gameState = 'menu';
  const btn1 = createButton('Pass and Play');
  btn1.position(width/2 - 60, height/2 - 40);
  btn1.mousePressed(() => startGame('passplay'));
  
  const btn2 = createButton('Vs CPU');
  btn2.position(width/2 - 60, height/2 + 10);
  btn2.mousePressed(() => startGame('cpu'));
  
  menuButtons.push(btn1, btn2);
}

function startGame(mode) {
  gameMode = mode;
  gameState = 'game';
  menuButtons.forEach(b => b.remove());
  initBalls();
}