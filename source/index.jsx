// ─────────────────────────────────────────────────────────────────
// Void Editor — silencecut
// Author: Aktuğ Antika
// ─────────────────────────────────────────────────────────────────

// ExtendScript JSON Polyfill
if (typeof JSON !== 'object') { JSON = {}; }
(function () {
    'use strict';
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text) { return eval('(' + text + ')'); };
    }
    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (obj) {
            var t = typeof obj;
            if (t !== "object" || obj === null) {
                if (t === "string") obj = '"' + obj.replace(/(["\\])/g, '\\$1') + '"';
                return String(obj);
            } else {
                var n, v, json = [], arr = (obj && obj.constructor === Array);
                for (n in obj) {
                    v = obj[n]; t = typeof v;
                    if (t === "string") v = '"' + v.replace(/(["\\])/g, '\\$1') + '"';
                    else if (t === "object" && v !== null) v = JSON.stringify(v);
                    json.push((arr ? "" : '"' + n + '":') + String(v));
                }
                return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
            }
        };
    }
}());

function silenceCutActiveSequence(silences, backup) {
    silenceCutWithMode(silences, backup, "linked");
}

function silenceCutWithMode(silences, backup, editMode) {

    app.enableQE();

    silences = eval(silences);

    var cutStartflag = silences[silences.length - 1];
    silences.splice(silences.length - 1, 1);

    var MAKE_BACKUP = eval(backup);

    var SEQUENCE = app.project.activeSequence;
    var QE_SEQUENCE = qe.project.getActiveSequence();

    var VIDEO_TRACK = 0;
    var AUDIO_TRACK = 0;

    var time = new Time();

    if (MAKE_BACKUP) {
        SEQUENCE.clone();
    }


    try {
    	for (var i = 0; i < silences.length; i++) {
            silence_range = silences[i];
            for (var j = 0; j < silence_range.length; j++) {
            	var secs = silence_range[j];
           	var frameRate = SEQUENCE.getSettings().videoFrameRate.seconds;
            	var totalFrames = Math.round(secs / frameRate);
            	var fps = Math.round(1 / frameRate);
            	var ff = totalFrames % fps;
            	var ss = Math.floor(totalFrames / fps) % 60;
            	var mm = Math.floor(totalFrames / (fps * 60)) % 60;
            	var hh = Math.floor(totalFrames / (fps * 3600));
            	var timecode = (hh < 10 ? "0" + hh : hh) + ":" +
                               (mm < 10 ? "0" + mm : mm) + ":" +
                               (ss < 10 ? "0" + ss : ss) + ":" +
                               (ff < 10 ? "0" + ff : ff);

        if (editMode === "all") {
            for (var vt = 0; vt < SEQUENCE.videoTracks.numTracks; vt++) {
                try { QE_SEQUENCE.getVideoTrackAt(vt).razor(timecode); } catch(e) {}
            }
            for (var at = 0; at < SEQUENCE.audioTracks.numTracks; at++) {
                try { QE_SEQUENCE.getAudioTrackAt(at).razor(timecode); } catch(e) {}
            }
        } else if (editMode === "audio") {
            for (var at = 0; at < SEQUENCE.audioTracks.numTracks; at++) {
                try { QE_SEQUENCE.getAudioTrackAt(at).razor(timecode); } catch(e) {}
            }
        } else {
		    QE_SEQUENCE.getVideoTrackAt(VIDEO_TRACK).razor(timecode);
		    QE_SEQUENCE.getAudioTrackAt(AUDIO_TRACK).razor(timecode);
        }
		$.sleep(30);
            }
        }
    } catch (error) {
        alert(error);
    }

    var startingIndex;
    if (cutStartflag === 1) {
        startingIndex = 0;
    } else {
        startingIndex = 1;
    }

    if (editMode === "all") {
        try {
            var allSilencesSorted = silences.slice().sort(function(a, b) { return b[0] - a[0]; });
            for (var si = 0; si < allSilencesSorted.length; si++) {
                var silStart = allSilencesSorted[si][0];
                var silEnd   = allSilencesSorted[si][1];

                for (var vt = 0; vt < SEQUENCE.videoTracks.numTracks; vt++) {
                    var vtTrack = SEQUENCE.videoTracks[vt];
                    for (var vi = vtTrack.clips.length - 1; vi >= 0; vi--) {
                        var vc = vtTrack.clips[vi];
                        if (!vc || vc.mediaType !== "Video") continue;
                        if (vc.start.seconds >= silStart - 0.02 && vc.end.seconds <= silEnd + 0.02) {
                            vc.remove(true, true);
                            $.sleep(30);
                            break;
                        }
                    }
                }
                for (var at = 0; at < SEQUENCE.audioTracks.numTracks; at++) {
                    var atTrack = SEQUENCE.audioTracks[at];
                    for (var ai = atTrack.clips.length - 1; ai >= 0; ai--) {
                        var ac = atTrack.clips[ai];
                        if (!ac || ac.mediaType !== "Audio") continue;
                        if (ac.start.seconds >= silStart - 0.02 && ac.end.seconds <= silEnd + 0.02) {
                            ac.remove(true, true);
                            $.sleep(30);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            alert("All Tracks remove error: " + error.message);
        }

        for (var vt = 0; vt < SEQUENCE.videoTracks.numTracks; vt++) {
            try { relinkTracks(vt, vt, SEQUENCE); } catch(e) {}
        }

    } else if (editMode === "audio") {
        try {
            var audioSilences = silences.slice().sort(function(a, b) { return b[0] - a[0]; });
            for (var si = 0; si < audioSilences.length; si++) {
                var silStart = audioSilences[si][0];
                var silEnd   = audioSilences[si][1];
                for (var at = 0; at < SEQUENCE.audioTracks.numTracks; at++) {
                    var atTrack = SEQUENCE.audioTracks[at];
                    for (var ai = atTrack.clips.length - 1; ai >= 0; ai--) {
                        var ac = atTrack.clips[ai];
                        if (!ac || ac.mediaType !== "Audio") continue;
                        if (ac.start.seconds >= silStart - 0.02 && ac.end.seconds <= silEnd + 0.02) {
                            ac.remove(true, false);
                            $.sleep(30);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            alert("Audio Only remove error: " + error.message);
        }

    } else {
        var nonEmptyTrackItems;
        var nonEmptyAudioTrackItems;

        try {
            nonEmptyTrackItems = getNonEmptyTrackItems("Video", SEQUENCE, VIDEO_TRACK, AUDIO_TRACK);
            nonEmptyAudioTrackItems = getNonEmptyTrackItems("Audio", SEQUENCE, VIDEO_TRACK, AUDIO_TRACK);       
        } catch (error) {
            alert("Get non-empty items: " + error.message);
        }

        try {
            var currentTrackItem = null;
            var currentAudioTrackItem = null;
            for (var i = startingIndex; i < nonEmptyAudioTrackItems.length; i++) {
                if (i % 2 === startingIndex) {
                    currentAudioTrackItem = nonEmptyAudioTrackItems[i];
                    currentTrackItem = nonEmptyTrackItems[i];
                    if (currentTrackItem) currentTrackItem.remove(true, true);
                    if (currentAudioTrackItem) currentAudioTrackItem.remove(true, true);
                    $.sleep(30);
                } 
            }
        } catch (error) {
            alert("Remove silent track items: " + error.message);
        }

        relinkTracks(VIDEO_TRACK, AUDIO_TRACK, SEQUENCE);
    }

}

function relinkTracks(VIDEO_TRACK, AUDIO_TRACK, SEQUENCE) {    
    var video_items = getNonEmptyTrackItems("Video", SEQUENCE, VIDEO_TRACK, AUDIO_TRACK);
    var audio_items = getNonEmptyTrackItems("Audio", SEQUENCE, VIDEO_TRACK, AUDIO_TRACK);

    for (var i = 0; i < video_items.length; i++) {
        var selection = [video_items[i], audio_items[i]];
        SEQUENCE.setSelection(selection);
        SEQUENCE.linkSelection();
    }
}

function getNonEmptyTrackItems(type, SEQUENCE, VIDEO_TRACK, AUDIO_TRACK) {
    var result = [];
    if (type === "Video") {
        for (var i = 0; i < SEQUENCE.videoTracks[VIDEO_TRACK].clips.length; i++) {
            if (SEQUENCE.videoTracks[VIDEO_TRACK].clips[i].mediaType === "Video") {
                result.push(SEQUENCE.videoTracks[VIDEO_TRACK].clips[i]);
            }
        }
    } else if (type === "Audio") {
        for (var i = 0; i < SEQUENCE.audioTracks[AUDIO_TRACK].clips.length; i++) {
            if (SEQUENCE.audioTracks[AUDIO_TRACK].clips[i].mediaType === "Audio") {
                result.push(SEQUENCE.audioTracks[AUDIO_TRACK].clips[i]);
            }
        }
    } else {
        alert("Invalid track type!");
    }
    return result;
}

function getMediaPath() {
    var sequence = app.project.activeSequence;
    var track1 = sequence.videoTracks[0];
    var videoClip = track1.clips[0];
    var linkedItems = videoClip.getLinkedItems();
    for (var i = 0; i < linkedItems.length; i++) {
        if (linkedItems[i] && linkedItems[i].mediaType === "Audio") {
            return linkedItems[i].projectItem.getMediaPath();
        }
    }
    return videoClip.projectItem.getMediaPath();
}

function getMediaPathAudio() {
    var sequence = app.project.activeSequence;
    var audioTrack = sequence.audioTracks[0];
    if (!audioTrack || audioTrack.clips.length === 0) return "";
    return audioTrack.clips[0].projectItem.getMediaPath();
}

function getInOutStartPointsAudio() {
    var clip = app.project.activeSequence.audioTracks[0].clips[0];
    var inPoint  = clip.inPoint.seconds;
    var outPoint = clip.outPoint.seconds;
    var start    = clip.start.seconds;
    var result = '{"in": ' + inPoint + ', "out": ' + outPoint + ', "start": ' + start + '}';
    return result;
}

function checkTrackBasedValidity() {
    var seq = app.project.activeSequence;
    if (!seq || !seq.audioTracks || seq.audioTracks.numTracks === 0) return false;
    for (var at = 0; at < seq.audioTracks.numTracks; at++) {
        if (seq.audioTracks[at].clips.length > 0) return true;
    }
    return false;
}

function checkAudioOnlyValidity() {
    var seq = app.project.activeSequence;
    if (!seq || !seq.audioTracks || seq.audioTracks.numTracks === 0) return false;
    for (var at = 0; at < seq.audioTracks.numTracks; at++) {
        if (seq.audioTracks[at].clips.length > 0) return true;
    }
    return false;
}

function checkAllTracksValidity() {
    var seq = app.project.activeSequence;
    if (!seq) return false;
    if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
        for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
            if (seq.videoTracks[vt].clips.length > 0) return true;
        }
    }
    if (seq.audioTracks && seq.audioTracks.numTracks > 0) {
        for (var at = 0; at < seq.audioTracks.numTracks; at++) {
            if (seq.audioTracks[at].clips.length > 0) return true;
        }
    }
    return false;
}

function getInOutStartPoints() {
    var videoClip = app.project.activeSequence.videoTracks[0].clips[0];
    var clip = videoClip;
    var linkedItems = videoClip.getLinkedItems();
    for (var i = 0; i < linkedItems.length; i++) {
        if (linkedItems[i] && linkedItems[i].mediaType === "Audio") {
            clip = linkedItems[i];
            break;
        }
    }
    var inPoint  = clip.inPoint.seconds;
    var outPoint = clip.outPoint.seconds;
    var start    = clip.start.seconds;
    var result = '{"in": ' + inPoint + ', "out": ' + outPoint + ', "start": ' + start + '}';
    return result;
}

function getAllTracksClipInfo() {
    try {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "Aktif sequence bulunamadı." });
    var clips = [];
    var vt, at, ci, clip, info, k, exists;

    for (vt = 0; vt < seq.videoTracks.numTracks; vt++) {
        for (ci = 0; ci < seq.videoTracks[vt].clips.length; ci++) {
            clip = seq.videoTracks[vt].clips[ci];
            if (clip && clip.mediaType === "Video") {
                try {
                    info = {
                        path:  clip.projectItem.getMediaPath(),
                        "in":  clip.inPoint.seconds,
                        "out": clip.outPoint.seconds,
                        start: clip.start.seconds
                    };
                    exists = false;
                    for (k = 0; k < clips.length; k++) {
                        if (clips[k].path === info.path && Math.abs(clips[k].start - info.start) < 0.01) {
                            exists = true; break;
                        }
                    }
                    if (!exists) clips.push(info);
                } catch(e) {}
            }
        }
    }
    for (at = 0; at < seq.audioTracks.numTracks; at++) {
        for (ci = 0; ci < seq.audioTracks[at].clips.length; ci++) {
            clip = seq.audioTracks[at].clips[ci];
            if (clip && clip.mediaType === "Audio") {
                try {
                    info = {
                        path:  clip.projectItem.getMediaPath(),
                        "in":  clip.inPoint.seconds,
                        "out": clip.outPoint.seconds,
                        start: clip.start.seconds
                    };
                    exists = false;
                    for (k = 0; k < clips.length; k++) {
                        if (clips[k].path === info.path && Math.abs(clips[k].start - info.start) < 0.01) {
                            exists = true; break;
                        }
                    }
                    if (!exists) clips.push(info);
                } catch(e) {}
            }
        }
    }
    return JSON.stringify(clips);
    } catch (e) {
        return JSON.stringify({ error: "getAllTracksClipInfo: " + e.toString() });
    }
}

function getAllAudioClipInfo() {
    try {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: "Aktif sequence bulunamadı." });
    var clips = [];
    var at, ci, clip, info, k, exists;

    for (at = 0; at < seq.audioTracks.numTracks; at++) {
        for (ci = 0; ci < seq.audioTracks[at].clips.length; ci++) {
            clip = seq.audioTracks[at].clips[ci];
            if (clip && clip.mediaType === "Audio") {
                try {
                    info = {
                        path:  clip.projectItem.getMediaPath(),
                        "in":  clip.inPoint.seconds,
                        "out": clip.outPoint.seconds,
                        start: clip.start.seconds
                    };
                    exists = false;
                    for (k = 0; k < clips.length; k++) {
                        if (clips[k].path === info.path && Math.abs(clips[k].start - info.start) < 0.01) {
                            exists = true; break;
                        }
                    }
                    if (!exists) clips.push(info);
                } catch(e) {}
            }
        }
    }
    return JSON.stringify(clips);
    } catch (e) {
        return JSON.stringify({ error: "getAllAudioClipInfo: " + e.toString() });
    }
}
function checkOneLinkedClipPair() {
    if (app.project.activeSequence.videoTracks[0].clips.length != 1) return false;
    if (app.project.activeSequence.audioTracks[0].clips.length != 1) return false;
    if (app.project.activeSequence.videoTracks[0].clips[0].getLinkedItems().length != 2) return false;
    return true;
}

function addPreviewMarkers(segmentsStr, clipStart) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "Aktif sequence bulunamadı." });

        _clearPreviewMarkersInternal(seq);

        var segments = JSON.parse(segmentsStr);
        var addedCount = 0;

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i]; 

            var segStart, segEnd;
            if (seg.constructor === Array) {
                segStart = parseFloat(seg[0]);
                segEnd   = parseFloat(seg[1]);
            } else {
                segStart = parseFloat(seg.start || seg[0]);
                segEnd   = parseFloat(seg.end   || seg[1]);
            }

            // Python already adds the clip START offset to the returned values.
            // Do not add clipStart a second time here.
            var markerTime = segStart;
            var markerEnd  = segEnd;

            if (isNaN(markerTime) || isNaN(markerEnd) || markerEnd <= markerTime) {
                continue;
            }

            var marker = seq.markers.createMarker(markerTime);
            marker.name     = "SILENCE_" + i;
            marker.comments = "Sessiz: " + (segEnd - segStart).toFixed(2) + "s";
            marker.end      = markerEnd;

            marker.colorByIndex = 0;

            addedCount++;
        }

        return JSON.stringify({ success: true, added: addedCount });

    } catch(e) {
        return JSON.stringify({ error: "addPreviewMarkers hatası: " + e.toString() });
    }
}

function clearPreviewMarkers() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "Aktif sequence yok." });
        var removed = _clearPreviewMarkersInternal(seq);
        return JSON.stringify({ success: true, removed: removed });
    } catch(e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function _clearPreviewMarkersInternal(seq) {
    var markers = seq.markers;
    var removed  = 0;
    var toRemove = [];

    try {
        var cur = markers.getFirstMarker();
        while (cur) {
            if (cur.name && cur.name.indexOf("SILENCE_") === 0) {
                toRemove.push(cur);
            }
            try {
                cur = markers.getNextMarker(cur);
            } catch(e) {
                break;
            }
        }
    } catch(e) {

    }

    for (var j = 0; j < toRemove.length; j++) {
        try {
            markers.deleteMarker(toRemove[j]);
            removed++;
        } catch(e) {}
    }

    return removed;
}
