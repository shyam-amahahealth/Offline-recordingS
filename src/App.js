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
  const [uploadStatus, setUploadStatus] = useState("");
  const [lastAudioUrl, setLastAudioUrl] = useState("");
  const [log, setLog] = useState([]);

  const mediaRecorderRef = useRef(null);
  const chunkBufferRef = useRef([]);

  const addLog = (msg) =>
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const startRecording = async () => {
    setError("");
    addLog("Attempting to start recording...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();

      if (!tracks || tracks.length === 0) {
        throw new Error("No audio tracks available");
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunkBufferRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000);
      setRecording(true);
      addLog("Recording started successfully.");
    } catch (e) {
      setError("Could not start recording: " + e.message);
      addLog("Recording failed: " + e.name + " - " + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      addLog("Recording stopped.");
    }
  };

  const uploadChunks = useCallback(async () => {
    setUploading(true);
    setUploadStatus("Uploading...");
    addLog("Uploading audio chunks...");

    const CLOUDINARY_CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
    const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;

    const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;

    try {
      const allBlobs = await getAllChunks();
      let uploadedUrls = [];

      for (let i = 0; i < allBlobs.length; i++) {
        const { chunk, id } = allBlobs[i];
        const publicId = `${sessionId}_${Date.now()}_${i}`;

        const formData = new FormData();
        formData.append("file", chunk, `${publicId}.webm`);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("public_id", publicId);

        const res = await fetch(CLOUDINARY_URL, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();
        if (data.secure_url) {
          uploadedUrls.push(data.secure_url);
          await deleteChunkById(id);
        }
      }

      setUploadStatus("Upload successful.");
      addLog("All chunks uploaded successfully.");

      if (uploadedUrls.length > 0) {
        setLastAudioUrl(uploadedUrls[uploadedUrls.length - 1]);
      }
    } catch (e) {
      setUploadStatus("Upload failed: " + e.message);
      addLog("Upload error: " + e.message);
    }

    setUploading(false);
  }, [sessionId]);

  useEffect(() => {
    if (!recording) return;

    chunkBufferRef.current = [];

    const interval = setInterval(async () => {
      if (chunkBufferRef.current.length > 0) {
        const blob = new Blob(chunkBufferRef.current);
        await saveChunk(blob, `${Date.now()}-${Math.random()}`);
        await uploadChunks();
        chunkBufferRef.current = [];
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [recording, uploadChunks]);

  const deleteChunkById = (id) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("audio-recording-db", 1);
      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("audioChunks", "readwrite");
        tx.objectStore("audioChunks").delete(id);
        tx.oncomplete = resolve;
        tx.onerror = reject;
      };
      request.onerror = reject;
    });

  return (
    <div className="App">
      <header className="App-header">
        <h2>Audio Recorder</h2>

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
          disabled={uploading}
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
            <audio controls src={lastAudioUrl} />
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
