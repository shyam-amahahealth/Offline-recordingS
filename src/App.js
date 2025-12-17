import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import { saveChunk, getAllChunks } from "./localAudio";

function App() {
  const [sessionId] = useState(
    () => `audio_session_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  );
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hasPendingChunks, setHasPendingChunks] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [lastAudioUrl, setLastAudioUrl] = useState("");
  const [log, setLog] = useState([]);
  const [micPermission, setMicPermission] = useState("prompt");

  const mediaRecorderRef = useRef(null);
  const chunkBufferRef = useRef([]);

  const addLog = (msg) =>
    setLog((p) => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const safeSaveChunk = async (blob, id) => {
    try {
      await saveChunk(blob, id);
    } catch (e) {
      setError("Local storage access revoked.");
      addLog("Storage error: " + e.message);
      setHasPendingChunks(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunkBufferRef.current.push(e.data);
      };

      recorder.start(1000);
      setRecording(true);
      addLog("Recording started");
    } catch (e) {
      setError(e.message);
      addLog("Recording failed: " + e.message);
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    setRecording(false);

    if (chunkBufferRef.current.length) {
      const blob = new Blob(chunkBufferRef.current, { type: "audio/webm" });
      await safeSaveChunk(blob, `${Date.now()}-${Math.random()}`);
      chunkBufferRef.current = [];
    }

    await uploadChunks();
  };

  const checkPendingChunks = useCallback(async () => {
    try {
      const all = await getAllChunks();
      setHasPendingChunks(all.length > 0);
    } catch {
      setHasPendingChunks(false);
    }
  }, []);

  const deleteChunkById = (id) =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open("audio-recording-db", 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("audioChunks", "readwrite");
        tx.objectStore("audioChunks").delete(id);
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
      req.onerror = reject;
    });

  const uploadChunks = useCallback(async () => {
    try {
      setUploading(true);
      setUploadStatus("Uploading...");

      const CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
      const PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
      const URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;

      const chunks = await getAllChunks();
      const urls = [];

      for (let i = 0; i < chunks.length; i++) {
        const { chunk, id } = chunks[i];
        const publicId = `${sessionId}_${Date.now()}_${i}`;
        const blob =
          chunk instanceof Blob
            ? chunk
            : new Blob([chunk], { type: "audio/webm" });

        const fd = new FormData();
        fd.append("file", blob, `${publicId}.webm`);
        fd.append("upload_preset", PRESET);
        fd.append("public_id", publicId);

        const res = await fetch(URL, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();
        if (data.secure_url) {
          urls.push(data.secure_url);
          await deleteChunkById(id);
        }
      }

      if (urls.length) setLastAudioUrl(urls.at(-1));
      setUploadStatus("Upload successful");
    } catch (e) {
      setUploadStatus("Upload failed");
      setError(e.message);
    } finally {
      setUploading(false);
      checkPendingChunks();
    }
  }, [sessionId, checkPendingChunks]);

  useEffect(() => {
    checkPendingChunks();

    if (navigator.storage?.persist) {
      navigator.storage.persist();
    }
  }, [checkPendingChunks]);

  // Listen for microphone permission changes and update localStorage
  useEffect(() => {
    if (!navigator.permissions) return;

    let permissionStatus;
    navigator.permissions.query({ name: "microphone" }).then((status) => {
      permissionStatus = status;
      setMicPermission(status.state);
      localStorage.setItem("microphone_permission", status.state);
      status.onchange = () => {
        setMicPermission(status.state);
        localStorage.setItem("microphone_permission", status.state);
        if (status.state === "denied") {
          setError("Microphone permission revoked");
          setRecording(false);
          mediaRecorderRef.current?.stop();
        } else if (status.state === "granted") {
          setError("");
        }
      };
    });
    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (!recording) return;

    chunkBufferRef.current = [];

    const i = setInterval(async () => {
      if (chunkBufferRef.current.length) {
        const blob = new Blob(chunkBufferRef.current, { type: "audio/webm" });
        await safeSaveChunk(blob, `${Date.now()}-${Math.random()}`);
        await uploadChunks();
        chunkBufferRef.current = [];
      }
    }, 60000);

    return () => clearInterval(i);
  }, [recording, uploadChunks, safeSaveChunk]);

  return (
    <div className="App">
      <header className="App-header">
        <h2>Audio Recorder</h2>

        {/* Show CTA if mic permission is not granted */}
        {micPermission !== "granted" ? (
          <div style={{ margin: 20, color: "#fff", background: "#c00", padding: 16, borderRadius: 8 }}>
            <p>Microphone access is required to record audio.</p>
            <button
              onClick={async () => {
                try {
                  await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch (e) {
                  setError("Microphone permission denied");
                }
              }}
              style={{ padding: "8px 16px", fontSize: 16, borderRadius: 4 }}
            >
              Ask for Microphone Permission
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                background: "#222",
                color: "#fff",
                padding: 12,
                borderRadius: 8,
                maxHeight: 150,
                overflowY: "auto",
                fontFamily: "monospace",
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              <b>Debug Log</b>
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>

            <button onClick={recording ? stopRecording : startRecording}>
              {recording ? "Stop Recording" : "Start Recording"}
            </button>

            <button
              onClick={uploadChunks}
              disabled={uploading || !hasPendingChunks}
              style={{ marginLeft: 8 }}
            >
              Upload Chunks
            </button>

            {error && <p style={{ color: "red" }}>{error}</p>}
            <p>{recording ? "Recording..." : "Not recording"}</p>
            {uploadStatus && <p>{uploadStatus}</p>}

            {lastAudioUrl && (
              <div style={{ marginTop: 12 }}>
                <p>Last uploaded audio:</p>
                <audio controls src={lastAudioUrl}>
                  <source src={lastAudioUrl} type="audio/webm" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </>
        )}
      </header>
    </div>
  );
}

export default App;
