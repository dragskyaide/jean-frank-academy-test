/**
 * JEAN FRANK — moteur de dames internationales FMJD 10×10.
 * Cases numérotées 1–50. Les pièces sont codées b, w, bk, wk.
 * API compatible avec l'interface PWA existante.
 */
export const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];

export function rc(square) {
  if (!Number.isInteger(square) || square < 1 || square > 50) throw new Error('Case invalide (1–50)');
  const row = Math.floor((square - 1) / 5);
  const index = (square - 1) % 5;
  return [row, index * 2 + (row % 2 === 0 ? 1 : 0)];
}

export function sq(row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 9 || col < 0 || col > 9 || (row + col) % 2 === 0) return null;
  return row * 5 + Math.floor(col / 2) + 1;
}

export const isPromotionSquare = (square, color) => color === 'w' ? square >= 1 && square <= 5 : square >= 46 && square <= 50;
const opposite = color => color === 'w' ? 'b' : 'w';
const isKing = piece => piece?.length === 2 && piece[1] === 'k';

function signature(board, turn) {
  return `${turn}|${Object.keys(board).map(Number).sort((a,b)=>a-b).map(n=>`${n}:${board[n]}`).join(',')}`;
}

export function createPosition({whiteMen=[],whiteKings=[],blackMen=[],blackKings=[],turn='w'}={}) {
  if (!['w','b'].includes(turn)) throw new Error('Trait invalide');
  const board = {};
  const add = (list, piece) => {
    for (const n of list) {
      if (!Number.isInteger(n) || n < 1 || n > 50 || board[n]) throw new Error(`Placement invalide sur la case ${n}`);
      board[n] = piece;
    }
  };
  add(whiteMen,'w'); add(whiteKings,'wk'); add(blackMen,'b'); add(blackKings,'bk');
  const sig = signature(board, turn);
  return {board,turn,history:[],result:null,kingOnly:0,positionKeys:{[sig]:1}};
}

export function initial() {
  return createPosition({blackMen:Array.from({length:20},(_,i)=>i+1),whiteMen:Array.from({length:20},(_,i)=>i+31)});
}

function manCaptures(state, from, piece) {
  const board = state.board;
  const color = piece[0];
  const results = [];
  const walk = (at, path, captured, visited) => {
    const [r,c] = rc(at);
    let extended = false;
    for (const [dr,dc] of dirs) {
      const victim = sq(r+dr,c+dc);
      const landing = sq(r+2*dr,c+2*dc);
      if (!victim || !landing || !board[victim] || board[victim][0] === color || captured.includes(victim)) continue;
      if (board[landing] || visited.has(landing)) continue;
      extended = true;
      const nextVisited = new Set(visited); nextVisited.add(landing);
      walk(landing,[...path,landing],[...captured,victim],nextVisited);
    }
    if (!extended && captured.length) results.push({from,to:at,path,captured,promotes:isPromotionSquare(at,color)});
  };
  walk(from,[from],[],new Set([from]));
  return results;
}

function kingCaptures(state, from, piece) {
  const board = state.board;
  const color = piece[0];
  const results = [];
  const walk = (at,path,captured,visited) => {
    const [r,c] = rc(at);
    let extended = false;
    for (const [dr,dc] of dirs) {
      let step = 1, victim = null;
      while (true) {
        const n = sq(r+dr*step,c+dc*step);
        if (!n) break;
        if (board[n]) {
          if (board[n][0] === color || captured.includes(n)) victim = null;
          else victim = n;
          break;
        }
        step++;
      }
      if (!victim) continue;
      for (let landingStep=step+1;;landingStep++) {
        const landing = sq(r+dr*landingStep,c+dc*landingStep);
        if (!landing || board[landing]) break;
        if (visited.has(landing)) continue;
        extended = true;
        const nextVisited = new Set(visited); nextVisited.add(landing);
        walk(landing,[...path,landing],[...captured,victim],nextVisited);
      }
    }
    if (!extended && captured.length) results.push({from,to:at,path,captured,promotes:false});
  };
  walk(from,[from],[],new Set([from]));
  return results;
}

export function legalMoves(state) {
  if (!state || !state.board || !['w','b'].includes(state.turn) || state.result) return [];
  const captures = [];
  for (const [key,piece] of Object.entries(state.board)) {
    const from = Number(key);
    if (piece?.[0] !== state.turn) continue;
    captures.push(...(isKing(piece) ? kingCaptures(state,from,piece) : manCaptures(state,from,piece)));
  }
  if (captures.length) {
    const maximum = Math.max(...captures.map(m=>m.captured.length));
    return captures.filter(m=>m.captured.length===maximum);
  }
  const moves=[];
  for (const [key,piece] of Object.entries(state.board)) {
    const from=Number(key);
    if (piece?.[0]!==state.turn) continue;
    const [r,c]=rc(from);
    if (isKing(piece)) {
      for (const [dr,dc] of dirs) for (let step=1;;step++) {
        const to=sq(r+dr*step,c+dc*step);
        if (!to || state.board[to]) break;
        moves.push({from,to,path:[from,to],captured:[],promotes:false});
      }
    } else {
      const dr=piece[0]==='w'?-1:1;
      for (const dc of [-1,1]) {
        const to=sq(r+dr,c+dc);
        if (to && !state.board[to]) moves.push({from,to,path:[from,to],captured:[],promotes:isPromotionSquare(to,piece[0])});
      }
    }
  }
  return moves;
}

export function apply(state, move) {
  const legal=legalMoves(state);
  const chosen=legal.find(m=>m.from===move.from && m.to===move.to && JSON.stringify(m.path)===JSON.stringify(move.path) && JSON.stringify(m.captured)===JSON.stringify(move.captured));
  if (!chosen) throw new Error('Coup illégal');
  const piece=state.board[chosen.from];
  const board={...state.board};
  delete board[chosen.from];
  for (const n of chosen.captured) delete board[n];
  board[chosen.to]=chosen.promotes ? `${piece[0]}k` : piece;
  const turn=opposite(state.turn);
  const kingOnly=isKing(piece) && chosen.captured.length===0 ? (state.kingOnly||0)+1 : 0;
  const next={...state,board,turn,history:[...(state.history||[]),chosen],kingOnly,result:null};
  const sig=signature(board,turn);
  next.positionKeys={...(state.positionKeys||{}),[sig]:((state.positionKeys||{})[sig]||0)+1};
  const remainingPieces=Object.values(board).some(p=>p[0]===turn);
  if (!remainingPieces || legalMoves(next).length===0) next.result=state.turn==='w'?'Blanc gagne':'Noir gagne';
  return next;
}

export function isDrawClaimable(state) {
  const sig=signature(state.board,state.turn);
  return ((state.positionKeys||{})[sig]||0)>=3 || (state.kingOnly||0)>=25;
}

export const notation = move => move.path.join(move.captured.length ? 'x' : '-');
