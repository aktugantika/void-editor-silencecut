// ─────────────────────────────────────────────────────────────────
// Void Editor — SilenceCut
// Author: Aktuğ Antika
// ─────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
var soundEnabled = localStorage.getItem('silencecut_sound') !== 'false';

let csInterface = new CSInterface();
let operating_system = getOS();
initFrontend();
init();

// Development mode: run the Python source directly instead of the bundled EXE.
// Eklentinin kurulu olduğu kök dizin
const EXTENSION_PATH = path.normalize(csInterface.getSystemPath(SystemPath.EXTENSION));

// Python script yolu
var PYTHON_SCRIPT = path.join(EXTENSION_PATH, "source", "VoidEditor.py");

/**
 * Kullanılabilir Python yolunu dinamik olarak tespit eder.
 */
function resolvePythonPath() {
  const isWin = process.platform === "win32" || operating_system === "WIN";

  // 1. Öncelik: Eklenti klasörünün içindeki sanal ortam (venv)
  const localVenvPython = isWin
    ? path.join(EXTENSION_PATH, "venv", "Scripts", "python.exe")
    : path.join(EXTENSION_PATH, "venv", "bin", "python");

  if (fs.existsSync(localVenvPython)) {
    return localVenvPython;
  }

  // 2. Öncelik: Eklenti klasörünün içinde gömülü (embedded) python klasörü
  const embeddedPython = path.join(EXTENSION_PATH, "source", "bin", "python", isWin ? "python.exe" : "python");
  if (fs.existsSync(embeddedPython)) {
    return embeddedPython;
  }

  // 3. Öncelik: Sistemdeki varsayılan Python (PATH ortam değişkeninden okur)
  return isWin ? "python" : "python3";
}

var PYTHON_PATH = resolvePythonPath();

async function init() {
  operating_system = await getOS();
}

// ─────────────────────────────────────────────────────────────────
// Run Jump Cut
// ─────────────────────────────────────────────────────────────────
async function runSilenceCut() {
  playSound('start');
  showOverlay();
  var isValid = await checkTimelineValidity();
  if (isValid !== "true") {
    hideOverlay();
    alert("Timeline invalid. Please check your edit mode and ensure clips exist on the required tracks.");
    return;
  }

  const mode = getEditMode();
  const checked = document.getElementById("backupBtn") ? document.getElementById("backupBtn").classList.contains("active") : false;

  if (mode === "all") {
    let clipInfos;
    try { clipInfos = JSON.parse(await asyncGetAllTracksClipInfo()); }
    catch(e) { alert("Could not get clip info: " + e); return; }
    if (!clipInfos || clipInfos.length === 0) { alert("Hiç clip bulunamadı."); return; }

    const baseParams = JSON.parse(getJumpcutParams());
    const allSilences = [];
    for (var ci = 0; ci < clipInfos.length; ci++) {
      const info = clipInfos[ci];
      const params = JSON.stringify({ silenceCutoff: baseParams.silenceCutoff, removeOver: baseParams.removeOver, keepOver: baseParams.keepOver, padding: baseParams.padding, "in": info["in"], "out": info["out"], "start": info.start });
      try {
        const data = JSON.parse(await asyncCallPythonJumpcut(PYTHON_PATH, info.path, params));
        if (data.silences && data.silences.length > 0) allSilences.push(data.silences.slice(0, -1));
      } catch(e) { console.warn("Clip analiz hatası: " + e); }
    }
    const merged = mergeSilences(allSilences);
    if (merged.length === 0) { alert("Sessizlik Algılanmadı."); return; }
    try { await runPremiereSilenceCut(JSON.stringify(merged.concat([0])), checked); playSound('done'); }
    catch(e) { alert("Failure executing jump cuts in Premiere: " + e); }
    finally { hideOverlay(); }

  } else if (mode === "audio") {
    let clipInfos;
    try { clipInfos = JSON.parse(await asyncGetAllAudioClipInfo()); }
    catch(e) { alert("Could not get audio clip info: " + e); return; }
    if (!clipInfos || clipInfos.length === 0) { alert("Hiç ses clip'i bulunamadı."); return; }

    const baseParams = JSON.parse(getJumpcutParams());
    const allSilences = [];
    for (var ci = 0; ci < clipInfos.length; ci++) {
      const info = clipInfos[ci];
      const params = JSON.stringify({ silenceCutoff: baseParams.silenceCutoff, removeOver: baseParams.removeOver, keepOver: baseParams.keepOver, padding: baseParams.padding, "in": info["in"], "out": info["out"], "start": info.start });
      try {
        const data = JSON.parse(await asyncCallPythonJumpcut(PYTHON_PATH, info.path, params));
        if (data.silences && data.silences.length > 0) allSilences.push(data.silences.slice(0, -1));
      } catch(e) { console.warn("Audio clip analiz hatası: " + e); }
    }
    const merged = mergeSilences(allSilences);
    if (merged.length === 0) { alert("Sessizlik Algılanmadı."); return; }
    try { await runPremiereSilenceCut(JSON.stringify(merged.concat([0])), checked); playSound('done'); }
    catch(e) { alert("Failure executing jump cuts in Premiere: " + e); }
    finally { hideOverlay(); }

  } else {
    let mediaPath = await asyncGetMediaPath();
    let silencecutParams = getJumpcutParams();
    let inoutpoints = JSON.parse(await asyncGetInOutStartPoints());
    silencecutParams = JSON.parse(silencecutParams);
    silencecutParams["in"] = inoutpoints["in"];
    silencecutParams["out"] = inoutpoints["out"];
    silencecutParams["start"] = inoutpoints["start"];
    silencecutParams = JSON.stringify(silencecutParams);
    let silencecutData = "";
      try { silencecutData = await asyncCallPythonJumpcut(PYTHON_PATH, mediaPath, silencecutParams); }
    catch (error) { alert("Failure executing Python script: " + error); return; }
    let dataJSON = "";
    try { dataJSON = JSON.parse(silencecutData); }
    catch (error) { alert(error); return; }
    if (dataJSON['silences'].length === 0) { alert("Sessizlik Algılanmadı."); return; }
    try { await runPremiereSilenceCut(JSON.stringify(dataJSON['silences']), checked); playSound('done'); }
    catch (error) { alert("Failure executing jump cuts in Premiere." + error); }
    finally { hideOverlay(); }
  }
}

// ─────────────────────────────────────────────────────────────────
// Generate Preview
// ─────────────────────────────────────────────────────────────────
async function runGeneratePreview() {
  const btnGenerate       = document.getElementById("btn-generate-preview");
  const btnClear          = document.getElementById("btn-clear-preview");
  const statsEl           = document.getElementById("preview-stats");
  const listContainer     = document.getElementById("preview-list-container");
  const listEl            = document.getElementById("preview-list");
  const waveformContainer = document.getElementById("waveform-container");

  btnGenerate.disabled = true;
  btnClear.disabled    = true;
  statsEl.classList.add("hidden");
  listContainer.classList.add("hidden");
  listEl.innerHTML = "";
  if (waveformContainer) waveformContainer.classList.add("hidden");
  setPreviewStatus("⏳ Analysing, please wait…", "loading");

  try {
    const isValid = await checkTimelineValidity();
    if (isValid !== "true") {
      setPreviewStatus("❌ Timeline invalid. Check edit mode and track clips.", "error");
      btnGenerate.disabled = false;
      return;
    }

    const mode = getEditMode();
    let segments = [];
    let totalSilenceOverride = null;
    let totalDurationOverride = null;
    let clipStartForMarkers = 0;

    // Çoklu clip analizi için yardımcı fonksiyon
    async function analyzeClips(clipInfos) {
      const baseParams = JSON.parse(getJumpcutParams());
      const allSilences = [], allWaveformDatas = [];
      let totalDur = 0;
      for (var ci = 0; ci < clipInfos.length; ci++) {
        const info = clipInfos[ci];
        const params = JSON.stringify({ silenceCutoff: baseParams.silenceCutoff, removeOver: baseParams.removeOver, keepOver: baseParams.keepOver, padding: baseParams.padding, "in": info["in"], "out": info["out"], "start": info.start, preview: true });
        try {
        const data = JSON.parse(await asyncCallPythonPreview(PYTHON_PATH, info.path, params));
          if (data.silences && data.silences.length > 0) allSilences.push(data.silences);
          if (data.total_duration) totalDur += data.total_duration;
          if (data.waveform && data.waveform.length > 0) {
            allWaveformDatas.push({ waveform: data.waveform, silence_mask: data.silence_mask || [], clip_length: data.clip_length || 0, clip_start_sec: data.clip_start_sec != null ? data.clip_start_sec : info.start });
          }
        } catch(e) { console.warn("Preview clip hatası: " + e); }
      }
      return { allSilences, allWaveformDatas, totalDur };
    }

    if (mode === "all") {
      let clipInfos;
      try { clipInfos = JSON.parse(await asyncGetAllTracksClipInfo()); }
      catch(e) { setPreviewStatus("❌ Could not get clip info: " + e, "error"); btnGenerate.disabled = false; return; }
      if (!clipInfos || clipInfos.length === 0) { setPreviewStatus("❌ Hiç clip bulunamadı.", "error"); btnGenerate.disabled = false; return; }

      const { allSilences, allWaveformDatas, totalDur } = await analyzeClips(clipInfos);
      segments = mergeSilences(allSilences);
      totalDurationOverride = totalDur;
      totalSilenceOverride  = segments.reduce(function(a,s){ return a+(s[1]-s[0]); }, 0);
      clipStartForMarkers   = 0;
      if (allWaveformDatas.length > 0 && totalDur > 0 && waveformContainer) {
        const mwf = mergeWaveforms(allWaveformDatas, totalDur, 2000);
        if (mwf) { initWaveform(mwf.waveform, segments, totalDur, 0, mwf.silenceMask); waveformContainer.classList.remove("hidden"); }
      }

    } else if (mode === "audio") {
      let clipInfos;
      try { clipInfos = JSON.parse(await asyncGetAllAudioClipInfo()); }
      catch(e) { setPreviewStatus("❌ Could not get audio clip info: " + e, "error"); btnGenerate.disabled = false; return; }
      if (!clipInfos || clipInfos.length === 0) { setPreviewStatus("❌ Hiç ses clip'i bulunamadı.", "error"); btnGenerate.disabled = false; return; }

      const { allSilences, allWaveformDatas, totalDur } = await analyzeClips(clipInfos);
      segments = mergeSilences(allSilences);
      totalDurationOverride = totalDur;
      totalSilenceOverride  = segments.reduce(function(a,s){ return a+(s[1]-s[0]); }, 0);
      clipStartForMarkers   = 0;
      if (allWaveformDatas.length > 0 && totalDur > 0 && waveformContainer) {
        const mwf = mergeWaveforms(allWaveformDatas, totalDur, 2000);
        if (mwf) { initWaveform(mwf.waveform, segments, totalDur, 0, mwf.silenceMask); waveformContainer.classList.remove("hidden"); }
      }

    } else {
      const mediaPath = await asyncGetMediaPath();
      const inout = JSON.parse(await asyncGetInOutStartPoints());
      const silencecutParamsRaw = JSON.parse(getJumpcutParams());
      const previewParams = JSON.stringify({ silenceCutoff: silencecutParamsRaw.silenceCutoff, removeOver: silencecutParamsRaw.removeOver, keepOver: silencecutParamsRaw.keepOver, padding: silencecutParamsRaw.padding, "in": inout["in"], "out": inout["out"], "start": inout["start"], preview: true });
      const rawOutput = await asyncCallPythonPreview(PYTHON_PATH, mediaPath, previewParams);
      let data;
      try { data = JSON.parse(rawOutput); }
      catch(e) { setPreviewStatus("❌ Could not parse Python output: " + rawOutput.substring(0, 100), "error"); btnGenerate.disabled = false; return; }
      if (data.error) { setPreviewStatus("❌ " + data.error, "error"); btnGenerate.disabled = false; return; }
      segments = data.silences || [];
      totalSilenceOverride  = data.total_silence;
      totalDurationOverride = data.total_duration || (inout["out"] - inout["in"]);
      clipStartForMarkers   = inout["start"];
      if (data.waveform && data.waveform.length > 0 && waveformContainer) {
        initWaveform(data.waveform, segments, data.clip_length, data.clip_start_sec || 0, data.silence_mask || []);
        waveformContainer.classList.remove("hidden");
      }
    }

    if (segments.length === 0) {
      setPreviewStatus("ℹ️ No silent regions found. Adjust threshold or duration.", "loading");
      btnGenerate.disabled = false;
      return;
    }

    // Marker ekle
    const segmentsStr = JSON.stringify(segments);
    const clipStart   = clipStartForMarkers;

    await new Promise((resolve, reject) => {
      const escapedSegments = JSON.stringify(segmentsStr).replace(/\\/g, "\\\\");
      const markerScript = "addPreviewMarkers(" + escapedSegments + ", 0)";
      csInterface.evalScript(
        markerScript,
        (result) => {
          try {
            const r = JSON.parse(result);
            if (r.error) reject(r.error);
            else resolve(r);
          } catch(e) { reject("Marker parse error: " + result); }
        }
      );
    });

    // İstatistikler
    const totalSilence  = totalSilenceOverride  != null ? totalSilenceOverride  : segments.reduce((a, s) => a + (s[1]-s[0]), 0);
    const totalDuration = totalDurationOverride != null ? totalDurationOverride : 0;
    const pct = totalDuration > 0 ? ((totalSilence / totalDuration) * 100).toFixed(1) : "0.0";

    document.getElementById("stat-cut-count").textContent     = segments.length;
    document.getElementById("stat-total-silence").textContent = totalSilence.toFixed(1) + "s";
    document.getElementById("stat-save-pct").textContent      = "%" + pct;
    statsEl.classList.remove("hidden");

    // Segment listesi
    document.getElementById("list-count").textContent = segments.length;
    segments.forEach(function(seg, i) {
      const item = document.createElement("div");
      item.className = "segment-item";
      item.innerHTML =
        '<span class="segment-index">#' + (i + 1) + '</span>' +
        '<span class="segment-time">' + formatTime(seg[0]) + ' → ' + formatTime(seg[1]) + '</span>' +
        '<span class="segment-dur">' + (seg[1] - seg[0]).toFixed(2) + 's</span>';
      listEl.appendChild(item);
    });
    listContainer.classList.remove("hidden");

    setPreviewStatus("✓ " + segments.length + " silent regions detected.", "success");
    btnClear.disabled = false;

  } catch(err) {
    setPreviewStatus("❌ Error: " + err, "error");
  }

  btnGenerate.disabled = false;
}

// ─────────────────────────────────────────────────────────────────
// Waveform — Zoom & Pan destekli
// ─────────────────────────────────────────────────────────────────

// Global waveform state
var wfState = {
  waveform:    [],
  segments:    [],
  silenceMask: [],
  clipLength:  0,
  clipStart:   0,
  zoom:       1.0,    // 1x = tamamı görünür, max 20x
  panOffset:  0,      // 0..1 arasında (sol kenar pozisyonu)
  isDragging: false,
  dragStartX: 0,
  dragStartPan: 0
};

function initWaveform(waveform, segments, clipLength, clipStart, silenceMask) {
  wfState.waveform    = waveform;
  wfState.segments    = segments;
  wfState.silenceMask = silenceMask || [];
  wfState.clipLength  = clipLength;
  wfState.clipStart   = clipStart;
  wfState.zoom       = 1.0;
  wfState.panOffset  = 0;

  const canvas = document.getElementById("waveform-canvas");
  if (!canvas) return;

  // Event listener'ları bir kez ekle
  if (!canvas._wfInitialized) {
    canvas._wfInitialized = true;

    // Mouse wheel → zoom
    canvas.addEventListener("wheel", function(e) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const oldZoom = wfState.zoom;
      wfState.zoom = Math.max(1.0, Math.min(50, wfState.zoom * zoomFactor));

      // Zoom yaparken mouse pozisyonunu merkez al
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rect.width; // 0..1
      const mouseTime = wfState.panOffset + mouseX / oldZoom;
      wfState.panOffset = mouseTime - mouseX / wfState.zoom;
      clampPan();
      renderWaveform();
    }, { passive: false });

    // Mouse drag → pan
    canvas.addEventListener("mousedown", function(e) {
      wfState.isDragging   = true;
      wfState.dragStartX   = e.clientX;
      wfState.dragStartPan = wfState.panOffset;
      canvas.style.cursor  = "grabbing";
    });

    document.addEventListener("mousemove", function(e) {
      if (!wfState.isDragging) return;
      const canvas = document.getElementById("waveform-canvas");
      if (!canvas) return;
      const rect   = canvas.getBoundingClientRect();
      const dx     = (e.clientX - wfState.dragStartX) / rect.width;
      wfState.panOffset = wfState.dragStartPan - dx / wfState.zoom;
      clampPan();
      renderWaveform();
    });

    document.addEventListener("mouseup", function() {
      if (wfState.isDragging) {
        wfState.isDragging = false;
        const canvas = document.getElementById("waveform-canvas");
        if (canvas) canvas.style.cursor = "grab";
      }
    });

    // Çift tıklama → reset zoom
    canvas.addEventListener("dblclick", function() {
      wfState.zoom      = 1.0;
      wfState.panOffset = 0;
      renderWaveform();
    });

    canvas.style.cursor = "grab";
  }

  renderWaveform();
}

function clampPan() {
  const maxPan = 1 - 1 / wfState.zoom;
  wfState.panOffset = Math.max(0, Math.min(maxPan, wfState.panOffset));
}

function renderWaveform() {
  const canvas = document.getElementById("waveform-canvas");
  if (!canvas) return;

  const ctx        = canvas.getContext("2d");
  const W          = canvas.width;
  const H          = canvas.height;
  const midY       = H / 2;
  const waveform   = wfState.waveform;
  const segments   = wfState.segments;
  const clipLength = wfState.clipLength;
  const clipStart  = wfState.clipStart;
  const zoom       = wfState.zoom;
  const panOffset  = wfState.panOffset; // 0..1

  ctx.clearRect(0, 0, W, H);

  // Arkaplan
  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, W, H);

  // Görünür zaman aralığı
  const visStart = panOffset;              // 0..1 oranında
  const visEnd   = panOffset + 1 / zoom;  // 0..1 oranında

  // Hangi bar'lar görünür pencerede?
  const startBar = Math.floor(visStart * waveform.length);
  const endBar   = Math.ceil(visEnd   * waveform.length);
  const barW     = W / (endBar - startBar);

  function isInSilence(barIndex) {
    if (wfState.silenceMask && wfState.silenceMask.length > barIndex) {
      return wfState.silenceMask[barIndex] === true;
    }
    const t = clipStart + (barIndex / waveform.length) * clipLength;
    for (let i = 0; i < segments.length; i++) {
      if (t >= segments[i][0] && t <= segments[i][1]) return true;
    }
    return false;
  }

  for (let i = startBar; i < endBar && i < waveform.length; i++) {
    const amp    = waveform[i];
    const barH   = Math.max(2, amp * (H * 0.85));
    const x      = (i - startBar) * barW;
    const silent = isInSilence(i);

    if (silent) {
      ctx.fillStyle = "rgba(220, 60, 60, 0.85)";
    } else {
      const intensity = 0.4 + amp * 0.6;
      ctx.fillStyle = `rgba(60, 180, 80, ${intensity})`;
    }

    ctx.fillRect(x, midY - barH / 2, Math.max(1, barW - 0.5), barH);
  }

  // Orta çizgi
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();

  // Zoom > 1 ise scroll indicator çiz (alt bar)
  if (zoom > 1.001) {
    const indH  = 3;
    const indY  = H - indH;
    const indX  = panOffset * W;
    const indW  = W / zoom;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, indY, W, indH);

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(indX, indY, indW, indH, 1);
    ctx.fill();

    // Zoom seviyesi etiketi
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px 'DM Mono', monospace";
    ctx.fillText(zoom.toFixed(1) + "x", 6, H - 7);
  }
}

// ─────────────────────────────────────────────────────────────────
// Marker temizle
// ─────────────────────────────────────────────────────────────────
async function runClearPreviewMarkers() {
  const btnClear          = document.getElementById("btn-clear-preview");
  const statsEl           = document.getElementById("preview-stats");
  const listContainer     = document.getElementById("preview-list-container");
  const waveformContainer = document.getElementById("waveform-container");

  btnClear.disabled = true;
  setPreviewStatus("⏳ Clearing markers…", "loading");

  await new Promise((resolve) => {
    csInterface.evalScript("clearPreviewMarkers()", (result) => {
      try {
        const r = JSON.parse(result);
        if (r.success) {
          setPreviewStatus("✓ " + (r.removed || 0) + " markers cleared.", "success");
        } else {
          setPreviewStatus("❌ Clear failed.", "error");
          btnClear.disabled = false;
        }
      } catch(e) {
        setPreviewStatus("❌ Response error.", "error");
        btnClear.disabled = false;
      }
      resolve();
    });
  });

  statsEl.classList.add("hidden");
  listContainer.classList.add("hidden");
  document.getElementById("preview-list").innerHTML = "";
  if (waveformContainer) waveformContainer.classList.add("hidden");
}

// ─────────────────────────────────────────────────────────────────
// Python preview runner
// ─────────────────────────────────────────────────────────────────
async function asyncCallPythonPreview(python_path, media_path, previewParams) {
  return new Promise((resolve, reject) => {
    python_path = path.normalize(python_path);
    media_path = path.normalize(media_path);
    const cwd = path.dirname(PYTHON_SCRIPT);

    let command_prompt;
    try {
      command_prompt = child_process.spawn(python_path, [PYTHON_SCRIPT, media_path, previewParams], { cwd, windowsHide: true });
    } catch(error) {
      reject(error);
      return;
    }

    let outputData = "";
    let errorData = "";
    let settled = false;
    command_prompt.stdout.on('data', (data) => { outputData += data.toString(); });
    command_prompt.stderr.on('data', (data) => { errorData += data.toString(); });
    command_prompt.on('error', (error) => {
      if (!settled) { settled = true; reject(error); }
    });
    command_prompt.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(outputData);
      else reject(errorData.trim() || `Process exited with code ${code}`);
    });
  });
}

function setPreviewStatus(msg, type) {
  const el = document.getElementById("preview-status");
  if (!el) return;
  el.textContent = msg;
  el.className   = "preview-status " + type;
  el.classList.remove("hidden");
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  let s = (seconds % 60).toFixed(2);
  if (parseFloat(s) < 10) s = "0" + s;
  return m + ":" + s;
}

// ─────────────────────────────────────────────────────────────────
// Mevcut fonksiyonlar
// ─────────────────────────────────────────────────────────────────
async function runPremiereSilenceCut(silences, backup) {
  const mode = getEditMode();
  return new Promise((resolve, reject) => {
    csInterface.evalScript(`silenceCutWithMode("${silences}", "${backup}", "${mode}")`, (result) => {
      if (result) resolve(result);
      else reject("Error executing jump cuts.");
    });
  });
}

async function asyncGetMediaPath() {
  const mode = getEditMode();
  const script = (mode === "audio") ? "getMediaPathAudio()" : "getMediaPath()";
  return new Promise((resolve, reject) => {
    csInterface.evalScript(script, (result) => {
      if (result) resolve(result);
      else reject("Error getting media path.");
    });
  });
}

async function checkTimelineValidity() {
  const mode = getEditMode();
  let script = "checkOneLinkedClipPair()";
  if (mode === "track") script = "checkTrackBasedValidity()";
  if (mode === "audio") script = "checkAudioOnlyValidity()";
  if (mode === "all")   script = "checkAllTracksValidity()";

  return new Promise((resolve, reject) => {
    csInterface.evalScript(script, (result) => {
      resolve(result);
    });
  });
}

async function asyncGetInOutStartPoints() {
  const mode = getEditMode();
  const script = (mode === "track") ? "getInOutStartPointsAudio()" : "getInOutStartPoints()";
  return new Promise((resolve, reject) => {
    csInterface.evalScript(script, (result) => {
      if (result) resolve(result);
      else reject("Error getting in and out points.");
    });
  });
}

// All Tracks: tüm clip bilgilerini al
async function asyncGetAllTracksClipInfo() {
  return new Promise((resolve, reject) => {
    csInterface.evalScript("getAllTracksClipInfo()", (result) => {
      if (result && result.indexOf("EvalScript error") !== 0) {
        try {
          const parsed = JSON.parse(result);
          if (parsed && parsed.error) reject(parsed.error);
          else resolve(result);
        } catch (e) { reject("Invalid clip info response: " + result); }
      }
      else reject("Error getting all tracks clip info.");
    });
  });
}

// Audio Only: tüm audio clip bilgilerini al
async function asyncGetAllAudioClipInfo() {
  return new Promise((resolve, reject) => {
    csInterface.evalScript("getAllAudioClipInfo()", (result) => {
      if (result && result.indexOf("EvalScript error") !== 0) {
        try {
          const parsed = JSON.parse(result);
          if (parsed && parsed.error) reject(parsed.error);
          else resolve(result);
        } catch (e) { reject("Invalid audio clip info response: " + result); }
      }
      else reject("Error getting audio clip info.");
    });
  });
}

// Sessizlik listelerini birleştir ve merge et
function mergeSilences(allSilences) {
  var flat = [];
  for (var i = 0; i < allSilences.length; i++) flat = flat.concat(allSilences[i]);
  if (flat.length === 0) return [];
  flat.sort(function(a, b) { return a[0] - b[0]; });
  var merged = [flat[0].slice()];
  for (var i = 1; i < flat.length; i++) {
    var last = merged[merged.length - 1];
    if (flat[i][0] <= last[1] + 0.05) { if (flat[i][1] > last[1]) last[1] = flat[i][1]; }
    else merged.push(flat[i].slice());
  }
  return merged;
}

// Birden fazla clip'in waveform verilerini timeline pozisyonlarına göre birleştir
function mergeWaveforms(clipDatas, totalDuration, targetBars) {
  if (!clipDatas || clipDatas.length === 0 || totalDuration <= 0) return null;
  const waveform    = new Array(targetBars).fill(0);
  const silenceMask = new Array(targetBars).fill(false);
  for (var ci = 0; ci < clipDatas.length; ci++) {
    const cd = clipDatas[ci];
    if (!cd.waveform || cd.waveform.length === 0 || (cd.clip_length || 0) <= 0) continue;
    const clipStart = cd.clip_start_sec || 0;
    const barStart  = Math.floor((clipStart / totalDuration) * targetBars);
    const barEnd    = Math.ceil(((clipStart + cd.clip_length) / totalDuration) * targetBars);
    for (var b = barStart; b < barEnd && b < targetBars; b++) {
      const idx = Math.min(Math.floor(((b - barStart) / Math.max(1, barEnd - barStart)) * cd.waveform.length), cd.waveform.length - 1);
      waveform[b]    = cd.waveform[idx];
      silenceMask[b] = cd.silence_mask ? (cd.silence_mask[idx] === true) : false;
    }
  }
  return { waveform, silenceMask };
}

async function asyncCallPythonJumpcut(python_path, media_path, silencecutParams) {
  return new Promise((resolve, reject) => {
    python_path = path.normalize(python_path);
    media_path = path.normalize(media_path);
    let cwd = path.dirname(PYTHON_SCRIPT);

    let command_prompt;
    try {
      command_prompt = child_process.spawn(python_path, [PYTHON_SCRIPT, media_path, silencecutParams], { cwd, windowsHide: true });
    } catch (error) {
      reject(error);
      return;
    }

    let outputData = "";
    let errorData = "";
    let settled = false;
    command_prompt.stdout.on('data', (data) => { outputData += data.toString(); });
    command_prompt.stderr.on('data', (data) => { errorData += data.toString(); });
    command_prompt.on('error', (error) => {
      if (!settled) { settled = true; reject(error); }
    });
    command_prompt.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve(outputData);
      else reject(errorData.trim() || `Process exited with code ${code}`);
    });
  });
}

async function getOS() {
  let os = null;
  if (navigator.userAgentData) {
    const brands = await navigator.userAgentData.getHighEntropyValues(["platform"]);
    if (brands.platform.includes('macOS')) os = "MAC";
    else if (brands.platform.includes('Windows')) os = "WIN";
  } else {
    var platform = window.navigator.platform;
    if (['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'].indexOf(platform) != -1) os = "MAC";
    else if (['Win32', 'Win64', 'Windows', 'WinCE'].indexOf(platform) != -1) os = "WIN";
  }
  return os;
}

function initFrontend() {
  document.addEventListener('DOMContentLoaded', () => {
    let sliderIds = ['silenceCutoff', 'removeOver', 'keepOver', 'padding'];
    sliderIds.forEach(function(id) {
      let slider = document.getElementById(id);
      let numberInput = slider.nextElementSibling;

      let saved = localStorage.getItem('silencecut_' + id);
      if (saved !== null) {
        slider.value = saved;
        numberInput.value = saved;
      }

      slider.oninput = function() {
        numberInput.value = slider.value;
        localStorage.setItem('silencecut_' + id, slider.value);
      };

      numberInput.oninput = function() {
        slider.value = numberInput.value;
        localStorage.setItem('silencecut_' + id, numberInput.value);
      };
    });
  });
}

function getJumpcutParams() {
  let sliderIds = ['silenceCutoff', 'removeOver', 'keepOver', 'padding'];
  let silencecutParams = {};
  sliderIds.forEach(function(id) {
    let slider = document.getElementById(id);
    let numberInput = slider.nextElementSibling;
    silencecutParams[id] = numberInput.value;
  });
  return JSON.stringify(silencecutParams);
}
function playSound(type) {
  if (!soundEnabled) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  
  if (type === 'start') {
    // Kısa, yukarı giden iki ton — "başlıyor"
    [440, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.15);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.15);
    });

    } else if (type === 'done') {
    // Üç ton yukarı çıkış — "tamamlandı"
    [440, 550, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.2);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.2);
    });
    setTimeout(function() {
      csInterface.evalScript("clearPreviewMarkers()");
      var modal = document.getElementById('support-modal');
      if (modal) modal.classList.remove('hidden');
    }, 800);
  }
}

// ─────────────────────────────────────────────────────────────────
// Preset sistemi
// ─────────────────────────────────────────────────────────────────

const PRESETS = {
  podcast: {
    silenceCutoff: -40,
    removeOver:    0.8,
    keepOver:      0.3,
    padding:       0.15
  },
  interview: {
    silenceCutoff: -45,
    removeOver:    0.6,
    keepOver:      0.2,
    padding:       0.2
  },
  lecture: {
    silenceCutoff: -35,
    removeOver:    0.4,
    keepOver:      0.1,
    padding:       0.1
  },
  vlog: {
    silenceCutoff: -50,
    removeOver:    0.3,
    keepOver:      0.15,
    padding:       0.08
  }
};

function applyPreset(presetName) {
  if (!presetName || !PRESETS[presetName]) return;

  const preset = PRESETS[presetName];

  ['silenceCutoff', 'removeOver', 'keepOver', 'padding'].forEach(function(key) {
    const slider      = document.getElementById(key);
    const numberInput = slider ? slider.nextElementSibling : null;
    if (!slider) return;

    slider.value      = preset[key];
    if (numberInput) numberInput.value = preset[key];
    localStorage.setItem('silencecut_' + key, preset[key]);
  });

  localStorage.setItem('silencecut_preset', presetName);
}

// Sayfa yüklenince son preset'i geri yükle
document.addEventListener('DOMContentLoaded', function() {
  const savedPreset = localStorage.getItem('silencecut_preset');
  if (savedPreset) {
    const select = document.getElementById('preset-select');
    if (select) select.value = savedPreset;
  }

  // Slider değişince preset'i "Custom"a sıfırla
  ['silenceCutoff', 'removeOver', 'keepOver', 'padding'].forEach(function(id) {
    const slider      = document.getElementById(id);
    const numberInput = slider ? slider.nextElementSibling : null;
    if (!slider) return;

    function resetPreset() {
      const select = document.getElementById('preset-select');
      if (select && select.value !== '') {
        select.value = '';
        localStorage.removeItem('silencecut_preset');
      }
    }

    slider.addEventListener('input', resetPreset);
    if (numberInput) numberInput.addEventListener('input', resetPreset);
  });
});

// ─────────────────────────────────────────────────────────────────
// Edit Mode
// ─────────────────────────────────────────────────────────────────
function getEditMode() {
  const select = document.getElementById('edit-mode-select');
  return select ? select.value : 'linked';
}

function saveEditMode(value) {
  localStorage.setItem('silencecut_edit_mode', value);
}

document.addEventListener('DOMContentLoaded', function() {
  const saved = localStorage.getItem('silencecut_edit_mode');
  if (saved) {
    const select = document.getElementById('edit-mode-select');
    if (select) select.value = saved;
  }
});

// ─────────────────────────────────────────────────────────────────
// Auto Detect Threshold
// ─────────────────────────────────────────────────────────────────
async function runAutoDetect() {
  const btn = document.getElementById("btn-auto-detect");
  if (!btn) return;

  btn.disabled    = true;
  btn.textContent = "…";

  try {
    const isValid = await checkTimelineValidity();
    if (isValid !== "true") {
      alert("Timeline invalid. Single linked clip required on V1/A1.");
      btn.disabled    = false;
      btn.textContent = "⚡";
      return;
    }

    const mediaPath = await asyncGetMediaPath();
    const inoutRaw  = await asyncGetInOutStartPoints();
    const inout     = JSON.parse(inoutRaw);

    const params = JSON.stringify({
      silenceCutoff: -40,
      removeOver:    0.5,
      keepOver:      0.3,
      padding:       0.2,
      "in":          inout["in"],
      "out":         inout["out"],
      "start":       inout["start"],
      auto_detect:   true
    });

    const rawOutput = await asyncCallPythonPreview(PYTHON_PATH, mediaPath, params);

    let data;
    try {
      data = JSON.parse(rawOutput);
    } catch(e) {
      alert("Auto detect failed: could not parse output.");
      btn.disabled    = false;
      btn.textContent = "⚡";
      return;
    }

    if (data.suggested_threshold != null) {
      const val    = data.suggested_threshold;
      const slider = document.getElementById("silenceCutoff");
      const input  = slider ? slider.nextElementSibling : null;

      if (slider) slider.value = val;
      if (input)  input.value  = val;
      localStorage.setItem('silencecut_silenceCutoff', val);

      const select = document.getElementById('preset-select');
      if (select) { select.value = ''; localStorage.removeItem('silencecut_preset'); }

      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "⚡"; }, 2000);
    } else {
      alert("Auto detect failed.");
      btn.textContent = "⚡";
    }

  } catch(err) {
    alert("Auto detect error: " + err);
    btn.textContent = "⚡";
  }

  btn.disabled = false;
}

// ─────────────────────────────────────────────────────────────────
// Sound toggle
// ─────────────────────────────────────────────────────────────────
function toggleSound(enabled) {
  soundEnabled = enabled;
  localStorage.setItem('silencecut_sound', enabled ? 'true' : 'false');
}

document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('toggle-sound');
  if (toggle) toggle.checked = soundEnabled;
});

// ─────────────────────────────────────────────────────────────────
// Processing overlay
// ─────────────────────────────────────────────────────────────────
function showOverlay() {
  const el = document.getElementById("processing-overlay");
  if (el) el.classList.remove("hidden");
}
function hideOverlay() {
  const el = document.getElementById("processing-overlay");
  if (el) el.classList.add("hidden");
}

// ─────────────────────────────────────────────────────────────────
// Backup toggle
// ─────────────────────────────────────────────────────────────────
function toggleBackup() {
  const btn = document.getElementById("backupBtn");
  if (!btn) return;
  const isActive = btn.classList.toggle("active");
  btn.setAttribute("aria-pressed", isActive);
}

// ─────────────────────────────────────────────────────────────────
// Menu init
// ─────────────────────────────────────────────────────────────────
function initMenu() {
  document.querySelectorAll('.menu-item').forEach(function(item) {
    item.querySelector('.menu-label').addEventListener('click', function(e) {
      e.stopPropagation();
      const dropdown = item.querySelector('.menu-dropdown');
      const isOpen   = dropdown.style.display === 'block';
      document.querySelectorAll('.menu-dropdown').forEach(function(d) { d.style.display = 'none'; });
      dropdown.style.display = isOpen ? 'none' : 'block';
    });
  });

  document.addEventListener('click', function() {
    document.querySelectorAll('.menu-dropdown').forEach(function(d) { d.style.display = 'none'; });
  });

  document.querySelectorAll('.menu-dropdown').forEach(function(d) {
    d.addEventListener('click', function(e) { e.stopPropagation(); });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMenu);
} else {
  initMenu();
}

function openLink(url) {
    if (typeof cep !== 'undefined' && cep.util) {
        cep.util.openURLInDefaultBrowser(url);
    } else {
        require('child_process').exec('start ' + url);
    }
}

function restoreDefaults() {
    localStorage.clear();
    location.reload();
}

// ─────────────────────────────────────────────────────────────────
// Custom Preset Save / Delete / Load
// ─────────────────────────────────────────────────────────────────
function getCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem('silencecut_custom_presets') || '{}');
  } catch(e) {
    return {};
  }
}

function saveCustomPresets(presets) {
  localStorage.setItem('silencecut_custom_presets', JSON.stringify(presets));
}

function saveCustomPreset() {
  var name = prompt('Preset name:');
  if (!name || !name.trim()) return;
  name = name.trim();

  var key = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  var presets = getCustomPresets();

  presets[key] = {
    label: name,
    silenceCutoff: parseFloat(document.getElementById('silenceCutoff').value),
    removeOver:    parseFloat(document.getElementById('removeOver').value),
    keepOver:      parseFloat(document.getElementById('keepOver').value),
    padding:       parseFloat(document.getElementById('padding').value)
  };

  saveCustomPresets(presets);
  rebuildPresetDropdown();

  var select = document.getElementById('preset-select');
  if (select) select.value = key;
  localStorage.setItem('silencecut_preset', key);
  updateDeleteButton();
}

function deleteCustomPreset() {
  var select = document.getElementById('preset-select');
  if (!select) return;
  var key = select.value;
  if (!key.startsWith('custom_')) return;

  var presets = getCustomPresets();
  var label = presets[key] ? presets[key].label : key;
  if (!confirm('Delete preset "' + label + '"?')) return;

  delete presets[key];
  saveCustomPresets(presets);
  rebuildPresetDropdown();
  select.value = '';
  localStorage.removeItem('silencecut_preset');
  updateDeleteButton();
}

function rebuildPresetDropdown() {
  var select = document.getElementById('preset-select');
  if (!select) return;

  select.innerHTML = '';

  var custom = document.createElement('option');
  custom.value = '';
  custom.textContent = '— Custom —';
  select.appendChild(custom);

  var builtIn = [
    { value: 'podcast',   label: '🎙 Podcast' },
    { value: 'interview', label: '📝 Interview' },
    { value: 'lecture',   label: '📕 Lecture' },
    { value: 'vlog',      label: '🎬 Vlog' }
  ];

  builtIn.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    select.appendChild(opt);
  });

  var presets = getCustomPresets();
  var keys = Object.keys(presets);
  if (keys.length > 0) {
    var sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '── Saved ──';
    select.appendChild(sep);

    keys.forEach(function(key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = '⭐ ' + presets[key].label;
      select.appendChild(opt);
    });
  }
}

function updateDeleteButton() {
  var select = document.getElementById('preset-select');
  var btn = document.getElementById('btn-delete-preset');
  if (!select || !btn) return;
  if (select.value.startsWith('custom_')) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

var _originalApplyPreset = applyPreset;
applyPreset = function(presetName) {
  if (presetName && presetName.startsWith('custom_')) {
    var presets = getCustomPresets();
    if (presets[presetName]) {
      var p = presets[presetName];
      ['silenceCutoff', 'removeOver', 'keepOver', 'padding'].forEach(function(key) {
        var slider = document.getElementById(key);
        var numberInput = slider ? slider.nextElementSibling : null;
        if (!slider) return;
        slider.value = p[key];
        if (numberInput) numberInput.value = p[key];
        localStorage.setItem('silencecut_' + key, p[key]);
      });
      localStorage.setItem('silencecut_preset', presetName);
    }
  } else {
    _originalApplyPreset(presetName);
  }
  updateDeleteButton();
};

document.addEventListener('DOMContentLoaded', function() {
  rebuildPresetDropdown();
  var saved = localStorage.getItem('silencecut_preset');
  if (saved) {
    var select = document.getElementById('preset-select');
    if (select) select.value = saved;
  }
  updateDeleteButton();
});