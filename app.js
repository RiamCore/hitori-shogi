(() => {
"use strict";

// Board coordinates: x=0 is file 9, y=0 is rank 1 (CPU side).
const GLYPH = {
  K:"玉", R:"飛", B:"角", G:"金", S:"銀", N:"桂", L:"香", P:"歩",
  "+R":"龍", "+B":"馬", "+S":"全", "+N":"圭", "+L":"杏", "+P":"と"
};
const PROMOTE = {R:"+R", B:"+B", S:"+S", N:"+N", L:"+L", P:"+P"};
const UNPROMOTE = {"+R":"R", "+B":"B", "+S":"S", "+N":"N", "+L":"L", "+P":"P"};
const HAND_ORDER = ["R","B","G","S","N","L","P"];
const boardEl = document.getElementById("board");
const cpuHandEl = document.getElementById("cpuHand");
const playerHandEl = document.getElementById("playerHand");
const statusEl = document.getElementById("status");
const difficultyEl = document.getElementById("difficulty");
const undoBtn = document.getElementById("undo");
const menuScreen = document.getElementById("menuScreen");
const gameScreen = document.getElementById("gameScreen");
const startGameBtn = document.getElementById("startGame");
const backToMenuBtn = document.getElementById("backToMenu");
let state, selected = null, legalTargets = [], history = [], busy = false, gameOver = false, lastMove = null;

function initialState() {
  const b = Array.from({length:9}, () => Array(9).fill(null));
  const back = ["L","N","S","G","K","G","S","N","L"];
  for (let x=0;x<9;x++) {
    b[0][x] = {t:back[x], s:2};
    b[2][x] = {t:"P", s:2};
    b[6][x] = {t:"P", s:1};
    b[8][x] = {t:back[x], s:1};
  }
  b[1][1] = {t:"R",s:2}; b[1][7] = {t:"B",s:2};
  b[7][1] = {t:"B",s:1}; b[7][7] = {t:"R",s:1};
  return {b, hands:{1:{R:0,B:0,G:0,S:0,N:0,L:0,P:0},2:{R:0,B:0,G:0,S:0,N:0,L:0,P:0}}, turn:1};
}
function clone(s) { return {b:s.b.map(row=>row.map(p=>p?{...p}:null)), hands:{1:{...s.hands[1]},2:{...s.hands[2]},}, turn:s.turn}; }
function inside(x,y){ return x>=0&&x<9&&y>=0&&y<9; }
function sideForward(side){ return side===1 ? -1 : 1; }
function baseType(t){ return UNPROMOTE[t] || t; }
function promoted(t){ return !!UNPROMOTE[t]; }
function canPromote(t){ return !!PROMOTE[t] && !promoted(t); }
function zone(side,y){ return side===1 ? y<=2 : y>=6; }
function deadRank(t,side,y) {
  const f=sideForward(side);
  if (t==="P"||t==="L") return side===1 ? y===0 : y===8;
  if (t==="N") return side===1 ? y<=1 : y>=7;
  return false;
}
function addStep(out,s,x,y,dx,dy,side,t) {
  const nx=x+dx, ny=y+dy;
  if (!inside(nx,ny)) return false;
  const p=s.b[ny][nx];
  if (p && p.s===side) return false;
  out.push({x:nx,y:ny});
  return !p;
}
function pseudoMoves(s,x,y,includeKing=true) {
  const p=s.b[y][x]; if(!p) return [];
  const {t, s:side}=p, f=sideForward(side), out=[];
  const steps=[];
  const slides=[];
  const bt=baseType(t);
  if (bt==="K") {
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(dx||dy) steps.push([dx,dy]);
  } else if (["G","S","N","L","P"].includes(bt)) {
    if (bt==="G" || promoted(t)) {
      steps.push([-1,f],[0,f],[1,f],[-1,0],[1,0],[0,-f]);
    } else if(bt==="S") {
      steps.push([-1,f],[0,f],[1,f],[-1,-f],[1,-f]);
    } else if(bt==="N") {
      steps.push([-1,2*f],[1,2*f]);
    } else if(bt==="L") {
      slides.push([0,f]);
    } else if(bt==="P") {
      steps.push([0,f]);
    }
  } else if (bt==="R") {
    slides.push([1,0],[-1,0],[0,1],[0,-1]);
    if(promoted(t)) steps.push([1,1],[1,-1],[-1,1],[-1,-1]);
  } else if (bt==="B") {
    slides.push([1,1],[1,-1],[-1,1],[-1,-1]);
    if(promoted(t)) steps.push([1,0],[-1,0],[0,1],[0,-1]);
  }
  for(const [dx,dy] of steps) addStep(out,s,x,y,dx,dy,side,t);
  for(const [dx,dy] of slides) {
    let nx=x+dx,ny=y+dy;
    while(inside(nx,ny)) {
      const q=s.b[ny][nx];
      if(q&&q.s===side) break;
      out.push({x:nx,y:ny});
      if(q) break;
      nx+=dx;ny+=dy;
    }
  }
  return out;
}
function findKing(s,side) {
  for(let y=0;y<9;y++) for(let x=0;x<9;x++) if(s.b[y][x]&&s.b[y][x].s===side&&s.b[y][x].t==="K") return {x,y};
  return null;
}
function attacked(s,x,y,bySide) {
  for(let yy=0;yy<9;yy++) for(let xx=0;xx<9;xx++) {
    const p=s.b[yy][xx]; if(!p||p.s!==bySide) continue;
    if(pseudoMoves(s,xx,yy).some(m=>m.x===x&&m.y===y)) return true;
  }
  return false;
}
function inCheck(s,side) {
  const k=findKing(s,side);
  return k ? attacked(s,k.x,k.y,3-side) : true;
}
function applyMove(s,m) {
  const n=clone(s), side=n.turn;
  if(m.drop) {
    n.hands[side][m.piece]--;
    n.b[m.y][m.x]={t:m.piece,s:side};
  } else {
    const p=n.b[m.fromY][m.fromX], target=n.b[m.y][m.x];
    if(target) {
      const t=baseType(target.t);
      if(t!=="K") n.hands[side][t]=(n.hands[side][t]||0)+1;
    }
    let t=p.t;
    if(m.promote) t=PROMOTE[t]||t;
    n.b[m.y][m.x]={t,s:side};
    n.b[m.fromY][m.fromX]=null;
  }
  n.turn=3-side;
  return n;
}
function allLegalMoves(s,side=s.turn) {
  const out=[];
  for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
    const p=s.b[y][x]; if(!p||p.s!==side) continue;
    for(const dest of pseudoMoves(s,x,y)) {
      const opts=[false];
      if(canPromote(p.t)&&(zone(side,y)||zone(side,dest.y))) opts.push(true);
      for(const pro of opts) {
        if(!pro && deadRank(baseType(p.t),side,dest.y)) continue;
        if(!pro && baseType(p.t)==="N" && (side===1?dest.y<=1:dest.y>=7)) continue;
        const m={fromX:x,fromY:y,x:dest.x,y:dest.y,promote:pro};
        const n=applyMove(s,m);
        if(!inCheck(n,side)) out.push(m);
      }
    }
  }
  // Drops
  for(const t of HAND_ORDER) if((s.hands[side][t]||0)>0) {
    for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
      if(s.b[y][x]) continue;
      if(deadRank(t,side,y)) continue;
      if(t==="N" && (side===1?y<=1:y>=7)) continue;
      if(t==="P") {
        let hasPawn=false;
        for(let yy=0;yy<9;yy++) if(s.b[yy][x]&&s.b[yy][x].s===side&&s.b[yy][x].t==="P") hasPawn=true;
        if(hasPawn) continue;
      }
      const m={drop:true,piece:t,x,y};
      const n=applyMove(s,m);
      if(inCheck(n,side)) continue;
      // Pawn-drop mate prohibition
      if(t==="P" && givesCheck(n,side) && allLegalMoves(n,3-side).length===0) continue;
      out.push(m);
    }
  }
  return out;
}
function givesCheck(s,side) { return inCheck(s,3-side); }
function moveKey(m){ return m.drop?`D${m.piece}${m.x}${m.y}`:`M${m.fromX}${m.fromY}${m.x}${m.y}${m.promote?1:0}`; }
function moveText(m) {
  const file=9-m.x, rank="一二三四五六七八九"[m.y];
  if(m.drop) return `${file}${rank}${GLYPH[m.piece]}打`;
  const p=state.b[m.fromY][m.fromX];
  return `${file}${rank}${GLYPH[m.promote?PROMOTE[p.t]:p.t]||"駒"}${m.promote?"成":""}`;
}
function makeMove(m) {
  if(gameOver||busy) return;
  history.push({state:clone(state),lastMove:lastMove?{...lastMove}:null});
  lastMove={x:m.x,y:m.y,fromX:m.fromX,fromY:m.fromY};
  state=applyMove(state,m); selected=null; legalTargets=[];
  render();
  if(!allLegalMoves(state).length) {
    gameOver=true;
    const loser=state.turn;
    statusEl.textContent = inCheck(state,loser) ? (loser===1?"詰みです。CPUの勝ちです":"詰みです。あなたの勝ちです") : (loser===1?"動ける手がありません。CPUの勝ちです":"動ける手がありません。あなたの勝ちです");
    render(); return;
  }
  statusEl.textContent=state.turn===1?"あなたの番です":"CPUが考えています…";
  if(state.turn===2) {
    busy=true; render();
    setTimeout(()=>{ cpuTurn(); },80);
  }
}
function promoteChoice(m,p) {
  const forced=deadRank(p.t,p.s,m.y)||(p.t==="N"&&(p.s===1?m.y<=1:m.y>=7));
  if(forced) { m.promote=true; return makeMove(m); }
  const should = zone(p.s,m.fromY)||zone(p.s,m.y);
  if(!should||!canPromote(p.t)) return makeMove(m);
  const yes=window.confirm(`${GLYPH[p.t]}を成りますか？\n「キャンセル」で成らずに進みます。`);
  m.promote=yes; makeMove(m);
}
function clickSquare(x,y) {
  if(busy||gameOver||state.turn!==1) return;
  const p=state.b[y][x];
  if(selected&&legalTargets.some(m=>m.x===x&&m.y===y)) {
    const m=legalTargets.find(m=>m.x===x&&m.y===y);
    const piece=state.b[selected.y][selected.x];
    const full={...m,fromX:selected.x,fromY:selected.y};
    selected=null; legalTargets=[];
    if(canPromote(piece.t)&&(zone(1,full.fromY)||zone(1,full.y))) promoteChoice(full,piece);
    else { full.promote=false; makeMove(full); }
    return;
  }
  if(p&&p.s===1) {
    selected={x,y,hand:null};
    legalTargets=allLegalMoves(state).filter(m=>!m.drop&&m.fromX===x&&m.fromY===y);
  } else { selected=null; legalTargets=[]; }
  render();
}
function clickHand(piece) {
  if(busy||gameOver||state.turn!==1||!state.hands[1][piece]) return;
  if(selected&&selected.hand===piece) {selected=null;legalTargets=[];render();return;}
  selected={hand:piece};
  legalTargets=allLegalMoves(state).filter(m=>m.drop&&m.piece===piece);
  render();
}
function renderHand(el,side) {
  el.innerHTML="";
  for(const t of HAND_ORDER) {
    const count=state.hands[side][t]||0; if(!count) continue;
    const btn=document.createElement("button");
    btn.className="hand-piece"+(selected&&selected.hand===t&&side===1?" selected":"");
    btn.textContent=GLYPH[t]; const small=document.createElement("small"); small.textContent=`×${count}`; btn.appendChild(small);
    btn.disabled=side!==1||busy||gameOver||state.turn!==1;
    btn.addEventListener("click",()=>clickHand(t)); el.appendChild(btn);
  }
  if(!el.children.length) { const span=document.createElement("span"); span.textContent="なし"; span.style.fontSize="13px"; span.style.padding="8px 0"; el.appendChild(span); }
}
function render() {
  boardEl.innerHTML="";
  const targetSet=new Set(legalTargets.map(m=>`${m.x},${m.y}`));
  for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
    const sq=document.createElement("button"); sq.className="square"; sq.type="button"; sq.setAttribute("aria-label",`${9-x}筋 ${y+1}段`);
    if(lastMove&&lastMove.x===x&&lastMove.y===y) sq.classList.add("last");
    if(targetSet.has(`${x},${y}`)) sq.classList.add("legal");
    const p=state.b[y][x];
    if(p) {
      const span=document.createElement("span");
      span.className="piece"+(p.s===2?" gote":"")+(promoted(p.t)?" promoted":"")+(selected&&selected.x===x&&selected.y===y?" selected":"");
      span.textContent=GLYPH[p.t]||p.t; sq.appendChild(span);
    }
    sq.addEventListener("click",()=>clickSquare(x,y)); boardEl.appendChild(sq);
  }
  renderHand(cpuHandEl,2); renderHand(playerHandEl,1);
  undoBtn.disabled=history.length===0||busy;
  startGameBtn.disabled=busy;
}
function evaluate(s) {
  const values={K:10000,R:950,B:850,G:600,S:480,N:380,L:300,P:100};
  let score=0;
  for(let y=0;y<9;y++) for(let x=0;x<9;x++) {
    const p=s.b[y][x]; if(!p) continue;
    let v=values[baseType(p.t)]||0;
    if(promoted(p.t)) v += ({R:180,B:170,S:120,N:120,L:100,P:100}[baseType(p.t)]||0);
    // Mild central advancement / mobility preference
    const advance=p.s===2?y:8-y;
    v += Math.max(0,4-Math.abs(4-x))*2 + advance*1.5;
    score += p.s===2?v:-v;
  }
  for(const side of [1,2]) for(const t of HAND_ORDER) score += (side===2?1:-1)*(values[t]||0)*0.88*(s.hands[side][t]||0);
  return score;
}
function minimax(s,depth,alpha,beta,rootSide) {
  const moves=allLegalMoves(s);
  if(depth===0||moves.length===0) {
    if(!moves.length) return s.turn===2? -100000-depth : 100000+depth;
    return evaluate(s)*(rootSide===2?1:-1);
  }
  // Order captures and promotions first for alpha-beta pruning
  moves.sort((a,b)=>movePriority(s,b)-movePriority(s,a));
  const maximizing=s.turn===rootSide;
  let best=maximizing?-Infinity:Infinity;
  for(const m of moves) {
    const val=minimax(applyMove(s,m),depth-1,alpha,beta,rootSide);
    if(maximizing) { best=Math.max(best,val); alpha=Math.max(alpha,best); }
    else { best=Math.min(best,val); beta=Math.min(beta,best); }
    if(beta<=alpha) break;
  }
  return best;
}
function movePriority(s,m) {
  let v=m.promote?120:0;
  if(!m.drop&&s.b[m.y][m.x]) v+= ( {P:10,L:20,N:30,S:40,G:50,B:70,R:80,K:0}[baseType(s.b[m.y][m.x].t)]||0);
  if(m.drop) v+=1;
  return v;
}
function cpuTurn() {
  if(gameOver) {busy=false;render();return;}
  const moves=allLegalMoves(state);
  if(!moves.length) {busy=false;gameOver=true;statusEl.textContent="あなたの勝ちです";render();return;}
  const level=Number(difficultyEl.value);
  const depth=level===1?1:(level===2?2:3);
  // Randomness at level 1; levels 2 and 3 search more deeply.
  let chosen=null;
  if(level===1) {
    const ranked=moves.map(m=>({m,score:evaluate(applyMove(state,m))+(Math.random()*100-50)}));
    ranked.sort((a,b)=>b.score-a.score); chosen=ranked[0].m;
  } else {
    let best=-Infinity; const ranked=moves.map(m=>({m,score:0}));
    // Limit expensive deep search to a shortlist after cheap move ordering.
    ranked.sort((a,b)=>movePriority(state,b.m)-movePriority(state,a.m));
    const shortlist=ranked.slice(0, level===2?24:18);
    for(const item of shortlist) {
      item.score=minimax(applyMove(state,item.m),depth-1,-Infinity,Infinity,2);
      if(item.score>best) {best=item.score;chosen=item.m;}
    }
  }
  busy=false;
  if(chosen) {
    history.push({state:clone(state),lastMove:lastMove?{...lastMove}:null});
    lastMove={x:chosen.x,y:chosen.y,fromX:chosen.fromX,fromY:chosen.fromY};
    state=applyMove(state,chosen);
  }
  selected=null; legalTargets=[];
  if(!allLegalMoves(state).length) {
    gameOver=true; statusEl.textContent=inCheck(state,1)?"詰みです。CPUの勝ちです":"CPUの手がなくなりました。あなたの勝ちです";
  } else statusEl.textContent="あなたの番です";
  render();
}
startGameBtn.addEventListener("click",()=>{
  state=initialState(); selected=null; legalTargets=[]; history=[]; busy=false; gameOver=false; lastMove=null;
  statusEl.textContent="あなたの番です";
  menuScreen.hidden=true;
  gameScreen.hidden=false;
  render();
});
backToMenuBtn.addEventListener("click",()=>{
  if(busy) return;
  if(history.length&&!window.confirm("対局を中断してメニューに戻りますか？")) return;
  menuScreen.hidden=false;
  gameScreen.hidden=true;
});
undoBtn.addEventListener("click",()=>{
  if(busy||!history.length) return;
  // Undo one player move and, if present, the CPU reply.
  const previous=history.pop();
  state=previous.state; lastMove=previous.lastMove;
  if(state.turn===1 && history.length && history[history.length-1].state.turn===2) {
    const prior=history.pop(); state=prior.state; lastMove=prior.lastMove;
  }
  selected=null; legalTargets=[]; gameOver=false; statusEl.textContent="あなたの番です"; render();
});
state=initialState(); render();

})();