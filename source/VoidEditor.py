# ─────────────────────────────────────────────────────────────────
# Void Editor — SilenceCut
# Author: Aktuğ Antika
# ─────────────────────────────────────────────────────────────────
import argparse
import os
import json
import sys
import logging

# Kaynak veya PyInstaller modunda, eklentinin yanındaki bin klasörünü kullan.
_base = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    _base = os.path.dirname(sys.executable)

_ffmpeg = os.path.join(_base, 'bin', 'ffmpeg.exe')
_ffprobe = os.path.join(_base, 'bin', 'ffprobe.exe')

# pydub import edilirken de FFmpeg'i bulabilsin; CEP PATH'ine güvenme.
_bin_dir = os.path.join(_base, 'bin')
if os.path.isdir(_bin_dir):
    os.environ['PATH'] = _bin_dir + os.pathsep + os.environ.get('PATH', '')

from pydub import AudioSegment, silence

if os.path.exists(_ffmpeg):
    AudioSegment.converter = _ffmpeg
    AudioSegment.ffmpeg = _ffmpeg
    AudioSegment.ffprobe = _ffprobe

log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s (Line: %(lineno)d)'
logging.basicConfig(filename='silencecut.log', format=log_format)
logging.getLogger().setLevel(logging.DEBUG)

logging.debug("Running Python executable.")
logging.debug("Python executable: %s", sys.executable)
logging.debug("FFmpeg path: %s (exists=%s)", _ffmpeg, os.path.exists(_ffmpeg))
logging.debug("FFprobe path: %s (exists=%s)", _ffprobe, os.path.exists(_ffprobe))

parser = argparse.ArgumentParser()
parser.add_argument("path")
parser.add_argument("silencecutparams", default=None)
args = parser.parse_args()
sys.stderr = open('debug.log', 'w')

silencecut_params = {
    'silenceCutoff': -80,
    'removeOver': 1000,
    'keepOver': 300,
    'padding': 500,
    'in': None,
    'out': None,
    'start': None,
    'preview': False
}

if args.silencecutparams:
    input = json.loads(args.silencecutparams)
    silencecut_params.update(input)

auto_detect_val = silencecut_params.pop('auto_detect', False)
IS_AUTO_DETECT = auto_detect_val == True or str(auto_detect_val).lower() == 'true'

preview_val = silencecut_params.pop('preview', False)
IS_PREVIEW = preview_val == True or preview_val == 'true' or str(preview_val).lower() == 'true'
print("IS_PREVIEW:", IS_PREVIEW, "preview_val:", preview_val, file=sys.stderr)
sys.stderr.flush()

silencecut_params = {k: float(v) * 1000 if v is not None else 0 for k, v in silencecut_params.items()}
silencecut_params['silenceCutoff'] = int(silencecut_params['silenceCutoff']) / 1000  # dB

THRESHOLD          = int(silencecut_params['silenceCutoff'])
PADDING            = int(silencecut_params['padding'])
MIN_SILENCE_LENGTH = int(silencecut_params['removeOver'])
KEEP_OVER          = int(silencecut_params['keepOver'])
INPOINT            = int(silencecut_params['in'])
OUTPOINT           = int(silencecut_params['out'])
START              = int(silencecut_params['start'])

SEEK_STEP = 50

file_extension = os.path.splitext(args.path)[1].replace('.', '')
FILE_PATH = args.path
FILE_TYPE = file_extension

try:
    audio = AudioSegment.from_file(FILE_PATH, FILE_TYPE)
    audio = audio[INPOINT:OUTPOINT]
    CLIP_LENGTH = len(audio)
except Exception as e:
    logging.debug(e)
    raise

silences = []
try:
    silences = silence.detect_silence(audio, min_silence_len=MIN_SILENCE_LENGTH, seek_step=SEEK_STEP, silence_thresh=THRESHOLD)
except Exception as e:
    logging.debug(e)
    raise

# Padding
to_remove = []
for i in range(len(silences)):
    if silences[i][0] > 0:
        silences[i][0] = silences[i][0] + PADDING
    if silences[i][1] < CLIP_LENGTH:
        silences[i][1] = silences[i][1] - PADDING
    if silences[i][1] <= silences[i][0]:
        to_remove.append(i)

silences = [s for idx, s in enumerate(silences) if idx not in to_remove]

# Keep over
cleaned_silences = []
for i in range(0, len(silences), 2):
    if i + 1 < len(silences):
        if silences[i+1][0] - silences[i][1] < KEEP_OVER:
            cleaned_silences.append([silences[i][0], silences[i+1][1]])
        else:
            cleaned_silences.append(silences[i])
            cleaned_silences.append(silences[i+1])
    else:
        cleaned_silences.append(silences[i])

silences = cleaned_silences

# Saniyeye cevir + START offset
silences_seconds = [[s[0]/1000 + START/1000, s[1]/1000 + START/1000] for s in silences]

# AUTO DETECT MODU
if IS_AUTO_DETECT:
    CHUNK_MS = 100
    rms_values = []
    for i in range(0, CLIP_LENGTH, CHUNK_MS):
        chunk = audio[i:i + CHUNK_MS]
        if len(chunk) > 0:
            rms_values.append(chunk.dBFS)

    valid_rms = [v for v in rms_values if v != float('-inf') and v > -100]

    if valid_rms:
        valid_rms.sort()
        noise_floor = valid_rms[int(len(valid_rms) * 0.20)]
        suggested = round(noise_floor + 6)
        suggested = max(-80, min(-10, suggested))
    else:
        suggested = -40

    print(json.dumps({"auto_detect": True, "suggested_threshold": suggested}))
    sys.exit(0)

# PREVIEW MODU
if IS_PREVIEW:
    WAVEFORM_SAMPLES = max(300, int(CLIP_LENGTH / 1000 * 30))
    chunk_size_ms = max(1, CLIP_LENGTH // WAVEFORM_SAMPLES)

    waveform     = []
    silence_mask = []

    for i in range(WAVEFORM_SAMPLES):
        start_ms = i * chunk_size_ms
        end_ms   = min(start_ms + chunk_size_ms, CLIP_LENGTH)
        chunk    = audio[start_ms:end_ms]
        waveform.append(chunk.rms)

        # Bu bar sessiz bir bolgede mi? (ms cinsinden silences ile karsilastir)
        is_silent = False
        for s in silences:
            if start_ms >= s[0] and start_ms < s[1]:
                is_silent = True
                break
        silence_mask.append(is_silent)

    max_rms = max(waveform) if max(waveform) > 0 else 1
    waveform_normalized = [round(v / max_rms, 4) for v in waveform]

    total_silence_ms = sum(s[1] - s[0] for s in silences)
    clip_length_sec  = CLIP_LENGTH / 1000.0

    preview_output = {
        "silences":       silences_seconds,
        "waveform":       waveform_normalized,
        "silence_mask":   silence_mask,
        "clip_length":    round(clip_length_sec, 3),
        "clip_start_sec": round(START / 1000.0, 4),
        "preview":        True,
        "cut_count":      len(silences_seconds),
        "total_silence":  round(total_silence_ms / 1000.0, 3),
        "total_duration": round(clip_length_sec, 3)
    }
    print(json.dumps(preview_output))
    sys.exit(0)

# NORMAL MOD
silences = silences_seconds

if silences[0][0] == START/1000:
    silences.append(1)
else:
    silences.append(0)

print(json.dumps({"silences": silences}))
