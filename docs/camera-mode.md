# Public-site webcam mode

The camera button is beside mute in the main Gaia menu. It opens an independent fixed preview below the icons and explicitly requests video only; no microphone. Camera activation is never automatic or persisted across page loads.

The existing experimental pose classifier and GestureGate were copied unchanged from the local movement prototype into camera-movement-core.js; the prototype files were not modified. Calibration requires rest/yes/no examples. Optional numeric examples remain in the current browser only; localhost examples are a separate origin and are not automatically available on GitHub Pages.

After the video and detector are ready, a five-second countdown asks "Ciao Gaia! Vuoi cominciare?". It is visible and spoken using browser speech synthesis unless mute is on. A confirmed yes opens Gaia's category selection. No keeps the initial flow waiting; Repeat question starts another countdown. The first integration only automates this startup answer, not movie choices, platform launches or statistics. Live yes/no/rest/uncertain readings remain visible afterward.

The model is loaded on demand from pinned MediaPipe 0.10.21 CDN resources. Video is processed in the browser; no recording or upload endpoint is present. Disabling stops every track, clears the video source, cancels animation, timers/state and closes the detector. Missing/multiple faces, uncertain states, hidden tabs and calibration do not trigger a start.

Tests: startup flow timer/yes/no/repeated answers; rest-required gesture gate; simulated MediaStream and detector lifecycle; permission denied. Live UI/menu publication verified without activating the user's real webcam. Real head gesture accuracy requires user calibration and remains experimental.
