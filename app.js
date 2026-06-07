/* ==========================================================================
   AL-JOUFEH SCHOOLS FPV DRONE EXPERIENCE - LOGIC ENGINE
   - Multi-stage high-speed asset preloader (2880 frames from 13 clips)
   - High-performance responsive Canvas renderer
   - Inertial Scroll smoothing (Ease-out LERP)
   - Waypoint scroll indicators (Altitude & Speed estimation)
   - Custom Web Audio Cinematic Synth Engine
   - Scrubber synchronization & Autopilot auto-scroller
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. CONFIGURATION & STATE
    // ----------------------------------------------------------------------
    const TOTAL_FRAMES = 2880;
    const images = [];
    const frameIndex = { current: 1, target: 1 }; // Track current (interpolated) and target (scroll-mapped) frames

    const CLIPS = [
        { folder: "clip1", count: 210 },
        { folder: "clip2", count: 240 },
        { folder: "clip3", count: 210 },
        { folder: "clip4", count: 240 },
        { folder: "clip5", count: 210 },
        { folder: "clip6", count: 210 },
        { folder: "clip7", count: 210 },
        { folder: "clip8", count: 210 },
        { folder: "clip9", count: 210 },
        { folder: "clip10", count: 210 },
        { folder: "clip11", count: 240 },
        { folder: "clip12", count: 240 },
        { folder: "clip13", count: 240 }
    ];

    const padNumber = (num) => num.toString().padStart(3, '0');

    function getFramePath(globalIndex) {
        let accumulated = 0;
        for (let i = 0; i < CLIPS.length; i++) {
            const clip = CLIPS[i];
            if (globalIndex <= accumulated + clip.count) {
                const localIndex = globalIndex - accumulated;
                return `frames/${clip.folder}/ezgif-frame-${padNumber(localIndex)}.jpg`;
            }
            accumulated += clip.count;
        }
        return `frames/clip13/ezgif-frame-240.jpg`;
    }

    let isImagesLoaded = false;
    let autopilotActive = false;
    let autopilotInterval = null;
    let cinematicMode = false;
    let lastScrollY = window.scrollY;
    let currentSpeed = 0;
    let speedDecayTimeout = null;

    // DOM Elements
    const loader = document.getElementById('loader');
    const loaderBar = document.getElementById('loader-bar-fill');
    const loaderPercent = document.getElementById('loader-percentage');
    const loaderStatus = document.getElementById('loader-status');
    const canvas = document.getElementById('scroll-canvas');
    const ctx = canvas.getContext('2d');
    const scrollContainer = document.getElementById('scroll-container');
    const flightScrubber = document.getElementById('flight-scrubber');

    // HUD elements
    const hudAltitude = document.getElementById('hud-altitude');
    const hudSpeed = document.getElementById('hud-speed');
    const scrubberFrame = document.getElementById('scrubber-frame');
    const scrubberPercent = document.getElementById('scrubber-percent');
    const hudSchoolActive = document.getElementById('hud-school-active');

    // Waypoint text card elements mapped to clip frames
    const waypointCards = [
        { name: "مدارس لواء قصبة عمان", selector: '#section-waypoint-1 .waypoint-card' },
        { name: "مدرسة بدر الثانوية للبنات", selector: '#section-waypoint-2 .waypoint-card' },
        { name: "مدرسة الأمير محمد الأساسية للبنين", selector: '#section-waypoint-3 .waypoint-card' },
        { name: "مدرسة حفصة ام المؤمنين الاساسية", selector: '#section-waypoint-4 .waypoint-card' },
        { name: "مدرسة خديجة بنت خويلد الاساسية للبنات", selector: '#section-waypoint-5 .waypoint-card' },
        { name: "مدرسة مصعب بن عمير الاساسية للبنين", selector: '#section-waypoint-6 .waypoint-card' },
        { name: "مدرسة الأمير حسن الثانوية للبنين", selector: '#section-waypoint-7 .waypoint-card' },
        { name: "مدرسة جبل الجوفة الأساسية المختلطة", selector: '#section-waypoint-8 .waypoint-card' },
        { name: "مدرسة ابن خلدون الأساسية للبنين", selector: '#section-waypoint-9 .waypoint-card' },
        { name: "مدرسة حسن البرقاوي للبنين", selector: '#section-waypoint-10 .waypoint-card' },
        { name: "مدرسة امنة بنت وهب الأساسية", selector: '#section-waypoint-11 .waypoint-card' },
        { name: "مدرسة جعفر الطيار الثانوية للبنين", selector: '#section-waypoint-12 .waypoint-card' },
        { name: "مدرسة الأميرة هيا الأساسية المختلطة", selector: '#section-waypoint-13 .waypoint-card' }
    ];

    // Dynamic timing boundary calculation and section position caching
    let accumBoundaries = 0;
    waypointCards.forEach((cardObj, i) => {
        cardObj.card = document.querySelector(cardObj.selector);
        const clip = CLIPS[i];
        const clipStart = accumBoundaries + 1;
        const clipEnd = accumBoundaries + clip.count;

        if (i === 0) {
            cardObj.fadeInStart = 40;
            cardObj.fadeInEnd = 90;
            cardObj.fadeOutStart = 170;
            cardObj.fadeOutEnd = 210;
            cardObj.start = 40;
            cardObj.end = 210;
        } else {
            const isFirstSchool = (i === 1);
            const isLastSchool = (i === 12);
            const isLaterSchool = (i >= 7);

            // Determine fade start and end percentages
            let fadeStartPercent, fadeEndPercent;
            if (isFirstSchool) {
                // Bader appears a bit later for drone arrival
                fadeStartPercent = 0.35;
                fadeEndPercent = 0.55;
            } else if (isLastSchool) {
                // Princess Haya appears early in Clip 13 to fade out before gallery
                fadeStartPercent = 0.05;
                fadeEndPercent = 0.20;
            } else if (isLaterSchool) {
                fadeStartPercent = 0.20;
                fadeEndPercent = 0.40;
            } else {
                fadeStartPercent = 0.15;
                fadeEndPercent = 0.35;
            }

            cardObj.fadeInStart = clipStart + Math.floor(clip.count * fadeStartPercent);
            cardObj.fadeInEnd = clipStart + Math.floor(clip.count * fadeEndPercent);

            // Crossfade: Card i fades out during Card i+1's clip (spanning 15% to 35% of next clip)
            const nextClip = CLIPS[i + 1];
            if (nextClip) {
                const fadeOutStartPercent = 0.15;
                const fadeOutEndPercent = 0.35;

                cardObj.fadeOutStart = clipEnd + Math.floor(nextClip.count * fadeOutStartPercent);
                cardObj.fadeOutEnd = clipEnd + Math.floor(nextClip.count * fadeOutEndPercent);
            } else {
                // Last school (Princess Haya) fades out before the gallery enters (from 35% to 48% of Clip 13)
                cardObj.fadeOutStart = clipStart + Math.floor(clip.count * 0.35);
                cardObj.fadeOutEnd = clipStart + Math.floor(clip.count * 0.48);
            }

            cardObj.start = cardObj.fadeInStart;
            cardObj.end = cardObj.fadeOutEnd;
        }
        accumBoundaries += clip.count;
    });

    // Cache waypoint section offsets and heights for piecewise linear mapping
    let sectionPositions = [];

    function updateSectionPositions() {
        sectionPositions = [];
        let accumulatedFrames = 0;
        waypointCards.forEach((cardObj, i) => {
            const sectionEl = document.querySelector(cardObj.selector.split(' ')[0]);
            const clip = CLIPS[i];
            const clipStart = accumulatedFrames + 1;
            const clipEnd = accumulatedFrames + clip.count;
            accumulatedFrames += clip.count;

            if (sectionEl) {
                const start = sectionEl.offsetTop;
                const end = start + sectionEl.offsetHeight;
                sectionPositions.push({
                    start: start,
                    end: end,
                    clipStart: clipStart,
                    clipEnd: clipEnd
                });
            }
        });
    }

    // Piecewise mapping functions
    function getFrameIndexForScroll(y) {
        if (sectionPositions.length === 0) return 1;

        const firstSection = sectionPositions[0];
        // 1. Hero section
        if (y < firstSection.start) {
            const pct = y / firstSection.start;
            return 1 + pct * 39;
        }

        // 2. Section 1 (Intro)
        if (y >= firstSection.start && y < firstSection.end) {
            const pct = (y - firstSection.start) / (firstSection.end - firstSection.start);
            return 40 + pct * (210 - 40);
        }

        // 3. Waypoint sections 2 to 13
        for (let i = 1; i < sectionPositions.length; i++) {
            const pos = sectionPositions[i];
            if (y >= pos.start && y < pos.end) {
                const pct = (y - pos.start) / (pos.end - pos.start);
                return pos.clipStart + pct * (pos.clipEnd - pos.clipStart);
            }
        }

        // 4. Gallery section
        return TOTAL_FRAMES;
    }

    function getScrollForFrameIndex(f) {
        if (sectionPositions.length === 0) return 0;

        const firstSection = sectionPositions[0];

        // 1. Hero section frames (1 to 40)
        if (f < 40) {
            const pct = (f - 1) / 39;
            return pct * firstSection.start;
        }

        // 2. Section 1 (Intro) frames (40 to 210)
        if (f >= 40 && f < 210) {
            const pct = (f - 40) / (210 - 40);
            return firstSection.start + pct * (firstSection.end - firstSection.start);
        }

        // 3. Waypoint sections 2 to 13 frames
        for (let i = 1; i < sectionPositions.length; i++) {
            const pos = sectionPositions[i];
            if (f >= pos.clipStart && f <= pos.clipEnd) {
                const pct = (f - pos.clipStart) / (pos.clipEnd - pos.clipStart);
                return pos.start + pct * (pos.end - pos.start);
            }
        }

        // 4. Gallery section / end
        const lastSection = sectionPositions[sectionPositions.length - 1];
        return lastSection.end;
    }

    // Buttons
    const btnAudio = document.getElementById('btn-audio');
    const audioOffIcon = document.getElementById('svg-audio-off');
    const audioOnIcon = document.getElementById('svg-audio-on');
    const btnCinematic = document.getElementById('btn-cinematic');
    const btnAutopilot = document.getElementById('btn-autopilot');
    const playIcon = document.getElementById('svg-play');
    const pauseIcon = document.getElementById('svg-pause');
    const autopilotText = document.getElementById('autopilot-text');
    const btnReplay = document.getElementById('btn-replay');
    const controllerDeck = document.getElementById('hud-controller-deck');

    // ----------------------------------------------------------------------
    // 2. CANVAS VIEWPORT MATH (COVER STRETCH)
    // ----------------------------------------------------------------------
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;

        ctx.scale(dpr, dpr);

        // Redraw current frame immediately on resize
        if (isImagesLoaded && images[Math.floor(frameIndex.current)]) {
            drawFrame(Math.floor(frameIndex.current));
        }
    }

    function drawFrame(index) {
        const img = images[index];
        if (!img) return;

        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;

        // Keep the golden hour ratio (typically FPV drone video is 16:9)
        const imgRatio = img.width / img.height;
        const canvasRatio = canvasWidth / canvasHeight;

        let drawWidth, drawHeight, xOffset, yOffset;

        if (canvasRatio > imgRatio) {
            // Viewport is wider than image (cover style)
            drawWidth = canvasWidth;
            drawHeight = canvasWidth / imgRatio;
            xOffset = 0;
            yOffset = (canvasHeight - drawHeight) / 2;
        } else {
            // Viewport is taller than image
            drawWidth = canvasHeight * imgRatio;
            drawHeight = canvasHeight;
            xOffset = (canvasWidth - drawWidth) / 2;
            yOffset = 0;
        }

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(img, xOffset, yOffset, drawWidth, drawHeight);
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        updateSectionPositions();
    });

    // ----------------------------------------------------------------------
    // 3. FRAME PRELOAD ENGINE
    // ----------------------------------------------------------------------
    async function preloadImages() {
        let loadedCount = 0;
        const loadPromises = [];

        loaderStatus.innerText = 'Connecting to flight systems...';

        for (let i = 1; i <= TOTAL_FRAMES; i++) {
            const img = new Image();
            const frameSrc = getFramePath(i);

            const promise = new Promise((resolve) => {
                img.onload = () => {
                    loadedCount++;
                    const percent = Math.floor((loadedCount / TOTAL_FRAMES) * 100);

                    // Smooth loader indicators
                    loaderBar.style.width = `${percent}%`;
                    loaderPercent.innerText = `${percent}%`;

                    // Context-sensitive status messages
                     if (percent < 10) {
                        loaderStatus.innerText = 'Starting dive over Amman Kasabah district...';
                    } else if (percent < 20) {
                        loaderStatus.innerText = 'Sweeping Bader Secondary Girls ridge...';
                    } else if (percent < 30) {
                        loaderStatus.innerText = 'Approaching Prince Mohammad Basic Boys School...';
                    } else if (percent < 40) {
                        loaderStatus.innerText = 'Preloading Hafsa Um Al-Mo\'mineen Basic School...';
                    } else if (percent < 50) {
                        loaderStatus.innerText = 'Caching Khadija Bint Khuwaylid Basic Girls School...';
                    } else if (percent < 60) {
                        loaderStatus.innerText = 'Aligning Musa\'b Ben Omeer Basic Boys descent path...';
                    } else if (percent < 70) {
                        loaderStatus.innerText = 'Tracking Prince Hasan Secondary Boys campus...';
                    } else if (percent < 80) {
                        loaderStatus.innerText = 'Approaching Jabal Al-Joufeh Basic Mixed School...';
                    } else if (percent < 90) {
                        loaderStatus.innerText = 'Stabilizing over Ebn Khaldoun, Hasan Al-Barqawi, and Aminah Bint Wahb...';
                    } else if (percent < 98) {
                        loaderStatus.innerText = 'Final descent past Ja\'far Al-Tayyar and Princess Haya...';
                    } else {
                        loaderStatus.innerText = 'Preloading complete. Get ready to dive!';
                    }

                    resolve();
                };
                img.onerror = () => {
                    console.error(`Error preloading frame: ${frameSrc}`);
                    // Resolve anyway to keep progress moving
                    resolve();
                };
                img.src = frameSrc;
                images[i] = img;
            });
            loadPromises.push(promise);
        }

        await Promise.all(loadPromises);
        isImagesLoaded = true;

        // Breathtaking fade-out effect for loader
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                // Fire up initial canvas resize and first frame draw
                resizeCanvas();
                updateSectionPositions();
                animate();
            }, 800);
        }, 1000);
    }

    // ----------------------------------------------------------------------
    // 4. METRIC ESTIMATORS (ALTITUDE & SPEED)
    // ----------------------------------------------------------------------
    function estimateAltitude(frameIndex) {
        // Start at 850m, dive down to 600m smoothly
        const t = (frameIndex - 1) / (TOTAL_FRAMES - 1);
        const wave = Math.sin(t * Math.PI * 4) * 8;
        return Math.round(850 - t * 250 + wave);
    }

    function calculateScrollSpeed(currentScrollY) {
        const delta = Math.abs(currentScrollY - lastScrollY);
        lastScrollY = currentScrollY;

        // Convert pixel delta into dynamic km/h estimation
        const speedTarget = Math.min(Math.round(delta * 0.85), 94); // Speed capped at 94km/h FPV flight speed

        // Easing interpolation for speed indicator
        currentSpeed += (speedTarget - currentSpeed) * 0.15;
        hudSpeed.innerText = `${Math.round(currentSpeed)} km/h`;

        // Naturally decay speed to zero if no scrolling occurs
        clearTimeout(speedDecayTimeout);
        speedDecayTimeout = setTimeout(() => {
            currentSpeed = 0;
            hudSpeed.innerText = `0 km/h`;
        }, 150);
    }

    // ----------------------------------------------------------------------
    // 5. INTERPOLATED ANIMATION LOOP (LERP)
    // ----------------------------------------------------------------------
    function updateWaypoints(activeFrame) {
        let activeSchoolName = "FLIGHT LOG ACTIVE";
        waypointCards.forEach((cardObj, i) => {
            if (!cardObj.card) return;

            let opacity = 0;
            if (activeFrame >= cardObj.fadeInStart && activeFrame <= cardObj.fadeOutEnd) {
                if (activeFrame < cardObj.fadeInEnd) {
                    const t = (activeFrame - cardObj.fadeInStart) / (cardObj.fadeInEnd - cardObj.fadeInStart);
                    opacity = Math.max(0, Math.min(t, 1));
                } else if (activeFrame < cardObj.fadeOutStart) {
                    opacity = 1;
                } else {
                    const t = (activeFrame - cardObj.fadeOutStart) / (cardObj.fadeOutEnd - cardObj.fadeOutStart);
                    opacity = Math.max(0, Math.min(1 - t, 1));
                }
            }

            // Apply smooth opacity
            cardObj.card.style.opacity = opacity;

            // Apply smooth translateY transform with cubic Hermite curve easing
            const easedOpacity = opacity * opacity * (3 - 2 * opacity);
            // Slower, smoother slide up motion (reduced from 40px to 25px for a more subtle rise)
            const translateY = (1 - easedOpacity) * 25;
            cardObj.card.style.transform = `translateY(${translateY}px)`;

            // Symmetrically toggle pointer-events to prevent invisible elements blocking clicks
            if (opacity > 0.1) {
                cardObj.card.style.pointerEvents = 'auto';
            } else {
                cardObj.card.style.pointerEvents = 'none';
            }

            // Set HUD active name
            if (activeFrame >= cardObj.fadeInEnd && activeFrame <= cardObj.fadeOutStart) {
                activeSchoolName = `DIVE POINT: ${cardObj.name.toUpperCase()}`;
            }
        });

        if (hudSchoolActive) {
            hudSchoolActive.innerText = activeSchoolName;
        }
    }

    function animate() {
        // Linear Interpolation (LERP) for silky-smooth motion (increased to 0.12 for enhanced responsiveness)
        const lerpFactor = 0.12;
        const delta = frameIndex.target - frameIndex.current;

        if (Math.abs(delta) > 0.01) {
            frameIndex.current += delta * lerpFactor;

            // Boundary constraints
            if (frameIndex.current < 1) frameIndex.current = 1;
            if (frameIndex.current > TOTAL_FRAMES) frameIndex.current = TOTAL_FRAMES;

            const roundedFrame = Math.round(frameIndex.current);
            drawFrame(roundedFrame);

            // Synchronize HUD elements
            scrubberFrame.innerText = `FRAME ${roundedFrame.toString().padStart(3, '0')}`;
            flightScrubber.value = roundedFrame;

            const pct = Math.floor(((roundedFrame - 1) / (TOTAL_FRAMES - 1)) * 100);
            scrubberPercent.innerText = `${pct}% DIVE`;

            // Live metrics
            hudAltitude.innerText = `${estimateAltitude(roundedFrame)}m`;
            updateWaypoints(roundedFrame);
        }

        requestAnimationFrame(animate);
    }

    // ----------------------------------------------------------------------
    // 6. NATIVE SCROLL SYNC
    // ----------------------------------------------------------------------
    window.addEventListener('scroll', () => {
        if (!isImagesLoaded) return;

        const currentScroll = window.scrollY;

        calculateScrollSpeed(currentScroll);

        frameIndex.target = getFrameIndexForScroll(currentScroll);
    });

    // ----------------------------------------------------------------------
    // 7. DRAGGABLE SCRUBBER CONTROLLER
    // ----------------------------------------------------------------------
    flightScrubber.addEventListener('input', (e) => {
        if (!isImagesLoaded) return;

        // Pause Auto-pilot immediately if scrubbing
        if (autopilotActive) {
            toggleAutopilot(false);
        }

        const value = parseInt(e.target.value);
        frameIndex.target = value;

        // Force scroll container to scroll to the corresponding ratio
        const targetScroll = getScrollForFrameIndex(value);

        window.scrollTo({
            top: targetScroll,
            behavior: 'auto' // Instant update for real-time scrubber response
        });
    });

    // ----------------------------------------------------------------------
    // 8. AUTO-PILOT TOUR (AUTO-SCROLL)
    // ----------------------------------------------------------------------
    function toggleAutopilot(forceState = null) {
        const nextState = forceState !== null ? forceState : !autopilotActive;

        if (nextState === autopilotActive) return;
        autopilotActive = nextState;

        if (autopilotActive) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            autopilotText.innerText = 'AUTOPILOT: ON';
            btnAutopilot.classList.add('btn-accent');

            // Autopilot Scroll Tick Loop (smooth linear scrolling)
            const speed = 6; // Pixels per frame step
            autopilotInterval = setInterval(() => {
                const currentScroll = window.scrollY;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

                if (currentScroll >= maxScroll - 6) {
                    // Loop completed - land and switch off
                    toggleAutopilot(false);
                    return;
                }

                window.scrollTo(0, currentScroll + speed);
            }, 16);
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            autopilotText.innerText = 'AUTO-PILOT';
            btnAutopilot.classList.remove('btn-accent');

            clearInterval(autopilotInterval);
        }
    }

    btnAutopilot.addEventListener('click', () => toggleAutopilot());

    // Pause autopilot on manual wheel user input
    window.addEventListener('wheel', () => {
        if (autopilotActive) toggleAutopilot(false);
    });
    window.addEventListener('touchmove', () => {
        if (autopilotActive) toggleAutopilot(false);
    });

    // Replay button logic
    btnReplay.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        setTimeout(() => {
            toggleAutopilot(true);
        }, 800);
    });

    // ----------------------------------------------------------------------
    // 9. WEB AUDIO AMBIENT SYNTH ENGINE (PREMIUM ATMOSPHERE)
    // ----------------------------------------------------------------------
    let audioCtx = null;
    let masterGain = null;
    let activeOscillators = [];
    let windNoiseNode = null;
    let isPlayingAudio = false;

    function initSynth() {
        // Create Audio Context
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();

        // Master volume node
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);

        // --- SUB BASS LAYER (C2 - 65.4Hz) ---
        const oscSub = audioCtx.createOscillator();
        oscSub.type = 'triangle';
        oscSub.frequency.setValueAtTime(65.4, audioCtx.currentTime); // Deep sunset hum
        const subGain = audioCtx.createGain();
        subGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        oscSub.connect(subGain);
        subGain.connect(masterGain);
        oscSub.start();
        activeOscillators.push(oscSub);

        // --- MIDDLE FIFTH PAD LAYER (G2 - 98Hz) ---
        const oscMid = audioCtx.createOscillator();
        oscMid.type = 'triangle';
        oscMid.frequency.setValueAtTime(98.0, audioCtx.currentTime); // Chord fifth harmony
        const midGain = audioCtx.createGain();
        midGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        oscMid.connect(midGain);
        midGain.connect(masterGain);
        oscMid.start();
        activeOscillators.push(oscMid);

        // --- AMBIENT WIND GENERATOR (WHITE NOISE + FILTER EXPANSION) ---
        const bufferSize = audioCtx.sampleRate * 2; // 2 seconds of noise buffer
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const outputData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            outputData[i] = Math.random() * 2 - 1; // Pure white noise
        }

        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        // Custom Wind Sweep Filter
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(350, audioCtx.currentTime);
        filter.Q.setValueAtTime(2.0, audioCtx.currentTime);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

        // Animate/Modulate filter cutoff via LFO to recreate gusts of mountain wind
        const windLfo = audioCtx.createOscillator();
        windLfo.frequency.setValueAtTime(0.08, audioCtx.currentTime); // 12 seconds per wave period
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.setValueAtTime(180, audioCtx.currentTime); // Filter sweep depth

        windLfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGain);

        windLfo.start();
        noiseSource.start();

        activeOscillators.push(windLfo);
        windNoiseNode = noiseSource;
    }

    function toggleAudio() {
        if (!audioCtx) {
            initSynth();
        }

        if (isPlayingAudio) {
            // Fade out smoothly
            masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
            if (audioOffIcon) audioOffIcon.classList.remove('hidden');
            if (audioOnIcon) audioOnIcon.classList.add('hidden');
            if (btnAudio) btnAudio.classList.remove('btn-accent');
            isPlayingAudio = false;
        } else {
            // Resume if suspended (browser audio safety policy)
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            // Fade in smoothly
            masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
            masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
            masterGain.gain.linearRampToValueAtTime(0.8, audioCtx.currentTime + 1.5);
            if (audioOffIcon) audioOffIcon.classList.add('hidden');
            if (audioOnIcon) audioOnIcon.classList.remove('hidden');
            if (btnAudio) btnAudio.classList.add('btn-accent');
            isPlayingAudio = true;
        }
    }

    if (btnAudio) {
        btnAudio.addEventListener('click', toggleAudio);
    }

    // ----------------------------------------------------------------------
    // 10. CINEMATIC OVERLAY MANAGER
    // ----------------------------------------------------------------------
    if (btnCinematic) {
        btnCinematic.addEventListener('click', () => {
            cinematicMode = !cinematicMode;

            const topHeader = document.querySelector('.systems-hud-header');
            const scrollWaypointCards = document.querySelectorAll('.waypoint-card');
            const heroPanel = document.getElementById('hero-card-panel');

            if (cinematicMode) {
                btnCinematic.classList.add('btn-accent');
                topHeader.style.transform = 'translateY(-100px)';
                topHeader.style.opacity = '0';

                scrollWaypointCards.forEach(card => {
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(40px)';
                });
                if (heroPanel) {
                    heroPanel.style.opacity = '0';
                    heroPanel.style.transform = 'translateY(40px)';
                }

                // Dim controller deck slightly, keeping it visible but unobtrusive
                controllerDeck.style.opacity = '0.25';
                controllerDeck.addEventListener('mouseenter', restoreControllerOpacity);
                controllerDeck.addEventListener('mouseleave', dimControllerOpacity);
            } else {
                btnCinematic.classList.remove('btn-accent');
                topHeader.style.transform = 'translateY(0)';
                topHeader.style.opacity = '1';

                // Re-sync waypoint statuses instantly
                updateWaypoints(Math.round(frameIndex.current));
                if (heroPanel && Math.round(frameIndex.current) <= 210) {
                    heroPanel.style.opacity = '1';
                    heroPanel.style.transform = 'translateY(0)';
                }

                controllerDeck.style.opacity = '1';
                controllerDeck.removeEventListener('mouseenter', restoreControllerOpacity);
                controllerDeck.removeEventListener('mouseleave', dimControllerOpacity);
            }
        });
    }

    function restoreControllerOpacity() {
        controllerDeck.style.opacity = '0.9';
    }

    function dimControllerOpacity() {
        controllerDeck.style.opacity = '0.25';
    }

    // ----------------------------------------------------------------------
    // 11. DIRECTORY CLICK NAVIGATION
    // ----------------------------------------------------------------------
    const schoolNavCards = document.querySelectorAll('.school-nav-card');

    schoolNavCards.forEach((card) => {
        const handleNavigate = () => {
            const index = parseInt(card.getAttribute('data-school-index'));
            const school = waypointCards[index];
            if (!school) return;

            // Turn off Autopilot immediately if active to allow manual dive
            if (autopilotActive) {
                toggleAutopilot(false);
            }

            // Calculate precise scroll target for this school
            const middleFrame = (school.start + school.end) / 2;
            const targetScroll = getScrollForFrameIndex(middleFrame);

            // Trigger a breathtaking cinematic smooth scroll to the school's FPV frame coordinates
            window.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        };

        // Click support
        card.addEventListener('click', handleNavigate);

        // Accessibility / Keyboard support
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNavigate();
            }
        });
    });
    // Directory button smooth scroll
    const btnDirectory = document.getElementById('btn-directory');
    if (btnDirectory) {
        btnDirectory.addEventListener('click', () => {
            const gallerySection = document.getElementById('section-gallery');
            if (gallerySection) {
                if (autopilotActive) {
                    toggleAutopilot(false);
                }
                gallerySection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // ----------------------------------------------------------------------
    // 12. BOOTSTRAP INITIALIZATION
    // ----------------------------------------------------------------------
    preloadImages();
});
