/**
 * Live2D Speaking Avatar Integration Helper
 * Utilizing PIXI.js, pixi-live2d-display, and Web Audio API
 */

// Bind PIXI globally so that pixi-live2d-display can discover it under ES module scopes
if (typeof window !== "undefined" && typeof PIXI !== "undefined") {
  window.PIXI = PIXI;
}

export async function initLive2DAvatar(audioPlayer) {
  console.log("🎬 Initializing Dual Live2D Speaking Avatars...");

  const models = [
    {
      id: "left",
      canvasId: "live2d-left",
      url: "https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@latest/assets/shizuku.model.json",
      scale: 0.9,
      offsetY: 20
    },
    {
      id: "right",
      canvasId: "live2d-right",
      url: "https://cdn.jsdelivr.net/npm/live2d-widget-model-chitose@latest/assets/chitose.model.json",
      scale: 0.85,
      offsetY: 40
    }
  ];

  const instances = {};

  for (const modelConfig of models) {
    const canvas = document.getElementById(modelConfig.canvasId);
    if (!canvas) {
      console.warn(`❌ Canvas ${modelConfig.canvasId} not found!`);
      continue;
    }

    try {
      const app = new PIXI.Application({
        view: canvas,
        transparent: true,
        backgroundAlpha: 0,
        autoStart: true,
        antialias: true,
        width: 320,
        height: 400,
      });

      console.log(`📡 Loading model: ${modelConfig.id}...`);
      const model = await PIXI.live2d.Live2DModel.from(modelConfig.url);
      app.stage.addChild(model);

      // Scale and position
      const scaleX = 320 / model.width;
      const scaleY = 400 / model.height;
      const finalScale = Math.min(scaleX, scaleY) * modelConfig.scale;
      model.scale.set(finalScale);
      model.x = (320 - model.width) / 2;
      model.y = (400 - model.height) / 2 + modelConfig.offsetY;

      instances[modelConfig.id] = { model, canvas };

      // Mouth Sync Hook
      let smoothedVolume = 0;
      const originalInternalUpdate = model.internalModel.update;
      model.internalModel.update = function() {
        originalInternalUpdate.apply(this, arguments);
        
        // Only sync mouth if this character is currently focused/speaking
        const slot = canvas.closest('.character-slot');
        const isActive = slot.classList.contains('active');
        const isUser = slot.id === 'char-right';
        
        let rawVolume = 0;
        if (isActive) {
          rawVolume = isUser ? (audioPlayer ? audioPlayer.getInputVolume() : 0) : (audioPlayer ? audioPlayer.getVolume() : 0);
        }
        
        const targetMouthOpen = Math.min(rawVolume * 15.0, 1.0);
        smoothedVolume += (targetMouthOpen - smoothedVolume) * 0.35;

        const core = model.internalModel.coreModel;
        if (core) {
          const val = smoothedVolume;
          if (typeof core.setParameterValue === "function") {
            core.setParameterValue("ParamMouthOpenY", val);
            core.setParameterValue("PARAM_MOUTH_OPEN_Y", val);
          } else if (typeof core.setParamFloat === "function") {
            core.setParamFloat("ParamMouthOpenY", val);
            core.setParamFloat("PARAM_MOUTH_OPEN_Y", val);
          }
        }
      };

      console.log(`🟢 ${modelConfig.id} model loaded!`);
    } catch (err) {
      console.error(`⚠️ Failed to load ${modelConfig.id}:`, err);
    }
  }

  // Global mouse follow
  window.addEventListener("mousemove", (event) => {
    Object.values(instances).forEach(({ model }) => {
      if (model && typeof model.focus === "function") {
        model.focus(event.clientX, event.clientY);
      }
    });
  });

  return instances;
}
