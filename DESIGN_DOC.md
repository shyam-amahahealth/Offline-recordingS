
# Audio Recording POC – Design Document

## Table of Contents
1. Overview
2. Goals
3. Architecture
	- Web Application (React)
	- Mobile Application (React Native)
	- Shared Backend
4. Key Components
	- Audio Recording
	- Local Chunk Storage
	- Uploading Chunks
	- Playback
	- UI/UX
5. WebView Integration & Permissions
6. Error Handling
7. Security & Privacy
8. Extensibility
9. Limitations
10. Future Improvements
11. Author & Date

## 1. Overview
This Proof of Concept (POC) demonstrates a cross-platform audio recording solution, consisting of:
- **Web Application (React):** Allows users to record audio, store it locally in the browser, and upload audio chunks to a backend (Cloudinary) for persistent storage.
- **Mobile Application (React Native):** Provides similar audio recording and upload functionality for mobile devices, working in tandem with the web app and sharing the same backend. The mobile app can also run the web app inside a WebView for unified logic.

## 2. Goals
- Enable users to record audio from both web browsers and mobile devices.
- Store audio data in local storage as chunks for reliability and offline support (on both platforms).
- Upload audio chunks to a backend (Cloudinary) as soon as possible from either platform.
- Provide a simple UI for recording and playback on both web and mobile.
- Ensure robust error handling and clear user feedback.

## 3. Architecture

### Web Application (React)
- **Frontend:** React (JavaScript)
- **Audio Capture:** Web MediaRecorder API
- **Local Storage:** IndexedDB (via helper functions)

### Mobile Application (React Native)
- **Frontend:** React Native (TypeScript/JavaScript)
- **Audio Capture:** Native modules (e.g., expo-av, react-native-audio)
- **Local Storage:** FileSystem API or AsyncStorage
- **WebView Option:** Can run the web app inside a WebView, delegating permission handling to the native layer.

### Shared Backend
- **Backend Storage:** Cloudinary (raw file upload API)

## 4. Key Components

### Audio Recording
- **Web:**
	- Uses `navigator.mediaDevices.getUserMedia` to request microphone access.
	- Uses `MediaRecorder` to record audio in 1-second chunks.
	- Chunks are buffered and periodically saved to IndexedDB.
- **React Native:**
	- Uses platform-specific APIs (e.g., expo-av, react-native-audio) to request microphone access and record audio.
	- Audio is recorded in chunks or as a single file, then split if needed.
	- Chunks are saved to local storage (FileSystem/AsyncStorage).

### Local Chunk Storage
- **Web:**
	- Chunks are saved in IndexedDB for reliability (e.g., network loss, tab close).
	- Each chunk is saved with a unique ID.
	- Helper functions: `saveChunk`, `getAllChunks`, `deleteChunkById`.
- **React Native:**
	- Chunks are saved in the device's file system or AsyncStorage.
	- Each chunk is saved with a unique ID.

### Uploading Chunks
- Chunks are uploaded to Cloudinary using a preset and public ID from both platforms.
- After successful upload, the chunk is deleted from local storage.
- Upload is triggered automatically after each chunk is saved and when recording stops.

### Playback
- **Web:**
	- The last successfully uploaded audio file is available for playback in the UI.
	- Uses the HTML `<audio>` element with a proper MIME type.
- **React Native:**
	- The last uploaded audio file can be played back using a native audio player component.

### UI/UX
- **Web:**
	- Simple interface: Start/Stop recording, playback for last upload, debug log.
	- Upload button was removed as uploads are automatic.
	- Status and error messages are shown to the user.
- **React Native:**
	- Mobile UI follows native conventions for recording and playback.
	- Handles permission dialogs and feedback natively.
## 5. WebView Integration & Permissions

When the web application is run inside a WebView in the React Native app, the following flow ensures proper microphone access and recording:

1. The user initiates recording in the WebView.
2. The web app attempts to access the microphone using `navigator.mediaDevices.getUserMedia`.
3. If permission is not already granted, the WebView triggers a native permission request dialog (Android/iOS).
4. The React Native layer listens for permission requests from the WebView and prompts the user with the native device permission dialog.
5. Once permission is granted, the native layer sends a message back to the WebView indicating that microphone access is allowed.
6. The WebView proceeds to record audio as normal, using browser APIs.
7. If permission is denied, the web app displays an error and does not record.

This approach leverages native permission dialogs for security and compliance, while keeping the recording logic unified in the web codebase. Communication between the WebView and native layer is handled via postMessage or a similar bridge.

## 6. Error Handling
- Handles permission errors, device errors, and upload failures on both platforms.
- Logs all actions and errors in a debug log (web) or via native logging (mobile).

## 7. Security & Privacy
- Audio is only recorded with explicit user permission.
- Audio files are uploaded to a secure backend (Cloudinary).

## 8. Extensibility
- The architecture allows for easy replacement of the backend (e.g., switch from Cloudinary to another service).
- Additional features (e.g., chunk merging, user authentication) can be added as needed.
- Both web and mobile codebases can be extended independently or together.

## 9. Limitations
- Web: Only supports browsers with MediaRecorder and IndexedDB support.
- Mobile: Only supports devices with required audio and storage APIs.
- No user authentication or access control in this POC.
- Audio is uploaded in raw chunks, not merged into a single file.

## 10. Future Improvements
- Merge uploaded chunks into a single audio file for playback/download.
- Add user authentication and per-user storage.
- Support for other audio formats (e.g., mp3, wav).
- Improved mobile support and UI polish.
- Unified chunk format and upload logic between web and mobile.
- Cross-platform playback and management of uploaded files.

## 11. Author & Date

- Author: [Your Name]
- Date: December 17, 2025
- Project: Audio Recording POC
