import React, { useState, useRef, useEffect } from "react";
import "./App.css";
import { saveChunk, getAllChunks } from "./localAudio";

function isWebView() {
  // Heuristic: React Native WebView often injects a user agent or window.ReactNativeWebView
  return (
    window.ReactNativeWebView !== undefined ||
    /wv|webview|reactnative/i.test(navigator.userAgent)
  );
}

function App() {
  // Generate a session id for the current recording session
  const [sessionId] = useState(
    () => `audio_session_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  );
  // Persist permission status in localStorage
  const [permission, setPermission] = useState(() => {
    const stored = localStorage.getItem("mic_permission");
    return stored ? stored : null;
  });
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunkBufferRef = useRef([]); // Buffer for 60s
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [lastAudioUrl, setLastAudioUrl] = useState("");
  // Log state for debugging
  const [log, setLog] = useState([]);

  // Helper to add log entries
  const addLog = (msg) =>
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Request permission for audio
  const requestPermission = async () => {
    addLog("Requesting microphone permission...");
    if (permission === "granted") {
      addLog("Permission already granted.");
      return; // Don't ask again
    }
    if (isWebView()) {
      addLog(
        "Detected WebView environment. Sending permission request to native app."
      );
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "REQUEST_MIC_PERMISSION" })
        );
      }
      // Listen for permission result from React Native WebView (document for RN, window for browser)
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          addLog(
            `Native app responded: permission ${
              data.granted ? "granted" : "denied"
            } (from handler)`
          );
          if (data.type === "MIC_PERMISSION_RESULT") {
            setPermission(data.granted ? "granted" : "denied");
            localStorage.setItem(
              "mic_permission",
              data.granted ? "granted" : "denied"
            );
            addLog(
              `Native app responded: permission ${
                data.granted ? "granted" : "denied"
              } (from handler)`
            );
          }
        } catch {}
      };
      window.addEventListener("message", handler, { once: true });
      if (document && document.addEventListener) {
        document.addEventListener("message", handler, { once: true });
      }
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermission("granted");
        localStorage.setItem("mic_permission", "granted");
        addLog("Browser permission granted.");
      } catch (e) {
        setPermission("denied");
        localStorage.setItem("mic_permission", "denied");
        setError("Microphone permission denied.");
        addLog("Browser permission denied: " + e.message);
      }
    }
  };

  // Start recording
  const startRecording = async () => {
    setError("");
    addLog("Attempting to start recording...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 8000, // lowest practical sample rate
          channelCount: 1, // mono
        },
      });
      let options = {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 8000 * 8, // 8kbps for conversation
      };
      // Fallback if browser does not support opus
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = "audio/webm";
        addLog("Opus not supported, using fallback mimeType.");
      }
      const mediaRecorder = new window.MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunkBufferRef.current.push(e.data);
        }
      };
      mediaRecorder.start(1000); // 1s chunks (60 chunks = 60s)
      setRecording(true);
      addLog("Recording started.");
    } catch (e) {
      setError("Could not start recording: " + e.message);
      addLog("Failed to start recording: " + e.message);
    }
  };
  // Auto-upload 60s of buffered chunks every 60 seconds while recording
  useEffect(() => {
    if (!recording) return;
    chunkBufferRef.current = [];
    const interval = setInterval(async () => {
      if (chunkBufferRef.current.length > 0) {
        // Combine 60 chunks (60s) into one Blob
        const sixtySecBlob = new Blob(chunkBufferRef.current, {
          type: "audio/webm;codecs=opus",
        });
        // Save to IndexedDB (optional, can remove if not needed)
        await saveChunk(sixtySecBlob, Date.now() + "-" + Math.random());
        // Upload only the combined file (all chunks so far)
        await uploadChunks();
        chunkBufferRef.current = [];
      }
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, [recording]);

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      addLog("Recording stopped.");
    }
  };

  // Upload each chunk separately with a unique public_id
  const uploadChunks = async () => {
    setUploading(true);
    setUploadStatus("Uploading...");
    addLog("Uploading audio chunks to Cloudinary...");
    // Cloudinary configuration for unsigned upload
    const CLOUDINARY_CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
    const UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
    const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
    try {
      let allBlobs = await getAllChunks();
      let uploadedUrls = [];
      for (let i = 0; i < allBlobs.length; i++) {
        const chunk = allBlobs[i].chunk;
        const id = allBlobs[i].id;
        const chunkId = `${sessionId}_chunk_${i}_${Date.now()}_${Math.floor(
          Math.random() * 10000
        )}`;
        const formData = new FormData();
        formData.append("file", chunk, `${chunkId}.webm`);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("public_id", chunkId);
        const response = await fetch(CLOUDINARY_URL, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Cloudinary upload failed");
        const data = await response.json();
        if (data.secure_url) {
          uploadedUrls.push(data.secure_url);
          // Delete this chunk from IndexedDB after successful upload
          await deleteChunkById(id);
        }
      }
      setUploadStatus(
        "All chunks uploaded to Cloudinary and local storage cleared."
      );
      addLog("Upload successful. All chunks uploaded.");
      if (uploadedUrls.length > 0) {
        setLastAudioUrl(uploadedUrls[uploadedUrls.length - 1]);
      }
    } catch (e) {
      setUploadStatus("Upload failed: " + e.message);
      addLog("Upload failed: " + e.message);
    }
    setUploading(false);
  };

  // Helper to delete a chunk by id from IndexedDB
  async function deleteChunkById(id) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("audio-recording-db", 1);
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction("audioChunks", "readwrite");
        const store = tx.objectStore("audioChunks");
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
      };
      request.onerror = (e) => reject(e);
    });
  }

  return (
    <div className="App">
      <header className="App-header">
        <h2>Audio Recorder</h2>
        <div
          style={{
            textAlign: "left",
            maxWidth: 400,
            margin: "0 auto",
            background: "#222",
            color: "#fff",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          <b>Debug Log:</b>
          <div
            style={{
              maxHeight: 120,
              overflowY: "auto",
              marginTop: 4,
              fontFamily: "monospace",
            }}
          >
            {log.length === 0 ? (
              <span style={{ color: "#888" }}>No events yet.</span>
            ) : (
              log.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </div>
        {permission !== "granted" ? (
          <>
            <button onClick={requestPermission}>
              Request Microphone Permission
            </button>
            {error && <p style={{ color: "red" }}>{error}</p>}
            {permission === "denied" && (
              <p>Permission denied. Please enable microphone access.</p>
            )}
          </>
        ) : (
          <>
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
              <div style={{ marginTop: 16 }}>
                <p>Last uploaded audio:</p>
                <audio controls src={lastAudioUrl} />
              </div>
            )}
          </>
        )}
      </header>
      {/* Display all uploaded chunks for this session */}
      {/* Uploaded chunks display removed as per user request */}
    </div>
  );
}

export default App;
