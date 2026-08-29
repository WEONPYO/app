// ==========================================
// Tennis Scoreboard Script for Obfuscation (Fixed)
// ==========================================

// 접속 도메인 검증
function checkDomainAuth() {
  const allowedHost = "weonpyo.github.io";
  if (window.location.hostname !== allowedHost) {
    const authDiv = document.getElementById('unauthorized-access');
    if (authDiv) authDiv.style.display = 'flex';
    return false;
  }
  return true;
}

let config = {
  type: 'doubles',
  firstServeTeam: 'A',
  setsToWin: 3,
  gamesPerSet: 6,
  deuceRule: 'ad',
  courtChange: 'manual',
  announceServer: '3000', // 복식 게임 종료 후 서브 순서 콜 지연시간 (ms)
  playersA: ['A. P1', 'A. P2'],
  playersB: ['B. P1', 'B. P2'],
  swipes: {
    up: 'right_score',
    down: 'left_score',
    left: 'court_change',
    right: 'undo'
  },
  mediaKeys: {
    nexttrack: 'right_score',
    previoustrack: 'left_score',
    pause: 'undo',
    play: 'court_change'
  }
};

let state = {
  ptsA: 0, ptsB: 0,
  gamesA: 0, gamesB: 0,
  setsA: 0, setsB: 0,
  isTiebreak: false,
  tiebreakFirstServer: null,
  currentServerTeam: 'A',
  serverIdxA: 0,
  serverIdxB: 0,
  courtLeftTeam: 'A'
};

let historyStack = [];
const MAX_HISTORY = 10;
const pointTerms = ["Love", "Fifteen", "Thirty", "Forty"];

let wakeLock = null;
let audioCtx = null;
let serverAnnounceTimer = null; // 서브 순서 호출용 타이머

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

// 예약된 서브 순서 음성 호출 취소
function cancelServerAnnouncement() {
  if (serverAnnounceTimer) {
    clearTimeout(serverAnnounceTimer);
    serverAnnounceTimer = null;
  }
}

// 게임/세트/코트체인지 종료 후 서브 순서 음성 호출 예약 (복식 전용)
function scheduleServerAnnouncement(customDelayMs = null) {
  cancelServerAnnouncement();

  if (config.type !== 'doubles') return;
  if (config.announceServer === 'off') return;

  const delayMs = customDelayMs !== null ? customDelayMs : parseInt(config.announceServer || '3000', 10);

  serverAnnounceTimer = setTimeout(() => {
    if (config.type !== 'doubles') return;

    const serverTeam = state.currentServerTeam;
    const activeServerIdx = (serverTeam === 'A') ? state.serverIdxA : state.serverIdxB;
    
    // 첫 번째 선수 / 두 번째 선수 ("First server" / "Second server") 호출
    const callText = (activeServerIdx === 0) ? "First server" : "Second server";

    speak(callText);
    serverAnnounceTimer = null;
  }, delayMs);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { 
        wakeLock = null; 
      });
    }
  } catch (err) {}
}

function enableVideoWakeLock() {
  const videoEl = document.getElementById('wakelock-video');
  if (videoEl) {
    if (!videoEl.src) {
      videoEl.src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAptZGF0AAAAAAYAAAAA";
    }
    videoEl.play().catch(() => {});
  }
}

async function keepScreenAlive() {
  await requestWakeLock();
  enableVideoWakeLock();
  
  const audioEl = document.getElementById('silent-audio');
  if (audioEl && audioEl.paused) {
    audioEl.play().catch(() => {});
  }
}

setInterval(() => {
  if (checkDomainAuth()) {
    keepScreenAlive();
  }
}, 10000);

function setupMediaSession() {
  const silentAudioURI = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  const audioEl = document.getElementById('silent-audio');
  if (audioEl) {
    audioEl.src = silentAudioURI;
    audioEl.play().catch(() => {});
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Tennis Scoreboard Active",
        artist: "Screen Always On",
        album: "WP Scoreboard",
        artwork: [
          { src: 'https://via.placeholder.com/96', sizes: '96x96', type: 'image/png' }
        ]
      });

      const actionHandlers = [
        ['nexttrack', () => executeControlAction(config.mediaKeys.nexttrack)],
        ['previoustrack', () => executeControlAction(config.mediaKeys.previoustrack)],
        ['pause', () => executeControlAction(config.mediaKeys.pause)],
        ['play', () => executeControlAction(config.mediaKeys.play)],
        ['playpause', () => executeControlAction(config.mediaKeys.play)]
      ];

      for (const [action, handler] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {}
      }
    } catch (e) {}
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    keepScreenAlive();
  }
});

window.addEventListener('touchstart', () => {
  keepScreenAlive();
}, { passive: true });

function showCustomConfirm(message, onConfirm) {
  const confirmModal = document.getElementById('custom-confirm-modal');
  const confirmMsg = document.getElementById('confirm-message');
  const btnYes = document.getElementById('btn-confirm-yes');
  const btnNo = document.getElementById('btn-confirm-no');

  if (!confirmModal || !confirmMsg || !btnYes || !btnNo) return;

  confirmMsg.innerText = message;
  confirmModal.style.display = 'flex';

  const handleYes = () => {
    cleanup();
    confirmModal.style.display = 'none';
    onConfirm();
  };

  const handleNo = () => {
    cleanup();
    confirmModal.style.display = 'none';
  };

  const cleanup = () => {
    btnYes.removeEventListener('click', handleYes);
    btnNo.removeEventListener('click', handleNo);
  };

  btnYes.addEventListener('click', handleYes);
  btnNo.addEventListener('click', handleNo);
}

function loadStorage() {
  const savedConfig = localStorage.getItem('tennis_config');
  if (savedConfig) {
    try { config = { ...config, ...JSON.parse(savedConfig) }; } catch(e) {}
  }
  const savedState = localStorage.getItem('tennis_state');
  if (savedState) {
    try { state = JSON.parse(savedState); } catch(e) {}
  }
}

function saveConfigToStorage() {
  localStorage.setItem('tennis_config', JSON.stringify(config));
}

function saveStateToStorage() {
  localStorage.setItem('tennis_state', JSON.stringify(state));
}

function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

async function startFullscreenApp() {
  toggleFullscreen();
  await keepScreenAlive();
  setupMediaSession();
  const fsOverlay = document.getElementById('fs-overlay');
  if (fsOverlay) fsOverlay.style.display = 'none';
  render();
}

window.onload = async () => {
  if (!checkDomainAuth()) return;

  loadStorage();
  setupEvents();
  setupSwipeEvents();
  populateSettingsModal();
  await keepScreenAlive();
  setupMediaSession();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
  }
  render();
};

function setupEvents() {
  const modal = document.getElementById('settings-modal');
  const btnSettings = document.getElementById('btn-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  if (btnSettings && modal) {
    btnSettings.onclick = () => {
      populateSettingsModal();
      modal.style.display = 'block';
    };
  }

  if (btnCloseSettings && modal) {
    btnCloseSettings.onclick = () => {
      modal.style.display = 'none';
    };
  }

  window.onclick = (event) => {
    if (modal && event.target === modal) {
      modal.style.display = 'none';
    }
  };

  if (btnSaveSettings && modal) {
    btnSaveSettings.onclick = () => {
      showCustomConfirm("설정을 적용하고 경기 점수를 초기화하시겠습니까?", () => {
        saveSettings();
        modal.style.display = 'none';
      });
    };
  }
}

function setupSwipeEvents() {
  window.addEventListener('touchstart', (e) => {
    if (e.target.closest('.modal') || e.target.closest('.confirm-modal')) return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (e.target.closest('.modal') || e.target.closest('.confirm-modal')) return;
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, { passive: true });
}

function handleSwipeGesture() {
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  const minDistance = 40;

  if (Math.abs(deltaX) < minDistance && Math.abs(deltaY) < minDistance) {
    return;
  }

  let action = 'none';

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    action = deltaX < 0 ? config.swipes.left : config.swipes.right;
  } else {
    action = deltaY < 0 ? config.swipes.up : config.swipes.down;
  }

  executeControlAction(action);
}

function executeControlAction(action) {
  const leftTeam = state.courtLeftTeam;
  const rightTeam = (leftTeam === 'A') ? 'B' : 'A';

  switch (action) {
    case 'left_score':
      addPoint(leftTeam);
      break;
    case 'right_score':
      addPoint(rightTeam);
      break;
    case 'court_change':
      manualCourtChange();
      break;
    case 'undo':
      undo();
      break;
    case 'none':
    default:
      break;
  }
}

function getVal(id, defaultVal = '') {
  const el = document.getElementById(id);
  return el ? el.value : defaultVal;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function populateSettingsModal() {
  setVal('set-type', config.type);
  setVal('set-first-serve', config.firstServeTeam);
  setVal('set-sets', config.setsToWin);
  setVal('set-games', config.gamesPerSet);
  setVal('set-deuce', config.deuceRule);
  setVal('set-court', config.courtChange);
  setVal('set-announce-server', config.announceServer || '3000');
  setVal('p-a1', config.playersA[0] || '');
  setVal('p-a2', config.playersA[1] || '');
  setVal('p-b1', config.playersB[0] || '');
  setVal('p-b2', config.playersB[1] || '');

  setVal('swipe-up', config.swipes.up || 'right_score');
  setVal('swipe-down', config.swipes.down || 'left_score');
  setVal('swipe-left', config.swipes.left || 'court_change');
  setVal('swipe-right', config.swipes.right || 'undo');

  if (!config.mediaKeys) {
    config.mediaKeys = {
      nexttrack: 'right_score',
      previoustrack: 'left_score',
      pause: 'undo',
      play: 'court_change'
    };
  }

  setVal('media-next', config.mediaKeys.nexttrack || 'right_score');
  setVal('media-prev', config.mediaKeys.previoustrack || 'left_score');
  setVal('media-pause', config.mediaKeys.pause || 'undo');
  setVal('media-play', config.mediaKeys.play || 'court_change');

  togglePlayerInputs();
}

function togglePlayerInputs() {
  const typeEl = document.getElementById('set-type');
  if (!typeEl) return;
  const isSingles = typeEl.value === 'singles';
  
  const pa2 = document.getElementById('p-a2');
  const pb2 = document.getElementById('p-b2');
  if (pa2) pa2.style.display = isSingles ? 'none' : 'block';
  if (pb2) pb2.style.display = isSingles ? 'none' : 'block';
}

function saveSettings() {
  cancelServerAnnouncement();
  config.type = getVal('set-type', 'doubles');
  config.firstServeTeam = getVal('set-first-serve', 'A');
  config.setsToWin = parseInt(getVal('set-sets', '3'), 10);
  config.gamesPerSet = parseInt(getVal('set-games', '6'), 10);
  config.deuceRule = getVal('set-deuce', 'ad');
  config.courtChange = getVal('set-court', 'manual');
  config.announceServer = getVal('set-announce-server', '3000');
  
  config.playersA = [
    getVal('p-a1') || 'A. P1',
    getVal('p-a2') || 'A. P2'
  ];
  config.playersB = [
    getVal('p-b1') || 'B. P1',
    getVal('p-b2') || 'B. P2'
  ];

  config.swipes = {
    up: getVal('swipe-up', 'right_score'),
    down: getVal('swipe-down', 'left_score'),
    left: getVal('swipe-left', 'court_change'),
    right: getVal('swipe-right', 'undo')
  };

  config.mediaKeys = {
    nexttrack: getVal('media-next', 'right_score'),
    previoustrack: getVal('media-prev', 'left_score'),
    pause: getVal('media-pause', 'undo'),
    play: getVal('media-play', 'court_change')
  };

  saveConfigToStorage();
  setupMediaSession();
  resetMatch();
}

function saveState() {
  historyStack.push(JSON.parse(JSON.stringify(state)));
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
}

function undo() {
  cancelServerAnnouncement();
  if (historyStack.length === 0) return;
  state = historyStack.pop();
  saveStateToStorage();
  render();
  speakCall("Correction, ");
}

function confirmResetMatch() {
  showCustomConfirm("정말로 경기를 초기화하시겠습니까?", () => {
    resetMatch();
  });
}

function resetMatch() {
  cancelServerAnnouncement();
  state = {
    ptsA: 0, ptsB: 0,
    gamesA: 0, gamesB: 0,
    setsA: 0, setsB: 0,
    isTiebreak: false,
    tiebreakFirstServer: null,
    currentServerTeam: config.firstServeTeam,
    serverIdxA: 0, serverIdxB: 0,
    courtLeftTeam: 'A'
  };
  historyStack = [];
  saveStateToStorage();
  render();
  speak("Reset");
}

function toggleServeTeam() {
  cancelServerAnnouncement();
  saveState();
  state.currentServerTeam = state.currentServerTeam === 'A' ? 'B' : 'A';
  saveStateToStorage();
  render();
  speak(`Service Team ${state.currentServerTeam}`);
}

function addPoint(team) {
  cancelServerAnnouncement();
  saveState();
  if (state.isTiebreak) {
    handleTiebreakPoint(team);
  } else {
    handleStandardPoint(team);
  }
  saveStateToStorage();
  render();
}

function handleStandardPoint(team) {
  const isA = (team === 'A');
  let pWin = isA ? state.ptsA : state.ptsB;
  let pLose = isA ? state.ptsB : state.ptsA;

  if (config.deuceRule === 'no-ad' && pWin === 3 && pLose === 3) {
    winGame(team);
    return;
  }

  if (pWin >= 3 && pLose >= 3) {
    if (pWin === pLose) {
      if (isA) state.ptsA++; else state.ptsB++;
      speakCall();
    } else if ((isA && state.ptsA > state.ptsB) || (!isA && state.ptsB > state.ptsA)) {
      winGame(team);
    } else {
      state.ptsA = 3; state.ptsB = 3;
      speakCall();
    }
  } else if (pWin === 3) {
    winGame(team);
  } else {
    if (isA) state.ptsA++; else state.ptsB++;
    speakCall();
  }
}

function handleTiebreakPoint(team) {
  if (team === 'A') state.ptsA++; else state.ptsB++;
  const totalPts = state.ptsA + state.ptsB;

  if (totalPts % 2 === 1) switchServer();
  if (config.courtChange === 'auto' && totalPts % 6 === 0) manualCourtChange(true, false);

  if ((state.ptsA >= 7 || state.ptsB >= 7) && Math.abs(state.ptsA - state.ptsB) >= 2) {
    winGame(state.ptsA > state.ptsB ? 'A' : 'B');
  } else {
    speakCall();
  }
}

function getLastName(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

function getTeamDisplayName(team) {
  if (config.type === 'singles') {
    const player = team === 'A' ? config.playersA[0] : config.playersB[0];
    return getLastName(player);
  } else {
    return `Team ${team}`;
  }
}

function winGame(team) {
  cancelServerAnnouncement();
  const winnerCall = getTeamDisplayName(team);
  
  if (team === 'A') state.gamesA++; else state.gamesB++;
  state.ptsA = 0; state.ptsB = 0;

  const gWin = team === 'A' ? state.gamesA : state.gamesB;
  const gLose = team === 'A' ? state.gamesB : state.gamesA;

  let gameAnnouncement = `Game ${winnerCall}., , ${state.gamesA} games to ${state.gamesB}`;
  
  const totalGames = state.gamesA + state.gamesB;
  const isAutoCourtChange = (config.courtChange === 'auto' && totalGames % 2 === 1 && !state.isTiebreak);

  if (isAutoCourtChange) {
    manualCourtChange(true, false);
  }

  if (state.isTiebreak) {
    winSet(team, true);
  } else if (gWin >= config.gamesPerSet && (gWin - gLose) >= 2) {
    winSet(team, false);
  } else if (gWin === config.gamesPerSet && gLose === config.gamesPerSet) {
    state.isTiebreak = true;
    if (!isAutoCourtChange) {
      speak(`${gameAnnouncement}., , Tiebreak`);
    }
    switchServer();
    scheduleServerAnnouncement();
  } else {
    if (!isAutoCourtChange) {
      speak(gameAnnouncement);
    }
    switchServer();
    scheduleServerAnnouncement();
  }
}

function winSet(team, viaTiebreak = false) {
  cancelServerAnnouncement();
  const winnerCall = getTeamDisplayName(team);
  if (team === 'A') state.setsA++; else state.setsB++;

  const tiebreakFirstServer = state.tiebreakFirstServer;

  state.gamesA = 0; state.gamesB = 0;
  state.isTiebreak = false;
  state.tiebreakFirstServer = null;

  const sWin = team === 'A' ? state.setsA : state.setsB;
  if (sWin >= config.setsToWin) {
    speak(`Game, set and match, ${winnerCall}., , ${state.setsA} sets to ${state.setsB}`);
  } else {
    speak(`Set, ${winnerCall}., , ${state.setsA} sets to ${state.setsB}`);

    if (viaTiebreak && tiebreakFirstServer) {
      state.currentServerTeam = (tiebreakFirstServer === 'A') ? 'B' : 'A';
      if (config.courtChange === 'auto') manualCourtChange(true, false);
    } else {
      switchServer();
    }
    scheduleServerAnnouncement();
  }
}

function switchServer() {
  if (config.type === 'singles') {
    state.currentServerTeam = state.currentServerTeam === 'A' ? 'B' : 'A';
  } else {
    if (state.currentServerTeam === 'A') {
      state.currentServerTeam = 'B';
    } else {
      state.currentServerTeam = 'A';
      state.serverIdxA = (state.serverIdxA + 1) % 2;
      state.serverIdxB = (state.serverIdxB + 1) % 2;
    }
  }
}

function manualCourtChange(announce = true, recordHistory = true) {
  cancelServerAnnouncement();
  if (recordHistory) saveState();
  state.courtLeftTeam = (state.courtLeftTeam === 'A') ? 'B' : 'A';
  saveStateToStorage();
  render();
  if (announce) {
    speak("Change ends");
    scheduleServerAnnouncement(2500);
  }
}

function playWakeUpSound(durationMs = 600) {
  return new Promise((resolve) => {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const durationSec = durationMs / 1000;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime + durationSec);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + durationSec);

      setTimeout(resolve, durationMs);
    } catch (e) {
      setTimeout(resolve, durationMs);
    }
  });
}

async function speak(text) {
  await playWakeUpSound(600);

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const usFemaleVoice = voices.find(v => 
        v.lang.includes('en-US') && (
          v.name.includes('Google US English') || 
          v.name.includes('Samantha') || 
          v.name.includes('Zira') || 
          v.name.includes('Female') ||
          v.name.includes('Victoria')
        )
      ) || voices.find(v => v.lang.includes('en-US') || v.lang.includes('en_US'));

      if (usFemaleVoice) utterance.voice = usFemaleVoice;

      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }
}

function speakCall(prefix = "") {
  let callText = "";
  if (state.isTiebreak) {
    callText = `${state.ptsA}, ${state.ptsB}`;
  } else {
    const pA = state.ptsA;
    const pB = state.ptsB;

    if (pA >= 3 && pB >= 3) {
      if (pA === pB) {
        callText = "Deuce";
      } else if (pA > pB) {
        const name = config.type === 'singles' ? getLastName(config.playersA[0]) : "Team A";
        callText = `Advantage, ${name}`;
      } else {
        const name = config.type === 'singles' ? getLastName(config.playersB[0]) : "Team B";
        callText = `Advantage, ${name}`;
      }
    } else {
      if (pA === pB) {
        if (pointTerms[pA] === "Love") callText = "Love All";
        else callText = `${pointTerms[pA]}-All`;
      } else {
        const sPts = state.currentServerTeam === 'A' ? pA : pB;
        const rPts = state.currentServerTeam === 'A' ? pB : pA;
        callText = `${pointTerms[sPts]}, , ${pointTerms[rPts]}`;
      }
    }
  }

  speak(prefix + callText);
}

function formatScore(pts, oppPts) {
  if (state.isTiebreak) return pts.toString();
  if (pts >= 3 && oppPts >= 3) {
    if (pts === oppPts) return "40";
    return pts > oppPts ? "AD" : "40";
  }
  return pointTerms[pts] ? (pointTerms[pts] === "Love" ? "0" : (pts === 1 ? "15" : pts === 2 ? "30" : "40")) : "0";
}

function setTxt(id, txt) {
  const el = document.getElementById(id);
  if (el) el.innerText = txt;
}

function render() {
  setTxt('disp-players-a', config.type === 'doubles' 
    ? `${config.playersA[0]} / ${config.playersA[1]}` : config.playersA[0]);
  setTxt('disp-players-b', config.type === 'doubles' 
    ? `${config.playersB[0]} / ${config.playersB[1]}` : config.playersB[0]);

  setTxt('sets-a', state.setsA);
  setTxt('sets-b', state.setsB);
  setTxt('games-a', state.gamesA);
  setTxt('games-b', state.gamesB);

  setTxt('points-a', formatScore(state.ptsA, state.ptsB));
  setTxt('points-b', formatScore(state.ptsB, state.ptsA));

  const serveA = document.getElementById('serve-a');
  const serveB = document.getElementById('serve-b');
  if (serveA) serveA.classList.toggle('active', state.currentServerTeam === 'A');
  if (serveB) serveB.classList.toggle('active', state.currentServerTeam === 'B');

  setTxt('btn-toggle-serve', `SERVE: TEAM ${state.currentServerTeam}`);

  const leftTeam = state.courtLeftTeam;
  const rightTeam = (leftTeam === 'A') ? 'B' : 'A';

  const cardA = document.getElementById('card-team-a');
  const cardB = document.getElementById('card-team-b');
  if (cardA && cardB) {
    if (leftTeam === 'A') {
      cardA.style.order = 1;
      cardB.style.order = 2;
    } else {
      cardA.style.order = 2;
      cardB.style.order = 1;
    }
  }

  setTxt('arrow-a', (leftTeam === 'A') ? '◀' : '▶');
  setTxt('arrow-b', (leftTeam === 'B') ? '◀' : '▶');

  const sideLeftBg = document.getElementById('side-left-bg');
  const sideRightBg = document.getElementById('side-right-bg');
  if (sideLeftBg) sideLeftBg.className = `court-side left ${leftTeam === 'A' ? 'bg-team-a' : 'bg-team-b'}`;
  if (sideRightBg) sideRightBg.className = `court-side right ${rightTeam === 'A' ? 'bg-team-a' : 'bg-team-b'}`;

  setTxt('label-left', `TEAM ${leftTeam}`);
  setTxt('label-right', `TEAM ${rightTeam}`);

  const totalPts = state.ptsA + state.ptsB;
  const isDeuceServe = (totalPts % 2 === 0);
  const isDoubles = (config.type === 'doubles');

  const serverTeam = state.currentServerTeam;
  const activeServerIdx = isDoubles ? (serverTeam === 'A' ? state.serverIdxA : state.serverIdxB) : 0;

  const pmA1 = document.getElementById('pm-a1');
  const pmA2 = document.getElementById('pm-a2');
  const pmB1 = document.getElementById('pm-b1');
  const pmB2 = document.getElementById('pm-b2');

  if (!pmA1 || !pmA2 || !pmB1 || !pmB2) return;

  const updateMarkerContent = (el, name, role) => {
    let badgeHtml = '';
    if (role === 'SERVE') {
      badgeHtml = `<span class="role-badge visible">SERVE</span>`;
    } else if (role === 'RECEIVE') {
      badgeHtml = `<span class="role-badge visible">RECEIVER</span>`;
    } else {
      badgeHtml = `<span class="role-badge"></span>`;
    }
    el.innerHTML = `<span class="player-name-text">${name}</span>${badgeHtml}`;
  };

  const isA1_Server = (serverTeam === 'A' && activeServerIdx === 0);
  const isA2_Server = (serverTeam === 'A' && activeServerIdx === 1);
  const isB1_Server = (serverTeam === 'B' && activeServerIdx === 0);
  const isB2_Server = (serverTeam === 'B' && activeServerIdx === 1);

  const isA1_Receiver = (serverTeam === 'B' && isDeuceServe);
  const isA2_Receiver = (serverTeam === 'B' && !isDeuceServe);
  const isB1_Receiver = (serverTeam === 'A' && isDeuceServe);
  const isB2_Receiver = (serverTeam === 'A' && !isDeuceServe);

  updateMarkerContent(pmA1, config.playersA[0], isA1_Server ? 'SERVE' : (isA1_Receiver ? 'RECEIVE' : ''));
  updateMarkerContent(pmA2, config.playersA[1], isA2_Server ? 'SERVE' : (isA2_Receiver ? 'RECEIVE' : ''));
  updateMarkerContent(pmB1, config.playersB[0], isB1_Server ? 'SERVE' : (isB1_Receiver ? 'RECEIVE' : ''));
  updateMarkerContent(pmB2, config.playersB[1], isB2_Server ? 'SERVE' : (isB2_Receiver ? 'RECEIVE' : ''));

  pmA1.style.background = 'var(--team-a-color)';
  pmA2.style.background = 'var(--team-a-color)';
  pmB1.style.background = 'var(--team-b-color)';
  pmB2.style.background = 'var(--team-b-color)';

  pmA2.style.display = isDoubles ? 'flex' : 'none';
  pmB2.style.display = isDoubles ? 'flex' : 'none';

  document.querySelectorAll('.player-marker').forEach(m => {
    m.classList.remove('server', 'receiver');
  });

  if (serverTeam === 'A') {
    if (activeServerIdx === 0) pmA1.classList.add('server'); else pmA2.classList.add('server');
    if (isDeuceServe) pmB1.classList.add('receiver'); else pmB2.classList.add('receiver');
  } else {
    if (activeServerIdx === 0) pmB1.classList.add('server'); else pmB2.classList.add('server');
    if (isDeuceServe) pmA1.classList.add('receiver'); else pmA2.classList.add('receiver');
  }

  const setPos = (el, x, y) => {
    if (el) {
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
    }
  };

  const targetBox = document.getElementById('target-box');

  const placeTeamPlayers = (team, isLeft) => {
    const p1 = (team === 'A') ? pmA1 : pmB1;
    const p2 = (team === 'A') ? pmA2 : pmB2;
    const isServerTeam = (serverTeam === team);

    if (isLeft) {
      if (isServerTeam) {
        if (isDeuceServe) {
          if (activeServerIdx === 0) {
            setPos(p1, 10, 70);
            if (isDoubles) setPos(p2, 38, 30);
          } else {
            setPos(p2, 10, 70);
            if (isDoubles) setPos(p1, 38, 30);
          }
        } else {
          if (activeServerIdx === 0) {
            setPos(p1, 10, 30);
            if (isDoubles) setPos(p2, 38, 70);
          } else {
            setPos(p2, 10, 30);
            if (isDoubles) setPos(p1, 38, 70);
          }
        }
      } else {
        setPos(p1, 16, 70);
        if (isDoubles) setPos(p2, 16, 30);
      }
    } else {
      if (isServerTeam) {
        if (isDeuceServe) {
          if (activeServerIdx === 0) {
            setPos(p1, 90, 30);
            if (isDoubles) setPos(p2, 62, 70);
          } else {
            setPos(p2, 90, 30);
            if (isDoubles) setPos(p1, 62, 70);
          }
        } else {
          if (activeServerIdx === 0) {
            setPos(p1, 90, 70);
            if (isDoubles) setPos(p2, 62, 30);
          } else {
            setPos(p2, 90, 70);
            if (isDoubles) setPos(p1, 62, 30);
          }
        }
      } else {
        setPos(p1, 84, 30);
        if (isDoubles) setPos(p2, 84, 70);
      }
    }
  };

  placeTeamPlayers(leftTeam, true);
  placeTeamPlayers(rightTeam, false);

  const serverOnLeft = (serverTeam === leftTeam);
  if (serverOnLeft) {
    if (isDeuceServe) {
      setPos(targetBox, 50, 15);
    } else {
      setPos(targetBox, 50, 50);
    }
  } else {
    if (isDeuceServe) {
      setPos(targetBox, 25, 50);
    } else {
      setPos(targetBox, 25, 15);
    }
  }
}
