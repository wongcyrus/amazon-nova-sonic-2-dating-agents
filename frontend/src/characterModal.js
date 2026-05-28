function getCurrentRouteValue(mainSelect) {
  const selected = Array.from(mainSelect.selectedOptions).map((opt) => opt.value);
  if (selected.includes("chitose") && !selected.includes("shizuku")) {
    return "chitose";
  }
  return "shizuku";
}

export function setupCharacterModal() {
  const controls = document.getElementById("controls");
  const mainSelect = document.getElementById("character-select");
  if (!controls || !mainSelect) return;

  const modal = document.createElement("div");
  modal.id = "character-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 440px; width: 92%;">
      <span class="close" id="close-character-modal">&times;</span>
      <h2 style="margin-bottom: 10px; font-size: 1.35rem;">Who do you want to talk to?</h2>
      <p style="margin: 0 0 16px; color: #cfcfcf; line-height: 1.5;">
        Pick one route for the scene. The game focuses on one character at a time.
      </p>

      <div style="display: grid; gap: 12px; text-align: left; margin-bottom: 18px;">
        <label style="display: block; border: 1px solid #444; border-radius: 10px; padding: 14px; cursor: pointer; background: #1a1a1a;">
          <input type="radio" name="route-choice" value="shizuku" style="margin-right: 10px;" checked />
          <strong>Shizuku Route</strong>
          <div style="margin-top: 6px; color: #b8b8b8; font-size: 0.92rem;">
            A one-on-one scene focused only on Shizuku.
          </div>
        </label>

        <label style="display: block; border: 1px solid #444; border-radius: 10px; padding: 14px; cursor: pointer; background: #1a1a1a;">
          <input type="radio" name="route-choice" value="chitose" style="margin-right: 10px;" />
          <strong>Chitose Route</strong>
          <div style="margin-top: 6px; color: #b8b8b8; font-size: 0.92rem;">
            A one-on-one scene focused only on Chitose.
          </div>
        </label>
      </div>

      <button id="character-modal-save" style="width: 100%; font-weight: bold; padding: 12px; border-radius: 6px;">Use This Route</button>
    </div>
  `;
  document.body.appendChild(modal);

  const openBtn = document.createElement("button");
  openBtn.id = "open-character-modal";
  openBtn.textContent = "Choose Route";
  controls.insertBefore(openBtn, controls.firstChild);

  const characterSelector = document.getElementById("character-selector");
  if (characterSelector) characterSelector.style.display = "none";

  const closeModal = () => {
    modal.style.display = "none";
  };

  const syncModalFromCurrentSelection = () => {
    const currentValue = getCurrentRouteValue(mainSelect);
    const radio = modal.querySelector(`input[name="route-choice"][value="${currentValue}"]`);
    if (radio) {
      radio.checked = true;
    }
  };

  openBtn.onclick = () => {
    syncModalFromCurrentSelection();
    modal.style.display = "block";
  };

  document.getElementById("close-character-modal").onclick = closeModal;

  document.getElementById("character-modal-save").onclick = () => {
    const selectedRoute = modal.querySelector('input[name="route-choice"]:checked')?.value || "shizuku";

    Array.from(mainSelect.options).forEach((opt) => {
      opt.selected = opt.value === selectedRoute;
    });

    closeModal();
    mainSelect.dispatchEvent(new Event("change"));
  };

  window.onclick = function (event) {
    if (event.target === modal) {
      closeModal();
    }
  };
}
