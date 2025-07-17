// index.js (Server-side with rooms)

const express = require('express');
const app     = express();
const http    = require('http').createServer(app);
const io      = require('socket.io')(http);

app.use(express.static('public'));

// ─── Room management ─────────────────────────
const games = {}; // roomId → game state

// expose a webpage listing all active rooms
app.get('/rooms', (req, res) => {
  let html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Active Rooms</title>
        <style>
          body { background: #0c0c0c; color: #eee; font-family: sans-serif; padding: 20px; }
          h1 { margin-bottom: 1em; }
          ul { list-style: none; padding: 0; }
          li { margin: 0.5em 0; }
          a { color: #4af; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Active Rooms</h1>
        <ul>
  `;
  for (const [roomId, game] of Object.entries(games)) {
    html += `<li>
      <strong>${roomId}</strong> (${game.players.length}/4)
      ${game.players.length < 4
        ? `<a href="/?room=${encodeURIComponent(roomId)}">Join</a>`
        : `<em>Full</em>`}
    </li>\n`;
  }
  html += `
        </ul>
      </body>
    </html>
  `;
  res.send(html);
});

// Layout constants (must match client CSS)
const WIDTH            = 850;
const HEIGHT           = 650;
const DOT_COUNT        = 6;
const DOT_SIZE         = 20;
const DOT_MARGIN       = 10;
const DOT_LEFT_OFFSET  = 10;
const DOT_RIGHT_OFFSET = WIDTH - DOT_SIZE - DOT_LEFT_OFFSET;
const HEX_COUNT        =10;
const SQUARE_COUNT     = 5;
const SQUARE_MARGIN    = 10;
const COLUMN_SQUARE_COUNT   = 5;

// ─── Image‑column constants ───────────────────────
const IMAGE_COUNT        = 14;
const IMAGE_WIDTH        = 20;
const IMAGE_HEIGHT       = 34;
const IMAGE_MARGIN       = 10;
// place the image‑column just left of your right‑column:
const IMAGE_LEFT_OFFSET  = DOT_RIGHT_OFFSET - IMAGE_WIDTH - IMAGE_MARGIN;
const C_IMAGE_LEFT_OFFSET = IMAGE_LEFT_OFFSET - IMAGE_WIDTH - IMAGE_MARGIN;

const G_IMAGE_COUNT      = 10;
const G_IMAGE_WIDTH      = 50;
const G_IMAGE_HEIGHT     = 50;
const G_IMAGE_MARGIN     = IMAGE_MARGIN;
const G_IMAGE_LEFT_OFFSET = C_IMAGE_LEFT_OFFSET - G_IMAGE_WIDTH - G_IMAGE_MARGIN;
const CS_IMAGE_COUNT      = 7;
const CS_IMAGE_WIDTH      = 136;   // 1131px × 0.2 ≈ 226px
const CS_IMAGE_HEIGHT     = 70;   // 578px × 0.2 ≈ 116px
const CS_IMAGE_MARGIN     = IMAGE_MARGIN;
const CS_IMAGE_LEFT_OFFSET = DOT_LEFT_OFFSET;

// D‑images (row above bottom polygons)
const D_IMAGE_COUNT   = 3;
const D_IMAGE_WIDTH   = 50;
const D_IMAGE_HEIGHT  = 50;
const D_IMAGE_MARGIN  = IMAGE_MARGIN;



// Shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build main deck
function createMainDeck() {
  const d = [];
  for (let i = 1; i <= 36; i++) d.push(i.toString().padStart(2, '0'));
  return shuffle(d);
}

// Initialize dot positions (right column only)
function initDots() {
  const dots = [];
  const totalH = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_MARGIN;
  const startY = (HEIGHT - totalH) / 1 - 100;
  for (let i = 0; i < DOT_COUNT; i++) {
    dots.push({ x: DOT_RIGHT_OFFSET, y: startY + i * (DOT_SIZE + DOT_MARGIN) });
  }
  return dots;
}

// Initialize hexagon positions/values (right column only)
function initHexes() {
  const hexes = [];
  const totalH = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_MARGIN;
  const startY = (HEIGHT - totalH) / 1 - 135;
  for (let i = 0; i < HEX_COUNT; i++) {
    hexes.push({
      x: DOT_RIGHT_OFFSET,
      y: startY - i * (DOT_SIZE + DOT_MARGIN),
      value: 20
    });
  }
  return hexes;
}



// ─── initSquares(): always show max on load ─────────────────
function initSquares() {
  const shapes = [
    { clip: 'triangle', min: 1,  max: 4  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'hexagon',  min: 1,  max: 8  },
    { clip: 'diamond',  min: 0,  max: 10  },
    { clip: 'decagon',  min: 1,  max: 12 }
  ];

  const count   = shapes.length;
  const totalW  = count * DOT_SIZE + (count - 1) * SQUARE_MARGIN;
  const startX  = (WIDTH - totalW) / 2;
  const topY    = DOT_MARGIN;
  const botY    = HEIGHT - DOT_MARGIN - DOT_SIZE;

  const makeRow = y => shapes.map((s, i) => {
    // use s.max instead of random
    const raw = s.max;
    const val = s.clip === 'diamond'
      ? String(raw).padStart(2, '0')
      : raw;
    return {
      x:     startX + i * (DOT_SIZE + SQUARE_MARGIN),
      y,
      value: val
    };
  });

  return [
    ...makeRow(topY),   // top row all max
    ...makeRow(botY)    // bottom row all max
  ];
}





// Initialize draggable‑image positions (left of the existing column)
function initImages() {
  const imgs = [];
  const totalH = IMAGE_COUNT * IMAGE_HEIGHT + (IMAGE_COUNT - 1) * IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < IMAGE_COUNT; i++) {
    imgs.push({
      x: IMAGE_LEFT_OFFSET,
      y: startY + i * (IMAGE_HEIGHT + IMAGE_MARGIN)
    });
  }
  return imgs;
}

// ─── After initImages(), define ─────────────────────────
function initCImages() {
  const cols = [];
  const totalH = IMAGE_COUNT * IMAGE_HEIGHT + (IMAGE_COUNT - 1) * IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < IMAGE_COUNT; i++) {
    cols.push({
      x: C_IMAGE_LEFT_OFFSET,
      y: startY + i * (IMAGE_HEIGHT + IMAGE_MARGIN)
    });
  }
  return cols;
}

function initGImages() {
  const cols = [];
  const totalH = G_IMAGE_COUNT * G_IMAGE_HEIGHT + (G_IMAGE_COUNT - 1) * G_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < G_IMAGE_COUNT; i++) {
    cols.push({
      x: G_IMAGE_LEFT_OFFSET,
      y: startY + i * (G_IMAGE_HEIGHT + G_IMAGE_MARGIN)
    });
  }
  return cols;
}

function initCSImages() {
  const cols = [];
  const totalH = CS_IMAGE_COUNT * CS_IMAGE_HEIGHT + (CS_IMAGE_COUNT - 1) * CS_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < CS_IMAGE_COUNT; i++) {
    cols.push({
      x: CS_IMAGE_LEFT_OFFSET,
      y: startY + i * (CS_IMAGE_HEIGHT + CS_IMAGE_MARGIN)
    });
  }
  return cols;
}

function initDImages() {
  const cols = [];
  const totalW = D_IMAGE_COUNT * D_IMAGE_WIDTH
                 + (D_IMAGE_COUNT - 1) * D_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  // compute bottom‐row y by re‑running initSquares()
  const squares = initSquares();
  // SQUARE_COUNT is how many per row
  const bottomY  = squares[squares.length - SQUARE_COUNT].y;
  const y        = bottomY - D_IMAGE_HEIGHT - D_IMAGE_MARGIN;
  for (let i = 0; i < D_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (D_IMAGE_WIDTH + D_IMAGE_MARGIN),
      y
    });
  }
  return cols;
}


// ────────────────────────────────────────────────
io.on('connection', socket => {
  let room, game;

  function broadcastHandCounts() {
    if (!game) return;
    const counts = game.players.map(id => ({
      id,
      count: (game.hands[id] || []).length
    }));
    io.in(room).emit('hand-counts', counts);
  }

  // 1) Client joins a room
  socket.on('join-room', roomId => {
    room = roomId;
    if (!games[room]) {
      games[room] = {
        players: [],
        hands: {},
        table: [],
        deck: createMainDeck(),
        dotPositions: initDots(),
        hexPositions: initHexes(),
        squarePositions: initSquares(),
        imagePositions: initImages(),
        cImagePositions: initCImages(),
        gImagePositions: initGImages(),
        csImagePositions: initCSImages(),
        dImagePositions: initDImages()
      };
    }
    game = games[room];

    if (game.players.length >= 4) {
      return socket.emit('room-full');
    }

    socket.join(room);
    game.players.push(socket.id);
    game.hands[socket.id] = [];

    // initial sync
    socket.emit('joined',       game.players.length);
    socket.emit('your-hand',    game.hands[socket.id]);
    socket.emit('table-update', game.table);
    socket.emit('dots-update',  game.dotPositions);
    socket.emit('hexes-update', game.hexPositions);
    socket.emit('squares-update', game.squarePositions);
    socket.emit('images-update', game.imagePositions);
    socket.emit('c-images-update', game.cImagePositions);
    socket.emit('g-images-update', game.gImagePositions);
    socket.emit('cs-images-update', game.csImagePositions);
    socket.emit('d-images-update', game.dImagePositions);
    broadcastHandCounts();
  });

  // 2) Draw / shuffle main deck
  socket.on('draw-card', () => {
    if (!game || !game.deck.length) return;
    const c = game.deck.pop();
    game.hands[socket.id].push(c);
    socket.emit('your-hand', game.hands[socket.id]);
    broadcastHandCounts();
  });
  socket.on('shuffle-main-deck', () => {
    if (game) game.deck = shuffle(game.deck);
  });

  // 3) Play & move cards
  socket.on('play-card', ({ card, x, y }) => {
    if (!game) return;
    const idx = game.hands[socket.id].indexOf(card);
    if (idx !== -1) game.hands[socket.id].splice(idx, 1);
    game.table.push({ card, x, y });
    io.in(room).emit('table-update', game.table);
    socket.emit('your-hand', game.hands[socket.id]);
    broadcastHandCounts();
  });
  socket.on('move-table-card', ({ index, x, y }) => {
    if (!game || !game.table[index]) return;
    game.table[index].x = x;
    game.table[index].y = y;
    io.in(room).emit('table-update', game.table);
  });

  // 4) Return card from hand → deck
  socket.on('return-card-from-hand', ({ card }) => {
    if (!game) return;
    const h = game.hands[socket.id];
    const i = h.indexOf(card);
    if (i === -1) return;
    h.splice(i, 1);
    socket.emit('your-hand', h);
    broadcastHandCounts();
    game.deck.push(card);
    shuffle(game.deck);
  });

  // 5) Return card from table → deck
  socket.on('return-card-from-table', ({ index, card }) => {
    if (!game || !game.table[index] || game.table[index].card !== card) return;
    game.table.splice(index, 1);
    io.in(room).emit('table-update', game.table);
    broadcastHandCounts();
    game.deck.push(card);
    shuffle(game.deck);
  });

  // 6) Dot sync
  socket.on('move-dot', ({ index, x, y }) => {
    if (!game || !game.dotPositions[index]) return;
    game.dotPositions[index] = { x, y };
    io.in(room).emit('dots-update', game.dotPositions);
  });

  // 7) Hex sync
  socket.on('move-hex', ({ index, x, y }) => {
    if (!game || !game.hexPositions[index]) return;
    game.hexPositions[index].x = x;
    game.hexPositions[index].y = y;
    io.in(room).emit('hexes-update', game.hexPositions);
  });
  socket.on('update-hex', ({ index, value }) => {
    if (!game || !game.hexPositions[index]) return;
    game.hexPositions[index].value = value;
    io.in(room).emit('hexes-update', game.hexPositions);
  });

  // 8) Square sync
  socket.on('move-square', ({ index, x, y }) => {
    if (!game || !game.squarePositions[index]) return;
    game.squarePositions[index].x = x;
    game.squarePositions[index].y = y;
    io.in(room).emit('squares-update', game.squarePositions);
  });
  socket.on('update-square', ({ index, value }) => {
    if (!game || !game.squarePositions[index]) return;
    game.squarePositions[index].value = value;
    io.in(room).emit('squares-update', game.squarePositions);
  });

  // 9) Cleanup on disconnect
  socket.on('disconnect', () => {
    if (!game) return;
    game.players = game.players.filter(id => id !== socket.id);
    delete game.hands[socket.id];
    socket.leave(room);
    broadcastHandCounts();
    if (game.players.length === 0) delete games[room];
  });

  // 10) Image‑column sync
  socket.on('move-image', ({ index, x, y }) => {
    if (!game || !game.imagePositions[index]) return;
    game.imagePositions[index] = { x, y };
    io.in(room).emit('images-update', game.imagePositions);
  });

  socket.on('move-c-image', ({ index, x, y }) => {
    if (!game || !game.cImagePositions[index]) return;
    game.cImagePositions[index] = { x, y };
    io.in(room).emit('c-images-update', game.cImagePositions);
  });

  socket.on('move-g-image', ({ index, x, y }) => {
    if (!game || !game.gImagePositions[index]) return;
    game.gImagePositions[index] = { x, y };
    io.in(room).emit('g-images-update', game.gImagePositions);
  });

  socket.on('move-cs-image', ({ index, x, y }) => {
    if (!game || !game.csImagePositions[index]) return;
    game.csImagePositions[index] = { x, y };
    io.in(room).emit('cs-images-update', game.csImagePositions);
  });

  socket.on('move-d-image', ({ index, x, y }) => {
    if (!game || !game.dImagePositions[index]) return;
    game.dImagePositions[index] = { x, y };
    io.in(room).emit('d-images-update', game.dImagePositions);
  });
});

http.listen(3000, () => console.log('Server listening on port 3000'));
