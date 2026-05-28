export function setupCharacterModal() {
  const controls = document.getElementById('controls');
  const modal = document.createElement('div');
  modal.id = 'character-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px; width: 90%;">
      <span class="close" id="close-character-modal">&times;</span>
      <h2 style="margin-bottom: 16px; font-size: 1.4rem;">Choose Your Route</h2>

      <div class="checkbox-container" style="text-align: left; max-height: 380px; overflow-y: auto; padding: 12px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px; margin-bottom: 18px; box-sizing: border-box;">
        <div class="category-section" style="margin-bottom: 16px;">
          <div class="category-header" style="font-weight: bold; color: #646cff; border-bottom: 1px solid #333; margin-bottom: 10px; padding-bottom: 4px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Shortcuts</div>
          <label style="display: flex; align-items: center; margin: 8px 0; cursor: pointer; font-size: 0.95rem; user-select: none;">
            <input type="checkbox" value="all" class="character-checkbox" id="cb-all" style="margin-right: 10px; width: 16px; height: 16px; cursor: pointer;" checked /> <strong>Shizuku + Chitose</strong>
          </label>
        </div>

        <div class="category-section">
          <div class="category-header" style="font-weight: bold; color: #646cff; border-bottom: 1px solid #333; margin-bottom: 10px; padding-bottom: 4px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">Characters</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9rem; user-select: none;"><input type="checkbox" value="shizuku" class="route-cb" style="margin-right: 8px; width: 14px; height: 14px;" checked /> Shizuku</label>
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9rem; user-select: none;"><input type="checkbox" value="chitose" class="route-cb" style="margin-right: 8px; width: 14px; height: 14px;" checked /> Chitose</label>
          </div>
        </div>
      </div>

      <button id="character-modal-save" style="width: 100%; font-weight: bold; padding: 12px; border-radius: 6px;">Apply Selection</button>
    </div>
  `;
  document.body.appendChild(modal);

  const openBtn = document.createElement('button');
  openBtn.id = 'open-character-modal';
  openBtn.textContent = 'Choose Route';
  controls.insertBefore(openBtn, controls.firstChild);

  const characterSelector = document.getElementById('character-selector');
  if (characterSelector) characterSelector.style.display = 'none';

  openBtn.onclick = () => { modal.style.display = 'block'; };
  document.getElementById('close-character-modal').onclick = () => { modal.style.display = 'none'; };

  const cbAll = document.getElementById('cb-all');
  const routeCbs = document.querySelectorAll('.route-cb');

  cbAll.addEventListener('change', () => {
    const isChecked = cbAll.checked;
    routeCbs.forEach(cb => cb.checked = isChecked);
  });

  routeCbs.forEach(cb => {
    cb.addEventListener('change', () => {
      cbAll.checked = Array.from(routeCbs).every(option => option.checked);
    });
  });

  document.getElementById('character-modal-save').onclick = () => {
    const mainSelect = document.getElementById('character-select');
    Array.from(mainSelect.options).forEach(opt => opt.selected = false);

    const checkedValues = [];
    if (cbAll.checked) {
      checkedValues.push('all');
    } else {
      routeCbs.forEach(cb => {
        if (cb.checked) checkedValues.push(cb.value);
      });
    }

    checkedValues.forEach(val => {
      const match = Array.from(mainSelect.options).find(o => o.value === val);
      if (match) match.selected = true;
    });

    modal.style.display = 'none';
    mainSelect.dispatchEvent(new Event('change'));
  };

  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  };
}
