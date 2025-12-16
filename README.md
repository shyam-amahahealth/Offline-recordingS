# Offline Audio Recording React App

This app allows you to record audio, save it locally, and upload audio chunks to Cloudinary. It works in browsers and inside React Native WebView, with proper permission handling for both environments.

## Features

- Record audio using the browser's microphone
- Save audio chunks locally in IndexedDB
- Upload audio chunks in the background to Cloudinary
- Permission management for both browser and React Native WebView
- UI feedback for permission status, recording, and upload progress
- Displays the last uploaded audio file from Cloudinary

## Usage

1. **Request Microphone Permission**: Click the "Request Microphone Permission" button. In WebView, permission is handled natively and communicated via postMessage.
2. **Start Recording**: Click "Start Recording". Audio is recorded in 1-second chunks and saved locally.
3. **Stop Recording**: Click "Stop Recording" to end the session.
4. **Upload Chunks**: Click "Upload Chunks" to upload all locally saved audio chunks to Cloudinary. Progress is shown in the UI. The last uploaded audio file will be displayed with a player.

## Cloudinary Setup

1. Create a Cloudinary account at https://cloudinary.com/
2. Get your cloud name and create an unsigned upload preset (e.g., `your_upload_preset`).
3. Set your Cloudinary details using environment variables in Netlify, not in the code or README. Do not commit your actual secret values to the repository. Example variables:
	- REACT_APP_CLOUDINARY_CLOUD_NAME
	- REACT_APP_CLOUDINARY_UPLOAD_PRESET
	- REACT_APP_CLOUDINARY_API_KEY
	- REACT_APP_CLOUDINARY_API_SECRET
	- CLOUDINARY_URL

## WebView Integration

If running inside React Native WebView, the app will request permission via `window.ReactNativeWebView.postMessage`. The native app should respond with a message of type `MIC_PERMISSION_RESULT` and a `granted` boolean.

## Local Saving

Audio chunks are saved in IndexedDB. If upload is interrupted, you can retry uploading later.

## Development

Run the app:

```
npm start
```

## License

MIT
