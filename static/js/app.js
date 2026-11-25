
(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('camera'), processed = $('processed'), stage = $('videoStage');
  const placeholder = $('placeholder'), canvas = $('magicCanvas'), fx = canvas.getContext('2d');
  const connectBtn = $('connectBtn'), backgroundBtn = $('backgroundBtn'), gestureBtn = $('gestureBtn');
  const resetBtn = $('resetBtn'), statusMessage = $('statusMessage');
  const connectionLabel = $('connectionLabel'), stageStatus = $('stageStatus'), liveDot = $('liveDot');
  const soundBtn = $('soundBtn'), soundInlineBtn = $('soundInlineBtn');

  let stream = null, socket = null, sending = false, running = false, lastSent = 0;
  let backgroundReady = false, gestureReady = false, cloakActive = false;
let selectedEffect = null, soundEnabled = false, audioContext = null;
  let particles = [], animationFrame = 0, effectOrigin = null;

  const intervalMs = 140;
  const frameCanvas = document.createElement('canvas');
  const frameContext = frameCanvas.getContext('2d', { willReadFrequently: false });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setMessage(message) {
    if (message) statusMessage.textContent = message;
  }

  function setConnected(connected) {
    [backgroundBtn, gestureBtn, resetBtn].forEach(button => {
  button.disabled = !connected;
});


    connectionLabel.classList.toggle('connected', connected);
    connectionLabel.lastChild.textContent = connected ? ' CONNECTED' : ' NOT CONNECTED';
    liveDot.style.background = connected ? '#75c596' : '';

    connectBtn.innerHTML = connected
      ? 'Disconnect camera <span>×</span>'
      : 'Connect camera <span>→</span>';
  }

  function updateSteps() {
    $('stepBackground').classList.toggle('complete', backgroundReady);
    $('stepGesture').classList.toggle('complete', gestureReady);
    $('stepActivate').classList.toggle('complete', cloakActive);

    backgroundBtn.classList.toggle('done', backgroundReady);
    gestureBtn.classList.toggle('done', gestureReady);

    backgroundBtn.innerHTML = backgroundReady
      ? 'Background captured <span>✓</span>'
      : 'Capture background <span>↗</span>';

    gestureBtn.innerHTML = gestureReady
      ? 'Gesture registered <span>✓</span>'
      : 'Register hand gesture <span>✋</span>';


  }

  function sendCommand(command) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'command', command }));
    }
  }

  function updateState(data) {
    if (typeof data.background_ready === 'boolean') {
      backgroundReady = data.background_ready;
    }

    if (typeof data.gesture_ready === 'boolean') {
      gestureReady = data.gesture_ready;
    }

    if (typeof data.cloak_active === 'boolean') {
      const changed = data.cloak_active !== cloakActive;
      cloakActive = data.cloak_active;

      stageStatus.textContent = cloakActive
        ? '✧ THE CLOAK IS ACTIVE'
        : '✧ CLOAK IS RESTING';

      stageStatus.classList.toggle('on', cloakActive);

      if (changed) onCloakChange(cloakActive);
    }

    updateSteps();

    if (data.message) {
      setMessage(data.message);

      if (/gesture detected/i.test(data.message)) {
        showGestureToast();
      }

      if (/background captured/i.test(data.message)) {
        $('guideTip').textContent =
          'Lovely! Now step back into frame and teach me your gesture.';
      }

      if (/registered successfully/i.test(data.message)) {
        $('guideTip').textContent =
          'I learned your magic signal! Try it again when you are ready.';
      }

      if (/session reset/i.test(data.message)) {
        $('guideTip').textContent =
          "Mimi's tip: Keep your camera still after capturing the background!";
      }
    }
  }

  function showGestureToast() {
    const toast = $('gestureToast');
    toast.classList.add('show');

    window.clearTimeout(showGestureToast.timer);

    showGestureToast.timer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 1500);
  }

  function handleMessage(event) {
    let data;

    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'ready') {
      setConnected(true);
      setMessage(data.message);
    } else if (data.type === 'frame') {
      processed.src = 'data:image/jpeg;base64,' + data.image;
      stage.classList.add('processed');
      updateState(data);
    } else if (data.type === 'notice' || data.type === 'error') {
      setMessage(data.message);
    }
  }

  async function connect() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable. Use localhost or HTTPS.');
      }

      setMessage('Asking your camera to join the magic...');

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      video.srcObject = stream;
      await video.play();
      placeholder.style.display = 'none';

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

      socket = new WebSocket(
        `${protocol}//${location.host}/ws/cloak/`
      );

      socket.onmessage = handleMessage;

      socket.onerror = () => {
        setMessage('Connection hiccup. Please refresh and try again.');
      };

      socket.onclose = () => {
        setConnected(false);
        stopSending();

        if (stream) {
          setMessage('Connection closed. Please reconnect.');
        }
      };

      socket.onopen = () => {
        running = true;
        sending = true;

        setMessage('Camera connected! First, capture your empty background.');
        sendFrames();
      };

    } catch (error) {
      console.error(error);

      setMessage(
        error.message ||
        'Could not access camera. Allow permission and use HTTPS or localhost.'
      );

      disconnect(false);
    }
  }

  function sendFrames() {
    if (!sending || !running) return;

    const now = performance.now();

    if (
      now - lastSent >= intervalMs &&
      socket?.readyState === WebSocket.OPEN &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0
    ) {
      frameCanvas.width = 640;

      frameCanvas.height = Math.round(
        640 * video.videoHeight / video.videoWidth
      );

      frameContext.drawImage(
        video,
        0,
        0,
        frameCanvas.width,
        frameCanvas.height
      );

      socket.send(JSON.stringify({
        type: 'frame',
        data: frameCanvas.toDataURL('image/jpeg', .62)
      }));

      lastSent = now;
    }

    requestAnimationFrame(sendFrames);
  }

  function stopSending() {
    sending = false;
    running = false;
  }

  function disconnect(showMessage = true) {
    stopSending();

    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    video.srcObject = null;
    processed.removeAttribute('src');
    stage.classList.remove('processed');

    placeholder.style.display = 'flex';

    backgroundReady = false;
    gestureReady = false;
    cloakActive = false;

    stageStatus.textContent = '✧ CLOAK IS RESTING';
    stageStatus.classList.remove('on');

    setConnected(false);
    updateSteps();

    if (showMessage) {
      setMessage('Camera disconnected. Your next little adventure is ready.');
    }
  }

  // ---------------- AUDIO SYSTEM ----------------

  function setSound(enabled) {
    soundEnabled = enabled;

    soundBtn.setAttribute('aria-pressed', String(enabled));
    $('soundIcon').textContent = enabled ? '♫' : '♪';
    $('soundLabel').textContent = enabled ? 'Sound on' : 'Sound off';

    soundInlineBtn.textContent = enabled
      ? 'Turn sound off'
      : 'Turn sound on';

    if (enabled) {
      ensureAudio();
      playTone(660, .11, 'sine', .035);
    }
  }

  function ensureAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;

    if (!audioContext && AudioCtor) {
      audioContext = new AudioCtor();
    }

    if (audioContext?.state === 'suspended') {
      audioContext.resume();
    }
  }

  function playTone(
    frequency,
    duration,
    type = 'sine',
    volume = .045,
    delay = 0,
    endFrequency = null
  ) {
    if (!soundEnabled) return;

    ensureAudio();

    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const start = audioContext.currentTime + delay;

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(frequency, start);

    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(30, endFrequency),
        start + duration
      );
    }

    gain.gain.setValueAtTime(.0001, start);

    gain.gain.exponentialRampToValueAtTime(
      volume,
      start + Math.min(.025, duration * .2)
    );

    gain.gain.exponentialRampToValueAtTime(
      .0001,
      start + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  function playNoise(
    duration,
    volume,
    filterType,
    startFrequency,
    endFrequency,
    delay = 0
  ) {
    if (!soundEnabled) return;

    ensureAudio();

    if (!audioContext) return;

    const length = Math.max(
      1,
      Math.floor(audioContext.sampleRate * duration)
    );

    const buffer = audioContext.createBuffer(
      1,
      length,
      audioContext.sampleRate
    );

    const channel = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      channel[i] =
        (Math.random() * 2 - 1) * (1 - i / length);
    }

    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    const start = audioContext.currentTime + delay;

    source.buffer = buffer;
    filter.type = filterType;

    filter.frequency.setValueAtTime(startFrequency, start);

    filter.frequency.exponentialRampToValueAtTime(
      Math.max(60, endFrequency),
      start + duration
    );

    filter.Q.value = filterType === 'bandpass' ? 0.8 : 0.45;

    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + .025);
    gain.gain.exponentialRampToValueAtTime(
      .0001,
      start + duration
    );

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    source.start(start);
    source.stop(start + duration + .02);
  }

  // Separate sounds for each magical element

  function playMagicSound(active) {
    if (!soundEnabled || !selectedEffect) return;

    if (selectedEffect === 'water') {

      // WATER: liquid splash and droplets

      playNoise(
        active ? .42 : .28,
        .055,
        'bandpass',
        active ? 1500 : 1100,
        260,
        0
      );

      const notes = active
        ? [[740, .22, 0], [1046, .3, .12], [1318, .34, .25]]
        : [[988, .2, 0], [659, .26, .13]];

      notes.forEach(([hz, duration, delay]) => {
        playTone(hz, duration, 'sine', .035, delay, hz * .72);
      });

      playTone(
        active ? 1568 : 784,
        .16,
        'sine',
        .018,
        active ? .34 : .2,
        active ? 1175 : 520
      );

    } else if (selectedEffect === 'fire') {

      // FIRE: warm whoosh and crackling embers

      playNoise(
        active ? .48 : .34,
        .075,
        'lowpass',
        900,
        170,
        0
      );

      [0, .11, .23, .34].forEach(delay => {
        playNoise(
          .055,
          .025 + Math.random() * .012,
          'highpass',
          2600,
          900,
          delay
        );
      });

      playTone(
        active ? 196 : 165,
        .34,
        'triangle',
        .035,
        .02,
        active ? 392 : 247
      );

      playTone(
        active ? 392 : 294,
        .22,
        'sawtooth',
        .012,
        .18,
        active ? 260 : 180
      );

    } else {

      // STARLIGHT: layered magical bells

      const notes = active
        ? [
            [880, .32, 0],
            [1174.7, .38, .12],
            [1568, .48, .25],
            [1760, .52, .39]
          ]
        : [
            [1174.7, .28, 0],
            [987.8, .34, .14],
            [784, .4, .28]
          ];

      notes.forEach(([hz, duration, delay]) => {
        playTone(
          hz,
          duration,
          'sine',
          .027,
          delay,
          hz * .985
        );

        playTone(
          hz * 2.01,
          duration * .72,
          'sine',
          .009,
          delay + .012,
          hz * 1.98
        );
      });
    }
  }

  // ---------------- EFFECT SELECTION ----------------

 function chooseEffect(effect) {
  selectedEffect = effect;

  document.querySelectorAll('.effect-card').forEach(card => {
    const selected = card.dataset.effect === effect;

    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));

    card.querySelector('.selected-mark').textContent =
      selected ? '✓ Selected' : 'Choose effect';
  });

  $('heroSpeech').innerHTML =
    effect === 'water'
      ? 'A little splash<br>of magic! <span>♡</span>'
      : effect === 'fire'
        ? 'Ooh, a warm<br>little spark! <span>♡</span>'
        : effect === 'stars'
          ? 'Let the stars<br>do their thing! <span>♡</span>'
          : 'Ready to make<br>some magic? <span>♡</span>';

  if (soundEnabled && effect) {
    playTone(
      effect === 'water' ? 740 :
      effect === 'fire' ? 420 : 980,
      .16,
      'sine',
      .025
    );
  }
}
function onCloakChange(active) {
  if (selectedEffect) {
    spawnParticles();
    playMagicSound(active);
  }

  $('heroSpeech').innerHTML = active
    ? 'You did it!<br>So magical! <span>♡</span>'
    : 'And... welcome<br>back! <span>♡</span>';

  showGestureToast();
}

  // ---------------- ANIMATION SYSTEM ----------------

  function resizeFx() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    fx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function spawnParticles() {
    if (!selectedEffect) return;
    resizeFx();

    const rect = stage.getBoundingClientRect();

    const count = reducedMotion ? 7 : 58;

    const originX = rect.width * (.34 + Math.random() * .32);
    const originY = rect.height * (.32 + Math.random() * .34);

    effectOrigin = {
      x: originX,
      y: originY,
      age: 0
    };

    particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;

      if (selectedEffect === 'water') {
        return {
          kind: 'water',
          x: originX,
          y: originY,
          vx: Math.cos(angle) * (1.1 + Math.random() * 2.2),
          vy: Math.sin(angle) * (1.1 + Math.random() * 2.2) - .5,
          life: 34 + Math.random() * 28,
          max: 62,
          size: 2 + Math.random() * 4,
          gravity: .075,
          angle,
          spin: (Math.random() - .5) * .08
        };
      }

      if (selectedEffect === 'fire') {
        return {
          kind: 'fire',
          x: originX + (Math.random() - .5) * 46,
          y: originY + (Math.random() - .5) * 22,
          vx: (Math.random() - .5) * .9,
          vy: -(.9 + Math.random() * 2),
          life: 28 + Math.random() * 30,
          max: 58,
          size: 3 + Math.random() * 6,
          gravity: -.018,
          angle,
          spin: (Math.random() - .5) * .12
        };
      }

      return {
        kind: 'stars',
        x: originX + (Math.random() - .5) * 90,
        y: originY + (Math.random() - .5) * 65,
        vx: (Math.random() - .5) * 1.1,
        vy: (Math.random() - .5) * 1.1,
        life: 38 + Math.random() * 34,
        max: 72,
        size: 3 + Math.random() * 7,
        gravity: 0,
        angle,
        spin: (Math.random() - .5) * .12,
        phase: Math.random() * Math.PI * 2
      };
    });

    cancelAnimationFrame(animationFrame);
    animateParticles();
  }

  function animateParticles() {
    const rect = stage.getBoundingClientRect();

    fx.clearRect(0, 0, rect.width, rect.height);

    particles = particles.filter(p => p.life > 0);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
      p.angle += p.spin;

      const progress = 1 - p.life / p.max;

      const fade =
        Math.min(1, p.life / 15) *
        Math.min(1, (p.max - p.life) / 5);

      fx.save();
      fx.globalAlpha = fade;
      fx.translate(p.x, p.y);
      fx.rotate(p.angle);

      if (p.kind === 'water') {

        // Water droplets

        fx.fillStyle = '#78c9ed';
        fx.beginPath();

        fx.ellipse(
          0, 0,
          p.size * .62,
          p.size * 1.12,
          0, 0, Math.PI * 2
        );

        fx.fill();

        fx.fillStyle = '#ffffff';
        fx.globalAlpha = fade * .75;

        fx.beginPath();
        fx.arc(
          -p.size * .18,
          -p.size * .32,
          Math.max(.7, p.size * .16),
          0,
          Math.PI * 2
        );

        fx.fill();

      } else if (p.kind === 'fire') {

        // Flickering flames

        const flicker =
          .72 + Math.sin((p.life + p.x) * .42) * .2;

        const h =
          p.size * (1.4 + progress * .65) * flicker;

        const grad = fx.createLinearGradient(
          0, -h, 0, p.size
        );

        grad.addColorStop(0, '#fff0a8');
        grad.addColorStop(.45, '#ffb36e');
        grad.addColorStop(1, '#f27d83');

        fx.fillStyle = grad;

        fx.beginPath();
        fx.moveTo(0, -h);

        fx.bezierCurveTo(
          p.size * 1.35, -h * .25,
          p.size * .85, p.size * .45,
          0, p.size
        );

        fx.bezierCurveTo(
          -p.size * .9, p.size * .35,
          -p.size * 1.1, -h * .2,
          0, -h
        );

        fx.fill();

      } else {

        // Starlight particles

        const pulse =
          .65 + Math.sin(p.life * .28 + p.phase) * .35;

        fx.strokeStyle = '#a996ed';
        fx.lineWidth = Math.max(1, p.size * .19);

        fx.beginPath();

        fx.moveTo(-p.size * pulse, 0);
        fx.lineTo(p.size * pulse, 0);

        fx.moveTo(0, -p.size * pulse);
        fx.lineTo(0, p.size * pulse);

        fx.stroke();

        fx.fillStyle = '#fff';
        fx.beginPath();

        fx.arc(0, 0, p.size * .22, 0, Math.PI * 2);
        fx.fill();
      }

      fx.restore();
    });

    // Expanding water ripple

    if (
      selectedEffect === 'water' &&
      particles.length &&
      effectOrigin
    ) {
      effectOrigin.age++;

      const age = Math.min(1, effectOrigin.age / 52);

      fx.save();

      fx.globalAlpha = Math.max(0, .3 - age * .3);
      fx.strokeStyle = '#8bd5f0';
      fx.lineWidth = 2;

      fx.beginPath();

      fx.ellipse(
        effectOrigin.x,
        effectOrigin.y,
        12 + age * 112,
        5 + age * 39,
        0, 0, Math.PI * 2
      );

      fx.stroke();
      fx.restore();
    }

    if (particles.length) {
      animationFrame = requestAnimationFrame(animateParticles);
    } else {
      fx.clearRect(0, 0, rect.width, rect.height);
    }
  }
function resetFrontendState() {
  // Clear the visual effects.
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  particles = [];
  effectOrigin = null;

  const rect = stage.getBoundingClientRect();
  fx.clearRect(0, 0, rect.width, rect.height);

  // Reset the session state.
  backgroundReady = false;
  gestureReady = false;
  cloakActive = false;

  // Reset the effect selection.
  chooseEffect(null);

  // Reset the camera-stage appearance.
  stageStatus.textContent = '✧ CLOAK IS RESTING';
  stageStatus.classList.remove('on');

  $('gestureToast').classList.remove('show');

  // Reset the guide.
  $('guideTip').textContent =
    "Mimi's tip: Keep your camera still after capturing the background!";

  setMessage('Fresh session started! Capture your empty background to begin again.');

  updateSteps();
}
  // ---------------- EVENT LISTENERS ----------------

  connectBtn.addEventListener('click', () => {
    stream ? disconnect() : connect();
  });

  backgroundBtn.addEventListener('click', () => {
    sendCommand('capture_background');
  });

  gestureBtn.addEventListener('click', () => {
    sendCommand('train_gesture');
  });


 resetBtn.addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setMessage('Please connect your camera before starting a fresh session.');
    return;
  }

  // Reset the interface immediately.
  resetFrontendState();

  // Reset the actual computer-vision session on the server.
  sendCommand('reset');
});

  soundBtn.addEventListener('click', () => {
    setSound(!soundEnabled);
  });

  soundInlineBtn.addEventListener('click', () => {
    setSound(!soundEnabled);
  });

  document.querySelectorAll('.effect-card').forEach(card => {
    card.addEventListener('click', () => {
      chooseEffect(card.dataset.effect);
    });
  });

  window.addEventListener('resize', resizeFx);

  window.addEventListener('beforeunload', () => {
    stopSending();

    if (socket) socket.close();

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });

  updateSteps();

})();
