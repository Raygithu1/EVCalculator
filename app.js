/* ==========================================================================
   FIAT 500e CHARGE CALCULATOR - APPLICATION LOGIC (app.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements - Inputs
    const socSlider = document.getElementById('soc-slider');
    const socInput = document.getElementById('soc-input');
    const speedSlider = document.getElementById('speed-slider');
    const speedInput = document.getElementById('speed-input');
    const presetChips = document.querySelectorAll('.preset-chip');
    
    // UI Elements - Advanced Settings
    const batteryPresets = document.querySelectorAll('input[name="battery-preset"]');
    const customCapacityContainer = document.getElementById('custom-capacity-container');
    const customUsableInput = document.getElementById('custom-usable-input');
    const startNowBtn = document.getElementById('start-now-btn');
    const startDelayedBtn = document.getElementById('start-delayed-btn');
    const delayedTimeWrapper = document.getElementById('delayed-time-picker-wrapper');
    const delayedTimeInput = document.getElementById('delayed-time-input');
    const efficiencySlider = document.getElementById('efficiency-slider');
    const efficiencyInput = document.getElementById('efficiency-input');
    const settingsAccordion = document.getElementById('settings-accordion');
    
    // UI Elements - Visualizers
    const ringProgress = document.getElementById('ring-progress');
    const batteryFillBar = document.getElementById('battery-fill-bar');
    const currentSocNumber = document.getElementById('current-soc-number');
    const statusDesc = document.getElementById('status-desc');
    
    // UI Elements - Output Target Cards
    const targets = {
        80: {
            card: document.querySelector('.target-80'),
            time: document.getElementById('time-80'),
            ready: document.getElementById('ready-80'),
            energy: document.getElementById('energy-80')
        },
        90: {
            card: document.querySelector('.target-90'),
            time: document.getElementById('time-90'),
            ready: document.getElementById('ready-90'),
            energy: document.getElementById('energy-90')
        },
        100: {
            card: document.querySelector('.target-100'),
            time: document.getElementById('time-100'),
            ready: document.getElementById('ready-100'),
            energy: document.getElementById('energy-100')
        }
    };
    
    // Action Buttons
    const copyBtns = document.querySelectorAll('.btn-copy');
    const calendarBtns = document.querySelectorAll('.btn-calendar');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Global state object
    const state = {
        currentSoC: 10,
        chargingSpeed: 6.0,
        batteryPreset: '42', // '42', '23.8', or 'custom'
        customUsableCapacity: 37.3,
        startMode: 'now', // 'now' or 'delayed'
        delayedStartTime: '', // HH:MM string
        efficiency: 95
    };

    // Initialize Delayed Start Time Picker to current time
    function initTimePicker() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        delayedTimeInput.value = `${hrs}:${mins}`;
        state.delayedStartTime = `${hrs}:${mins}`;
    }

    // Usable capacities corresponding to presets
    function getUsableCapacity() {
        if (state.batteryPreset === '42') {
            return 37.3; // Fiat 500e 42 kWh total (37.3 kWh usable)
        } else if (state.batteryPreset === '23.8') {
            return 21.3; // Fiat 500e 23.8 kWh total (21.3 kWh usable)
        } else {
            return parseFloat(state.customUsableCapacity) || 37.3;
        }
    }

    // Update battery status texts and colors based on charge
    function updateVisualizers() {
        const soc = state.currentSoC;
        
        // 1. Update text percentage
        currentSocNumber.textContent = soc;
        
        // 2. Update battery bar fill height
        batteryFillBar.style.height = `${soc}%`;
        
        // 3. Update battery bar color class
        batteryFillBar.className = 'battery-fill'; // reset classes
        if (soc < 20) {
            batteryFillBar.classList.add('low');
            statusDesc.textContent = 'Low Charge';
        } else if (soc < 50) {
            batteryFillBar.classList.add('medium');
            statusDesc.textContent = 'Medium Charge';
        } else if (soc < 80) {
            batteryFillBar.classList.add('high');
            statusDesc.textContent = 'High Charge';
        } else if (soc < 100) {
            batteryFillBar.classList.add('optimal');
            statusDesc.textContent = 'Optimal Daily Limit';
        } else {
            batteryFillBar.classList.add('optimal');
            statusDesc.textContent = 'Fully Charged';
        }

        // 4. Update Ring Dashboard progress SVG
        // Circ = 2 * PI * r = 2 * 3.14159 * 44 = 276.46
        const circumference = 276;
        const offset = circumference - (soc / 100) * circumference;
        ringProgress.style.strokeDashoffset = offset;
    }

    // Helper: Formats AM/PM time with Today/Tomorrow tags
    function formatReadyTime(targetDate, baseDate) {
        let hours = targetDate.getHours();
        const minutes = String(targetDate.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 hour should be 12
        
        // Check days difference
        const baseDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
        const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const diffTime = targetDay - baseDay;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        let dayLabel = ' (Today)';
        if (diffDays === 1) {
            dayLabel = ' (Tomorrow)';
        } else if (diffDays > 1) {
            dayLabel = ` (+${diffDays} Days)`;
        }
        
        return `${hours}:${minutes} ${ampm}${dayLabel}`;
    }

    // Helper: Formats UTC string for ICS file (iCalendar)
    function getUtcIcsString(date) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        const h = String(date.getUTCHours()).padStart(2, '0');
        const min = String(date.getUTCMinutes()).padStart(2, '0');
        const s = String(date.getUTCSeconds()).padStart(2, '0');
        return `${y}${m}${d}T${h}${min}${s}Z`;
    }

    // Calculate charge times for 80%, 90%, and 100%
    function calculate() {
        const capacity = getUsableCapacity();
        const current = state.currentSoC;
        const speed = state.chargingSpeed;
        const efficiency = state.efficiency / 100;
        
        // Determine charging start datetime
        let startTime = new Date();
        if (state.startMode === 'delayed' && state.delayedStartTime) {
            const [h, m] = state.delayedStartTime.split(':').map(Number);
            startTime.setHours(h, m, 0, 0);
            
            // If the set time is in the past for today, assume it is for tomorrow
            if (startTime.getTime() < Date.now()) {
                startTime.setDate(startTime.getDate() + 1);
            }
        }
        
        // Loop over the output targets
        [80, 90, 100].forEach(target => {
            const targetData = targets[target];
            
            if (current >= target) {
                targetData.time.textContent = '0h 0m';
                targetData.ready.textContent = state.startMode === 'now' ? 'Ready Now' : formatReadyTime(startTime, new Date());
                targetData.energy.textContent = '0.0 kWh';
                targetData.card.classList.remove('active-target');
                targetData.card.classList.add('disabled-target');
                return;
            }
            
            targetData.card.classList.remove('disabled-target');
            if (target === 80) {
                targetData.card.classList.add('active-target'); // default highlights the 80% health card
            }
            
            // Math calculations
            const energyNeeded = capacity * ((target - current) / 100);
            const effectiveSpeed = speed * efficiency;
            let chargeTimeHours = energyNeeded / effectiveSpeed;
            
            // Add trickle/balancing padding of 15 mins (0.25 hrs) for a full 100% charge
            if (target === 100) {
                chargeTimeHours += 0.25;
            }
            
            const hours = Math.floor(chargeTimeHours);
            const minutes = Math.round((chargeTimeHours - hours) * 60);
            
            // Handle round-ups to 60 minutes
            let finalHours = hours;
            let finalMinutes = minutes;
            if (finalMinutes === 60) {
                finalHours += 1;
                finalMinutes = 0;
            }
            
            // Display formatted charging duration
            targetData.time.textContent = `${finalHours}h ${finalMinutes}m`;
            
            // Display energy to add
            targetData.energy.textContent = `${energyNeeded.toFixed(1)} kWh`;
            
            // Calculate completion timestamp
            const msToAdd = Math.round(chargeTimeHours * 60 * 60 * 1000);
            const completionDate = new Date(startTime.getTime() + msToAdd);
            
            // Display ready by
            targetData.ready.textContent = formatReadyTime(completionDate, new Date());
            
            // Cache target timestamps in DOM nodes for Action Buttons
            targetData.card.dataset.completionMs = completionDate.getTime();
            targetData.card.dataset.startTimeMs = startTime.getTime();
            targetData.card.dataset.energyKwh = energyNeeded.toFixed(1);
            targetData.card.dataset.hours = finalHours;
            targetData.card.dataset.minutes = finalMinutes;
        });
    }

    // Sync input sliders and textboxes
    function setupInputs() {
        // Current SoC slider & input sync
        socSlider.addEventListener('input', (e) => {
            state.currentSoC = parseInt(e.target.value);
            socInput.value = state.currentSoC;
            updateVisualizers();
            calculate();
        });
        
        socInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val)) val = 24;
            if (val < 0) val = 0;
            if (val > 100) val = 100;
            
            state.currentSoC = val;
            socInput.value = val;
            socSlider.value = val;
            updateVisualizers();
            calculate();
        });
        
        // Speed slider & input sync
        speedSlider.addEventListener('input', (e) => {
            state.chargingSpeed = parseFloat(e.target.value);
            speedInput.value = state.chargingSpeed.toFixed(1);
            updatePresetChipsActive();
            calculate();
        });
        
        speedInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 7.4;
            if (val < 1.0) val = 1.0;
            if (val > 11.0) val = 11.0;
            
            state.chargingSpeed = val;
            speedInput.value = val.toFixed(1);
            speedSlider.value = val;
            updatePresetChipsActive();
            calculate();
        });
        
        // Speed Presets selection
        presetChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const speed = parseFloat(chip.dataset.speed);
                state.chargingSpeed = speed;
                speedSlider.value = speed;
                speedInput.value = speed.toFixed(1);
                
                presetChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                calculate();
            });
        });
        
        // Check active chips on manual adjustments
        function updatePresetChipsActive() {
            presetChips.forEach(chip => {
                const chipSpeed = parseFloat(chip.dataset.speed);
                if (Math.abs(chipSpeed - state.chargingSpeed) < 0.05) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        }

        // Advanced - Battery Capacity Presets
        batteryPresets.forEach(preset => {
            preset.addEventListener('change', (e) => {
                state.batteryPreset = e.target.value;
                
                // Toggle active classes on radio selection cards
                document.querySelectorAll('.radio-card').forEach(card => card.classList.remove('active'));
                preset.closest('.radio-card').classList.add('active');
                
                if (state.batteryPreset === 'custom') {
                    customCapacityContainer.classList.remove('hidden');
                } else {
                    customCapacityContainer.classList.add('hidden');
                }
                
                calculate();
            });
        });
        
        // Advanced - Custom capacity textbox
        customUsableInput.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 37.3;
            state.customUsableCapacity = val;
            customUsableInput.value = val.toFixed(1);
            calculate();
        });
        
        // Advanced - Start Time toggles
        startNowBtn.addEventListener('click', () => {
            state.startMode = 'now';
            startNowBtn.classList.add('active');
            startDelayedBtn.classList.remove('active');
            delayedTimeWrapper.classList.add('hidden');
            calculate();
        });
        
        startDelayedBtn.addEventListener('click', () => {
            state.startMode = 'delayed';
            startDelayedBtn.classList.add('active');
            startNowBtn.classList.remove('active');
            delayedTimeWrapper.classList.remove('hidden');
            calculate();
        });
        
        // Advanced - Delayed Start Input
        delayedTimeInput.addEventListener('change', (e) => {
            state.delayedStartTime = e.target.value;
            calculate();
        });
        
        // Advanced - Efficiency Slider & Input sync
        efficiencySlider.addEventListener('input', (e) => {
            state.efficiency = parseInt(e.target.value);
            efficiencyInput.value = state.efficiency;
            calculate();
        });
        
        efficiencyInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val)) val = 90;
            if (val < 70) val = 70;
            if (val > 100) val = 100;
            
            state.efficiency = val;
            efficiencyInput.value = val;
            efficiencySlider.value = val;
            calculate();
        });
    }

    // Clipboard Copy Helper
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.remove('hidden');
        
        // Fade in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 10);
        
        // Fade out
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 300);
        }, 2000);
    }

    // Action Logic: Copy Details
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const targetCard = document.querySelector(`.target-${target}`);
            
            const hours = targetCard.dataset.hours;
            const minutes = targetCard.dataset.minutes;
            const readyStr = document.getElementById(`ready-${target}`).textContent;
            const energy = targetCard.dataset.energyKwh;
            
            if (parseInt(hours) === 0 && parseInt(minutes) === 0) {
                showToast(`Already charged to ${target}%!`);
                return;
            }
            
            const text = `Fiat 500e Charging Estimate:\n` +
                         `- Target: ${target}%\n` +
                         `- Ready by: ${readyStr}\n` +
                         `- Charging speed: ${state.chargingSpeed} kW (${state.efficiency}% efficiency)\n` +
                         `- Time remaining: ${hours}h ${minutes}m\n` +
                         `- Energy to add: ${energy} kWh`;
                         
            navigator.clipboard.writeText(text)
                .then(() => showToast(`Copied ${target}% charge details!`))
                .catch(() => showToast('Failed to copy to clipboard.'));
        });
    });

    // Action Logic: Calendar Event creation (.ics)
    calendarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const targetCard = document.querySelector(`.target-${target}`);
            
            const completionMs = targetCard.dataset.completionMs;
            const startTimeMs = targetCard.dataset.startTimeMs;
            const hours = targetCard.dataset.hours;
            const minutes = targetCard.dataset.minutes;
            
            if (parseInt(hours) === 0 && parseInt(minutes) === 0) {
                showToast(`Already charged to ${target}%!`);
                return;
            }
            
            const completionDate = new Date(parseInt(completionMs));
            const startDate = new Date(parseInt(startTimeMs));
            
            // Define end date as 10 minutes after completion date to block a tiny event window
            const eventEndDate = new Date(completionDate.getTime() + 10 * 60 * 1000);
            
            const dtStamp = getUtcIcsString(new Date());
            const dtStart = getUtcIcsString(completionDate);
            const dtEnd = getUtcIcsString(eventEndDate);
            
            const summary = `Unplug Fiat 500e (${target}% Charge)`;
            const description = `Your Fiat 500e has reached its target of ${target}% charge.\\n` +
                                `Charging started at ${state.currentSoC}% using ${state.chargingSpeed} kW speed.`
            
            // Format standard .ics payload
            const icsContent = 
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cinquecento Charge//Charging Calculator//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${dtStamp}-${target}@fiat500e.charge
DTSTAMP:${dtStamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${summary}
DESCRIPTION:${description}
BEGIN:VALARM
TRIGGER:-PT0M
ACTION:DISPLAY
DESCRIPTION:Unplug Fiat 500e charger.
END:VALARM
END:VEVENT
END:VCALENDAR`;

            // Prompt dynamic browser download
            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `fiat500e_charge_${target}pct.ics`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast(`Downloaded reminder calendar event!`);
        });
    });

    // Run Initial setups
    initTimePicker();
    setupInputs();
    updateVisualizers();
    calculate();
});
