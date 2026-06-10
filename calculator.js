// Vancomycin Pharmacokinetics Calculator Core Logic - Bilingual Layout Version
let chartInstance = null;

// Global Calculator State
let state = {
    unitSystem: 'SI', // Default to SI units for Taiwan clinical mockup
    sex: 'Male',
    criticallyIll: false,
    manualCrCl: false,
    vdMethod: 'Bayesian',
    clearanceMethod: 'Bayesian',
    loadingDose: false,
    levelsAvailable: false, // Default to Empiric Mode
    
    // Advanced Settings
    defaultInfRate: 1000, // mg/hr
    tinfRounding: 0.5,    // hour rounding (0.5, 0.25, 0)
    organismMic: 1.0,     // mcg/mL
    targetAucMin: 400,
    targetAucMax: 600,
    targetTroughMin: 10,
    targetTroughMax: 20,
    
    // Calculated Parameters
    weightKg: 70,
    heightCm: 170,
    age: 55,
    scr: 0.9,
    crCl: 80,
    ibw: 0,
    adjbw: 0,
    dosingWeight: 70,
    
    // Final PK outputs
    vd: 0,
    cl: 0,
    ke: 0,
    thalf: 0
};

// Initialize app when DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem("vanco-theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-theme");
        document.body.classList.remove("light-theme");
        const icon = document.getElementById("btnThemeToggle").querySelector("i");
        if (icon) icon.className = "fa-solid fa-sun";
    }

    // Set default dates for level entries (e.g., recent dose started 12 hours ago, level drawn 11 hours ago)
    const now = new Date();
    const doseTime = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const level1Time = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const level2Time = new Date(now.getTime() - 15 * 60 * 1000);
    
    document.getElementById("txtRecentDoseTime").value = formatDateForInput(doseTime);
    document.getElementById("txtLevel1Time").value = formatDateForInput(level1Time);
    document.getElementById("txtLevel2Time").value = formatDateForInput(level2Time);
    
    // Bind all inputs for live calculation and reactivity
    const inputIds = [
        "txtAge", "txtWeight", "txtHeight", "txtCreatinine", 
        "txtCrCl", "txtCustomVd", "drpRenalReplacement", 
        "txtDose", "txtInfusionTime", "drpDosingFrequency",
        "drpDosesGiven", "txtRecentDoseMg", "drpRecentDoseTau", 
        "txtRecentDoseTinf", "txtRecentDoseTime", "txtLevel1Time", 
        "txtLevel1Conc", "txtLevel2Time", "txtLevel2Conc"
    ];
    
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", () => {
                updateInfusionWarning();
                calculate();
            });
            el.addEventListener("change", () => {
                updateInfusionWarning();
                calculate();
            });
        }
    });

    // Listen for Ctrl+Enter hotkey to calculate
    window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            calculate();
        }
    });

    // Listen for changes on planned dose to auto-update planned infusion duration
    document.getElementById("txtDose").addEventListener("input", () => {
        const doseVal = parseFloat(document.getElementById("txtDose").value);
        if (!isNaN(doseVal)) {
            document.getElementById("txtInfusionTime").value = calculateInfusionTime(doseVal, state.defaultInfRate, state.tinfRounding);
        }
    });

    // Initial calculation and warnings run
    updateInfusionWarning();
    calculate();
});

// Helper: Format Date object to YYYY-MM-DDTHH:MM for datetime-local input
function formatDateForInput(date) {
    const pad = (num) => String(num).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Dosing Mode selector (Empiric vs level-adjusted)
function setDosingMode(mode) {
    state.levelsAvailable = (mode === 'Adjusted');
    
    document.getElementById("btnModeEmpiric").classList.toggle("active", mode === 'Empiric');
    document.getElementById("btnModeAdjusted").classList.toggle("active", mode === 'Adjusted');
    
    document.getElementById("cardDrugLevels").style.display = (mode === 'Adjusted') ? "block" : "none";
    
    calculate();
}

function setSex(sex) {
    state.sex = sex;
    document.getElementById("btnSexMale").classList.toggle("active", sex === 'Male');
    document.getElementById("btnSexFemale").classList.toggle("active", sex === 'Female');
    calculate();
}

function setCriticallyIll(status) {
    state.criticallyIll = status;
    document.getElementById("btnCritNo").classList.toggle("active", !status);
    document.getElementById("btnCritYes").classList.toggle("active", status);
    calculate();
}

function setManualCrCl(status) {
    state.manualCrCl = status;
    document.getElementById("groupSCrInput").style.display = status ? "none" : "block";
    document.getElementById("groupManualCrCl").style.display = status ? "block" : "none";
    calculate();
}

function onRecommendLoadDoseToggle() {
    state.loadingDose = document.getElementById("chkRecommendLoadDose").checked;
    calculate();
}

function toggleRenalReplacement() {
    const isDialysis = document.getElementById("drpRenalReplacement").value === 'RRT';
    document.getElementById("divDialysisWarning").style.display = isDialysis ? "block" : "none";
    document.getElementById("sectionRenalCalculations").style.display = isDialysis ? "none" : "block";
    calculate();
}

function toggleLevel2Field() {
    const noLevel2 = document.getElementById("chkNoSecondLevel").checked;
    document.getElementById("divLevel2Inputs").style.display = noLevel2 ? "none" : "grid";
    calculate();
}

function updateDoseFields() {
    const doses = document.getElementById("drpDosesGiven").value;
    document.getElementById("groupRecentDoseTau").style.display = (doses === '1') ? "none" : "flex";
    calculate();
}

// Light/Dark Theme toggle button
function toggleTheme() {
    const isDark = document.body.classList.toggle("dark-theme");
    document.body.classList.toggle("light-theme", !isDark);
    localStorage.setItem("vanco-theme", isDark ? "dark" : "light");
    
    const icon = document.getElementById("btnThemeToggle").querySelector("i");
    if (icon) {
        icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
    
    // Redraw chart to update font & grid colors dynamically
    calculate();
}

// Advanced config Settings Modals
function openModal() {
    document.getElementById("modalSettings").classList.add("active");
    // Pre-fill parameters
    document.getElementById("drpDefaultInfRate").value = state.defaultInfRate;
    document.getElementById("drpTinfRounding").value = state.tinfRounding;
    document.getElementById("txtOrganismMic").value = state.organismMic;
    document.getElementById("txtTargetAucMin").value = state.targetAucMin;
    document.getElementById("txtTargetAucMax").value = state.targetAucMax;
    document.getElementById("txtTargetTroughMin").value = state.targetTroughMin;
    document.getElementById("txtTargetTroughMax").value = state.targetTroughMax;
}

function closeModal() {
    document.getElementById("modalSettings").classList.remove("active");
}

function saveAdvancedSettings() {
    state.defaultInfRate = parseFloat(document.getElementById("drpDefaultInfRate").value);
    state.tinfRounding = parseFloat(document.getElementById("drpTinfRounding").value);
    state.organismMic = parseFloat(document.getElementById("txtOrganismMic").value);
    state.targetAucMin = parseFloat(document.getElementById("txtTargetAucMin").value);
    state.targetAucMax = parseFloat(document.getElementById("txtTargetAucMax").value);
    state.targetTroughMin = parseFloat(document.getElementById("txtTargetTroughMin").value);
    state.targetTroughMax = parseFloat(document.getElementById("txtTargetTroughMax").value);
    
    closeModal();
    
    // Recalculate planned infusion time rounding
    const plannedDose = parseFloat(document.getElementById("txtDose").value);
    if (!isNaN(plannedDose)) {
        document.getElementById("txtInfusionTime").value = calculateInfusionTime(plannedDose, state.defaultInfRate, state.tinfRounding);
    }
    
    updateInfusionWarning();
    calculate();
}

function resetAdvancedSettings() {
    document.getElementById("drpDefaultInfRate").value = "1000";
    document.getElementById("drpTinfRounding").value = "0.5";
    document.getElementById("txtOrganismMic").value = "1.0";
    document.getElementById("txtTargetAucMin").value = "400";
    document.getElementById("txtTargetAucMax").value = "600";
    document.getElementById("txtTargetTroughMin").value = "10";
    document.getElementById("txtTargetTroughMax").value = "20";
}

// Calculate weights and CrCl parameters
function parseInputs() {
    let rawWeight = parseFloat(document.getElementById("txtWeight").value);
    let rawHeight = parseFloat(document.getElementById("txtHeight").value);
    let rawCreatinine = parseFloat(document.getElementById("txtCreatinine").value);
    
    state.age = parseInt(document.getElementById("txtAge").value);
    
    if (isNaN(rawWeight) || isNaN(rawHeight) || isNaN(state.age)) {
        return false;
    }
    
    // Weight Conversion
    state.weightKg = rawWeight;
    state.heightCm = rawHeight;
    
    // Creatinine & Clearance
    if (state.manualCrCl) {
        state.crCl = parseFloat(document.getElementById("txtCrCl").value);
        if (isNaN(state.crCl)) state.crCl = 80;
    } else {
        state.scr = rawCreatinine;
        if (isNaN(state.scr) || state.scr <= 0) return false;
    }
    
    return true;
}

// Dynically update the Dosing Speed Warning Box
function updateInfusionWarning() {
    const dose = parseFloat(document.getElementById("txtDose").value);
    const tinf = parseFloat(document.getElementById("txtInfusionTime").value);
    const warningBox = document.getElementById("divRateWarning");
    const warningText = document.getElementById("txtRateWarning");
    
    if (isNaN(dose) || isNaN(tinf) || tinf <= 0) return;
    
    // Calculate rate (mg/min)
    const rate = dose / (tinf * 60);
    
    if (rate > 10.0) {
        warningBox.className = "rate-info-box danger-box";
        warningText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ⚠️ 輸注速率為 <strong>${rate.toFixed(1)} mg/min</strong>。大於建議速率 10 mg/min (可能增加紅人症候群 Red Man Syndrome 風險)`;
    } else {
        warningBox.className = "rate-info-box";
        warningText.innerHTML = `<i class="fa-solid fa-lightbulb"></i> 💡 輸注速率為 <strong>${rate.toFixed(1)} mg/min</strong>。符合建議速率 &le; 10 mg/min`;
    }
}

// Primary Dosing Engine calculations
function calculate() {
    if (!parseInputs()) return;
    
    const isDialysis = document.getElementById("drpRenalReplacement").value === 'RRT';
    if (isDialysis) {
        document.getElementById("valVd").innerHTML = "N/A";
        document.getElementById("valVdRatio").innerHTML = "";
        document.getElementById("valCl").innerHTML = "N/A";
        document.getElementById("valCrCl").innerHTML = "透析患者 Dialysis";
        document.getElementById("valKe").innerHTML = "N/A";
        document.getElementById("valThalf").innerHTML = "N/A";
        document.getElementById("divPreferredCard").style.display = "none";
        document.getElementById("tblDosingOptions").querySelector("tbody").innerHTML = "<tr><td colspan='7' style='text-align: center;'>透析患者無推薦劑量網格 (No recommendations for dialysis)</td></tr>";
        if (chartInstance) chartInstance.destroy();
        return;
    }
    
    // 1. Calculate weights (IBW, AdjBW)
    state.ibw = calculateIBW(state.heightCm, state.sex);
    state.adjbw = state.ibw + 0.4 * (state.weightKg - state.ibw);
    
    // weight choice rules
    let weightType = "TBW";
    let cgWeight = state.weightKg;
    if (state.weightKg > 1.3 * state.ibw) {
        weightType = "AdjBW";
        cgWeight = state.adjbw;
    } else if (state.weightKg < state.ibw) {
        weightType = "TBW";
        cgWeight = state.weightKg;
    } else {
        weightType = "TBW";
        cgWeight = state.weightKg;
    }
    
    state.dosingWeight = cgWeight;
    
    // 2. Creatinine Clearance CG
    if (!state.manualCrCl) {
        state.crCl = ((140 - state.age) * cgWeight) / (72 * state.scr);
        if (state.sex === 'Female') state.crCl *= 0.85;
    }
    
    document.getElementById("valCrCl").innerText = `CrCl: ${state.crCl.toFixed(0)} mL/min (${weightType})`;
    
    // 3. BMI & PopPK prior select
    const bmi = state.weightKg / ((state.heightCm / 100) ** 2);
    let selectedPriorModel = "Buelga 2005";
    
    const isExtremeObese = (bmi > 40 && state.weightKg >= 120);
    const isCriticallyIllObese = (state.criticallyIll && bmi >= 30 && state.weightKg > 100);
    
    if (isExtremeObese) {
        selectedPriorModel = "Adane 2015";
    } else if (state.criticallyIll) {
        if (isCriticallyIllObese) {
            selectedPriorModel = "Masich 2020";
        } else {
            selectedPriorModel = "Roberts 2011";
        }
    }
    
    // priors estimation
    let priorCl = 0;
    let priorVd = 0;
    const bsa = Math.sqrt((state.heightCm * state.weightKg) / 3600);
    
    const clBuelga = state.crCl * 60 / 1000 * 1.08;
    const vdBuelga = 0.98;
    
    const clAdane = 6.54 * (state.crCl) / 125;
    const vdAdane = 0.51;
    
    const crClBsa = state.crCl * 1.73 / bsa;
    const clRoberts = 4.58 * crClBsa / 100;
    const vdRoberts = 1.53;
    
    const clMasich = 3.23 * Math.pow(state.crCl / 40, 0.69);
    const vdMasich = 0.78;
    
    if (selectedPriorModel === "Buelga 2005") {
        priorCl = clBuelga;
        priorVd = vdBuelga * state.weightKg;
    } else if (selectedPriorModel === "Adane 2015") {
        const crClTbw = (state.sex === 'Female' ? 0.85 : 1.0) * ((140 - state.age) * state.weightKg) / (72 * state.scr);
        priorCl = 6.54 * crClTbw / 125;
        priorVd = vdAdane * state.weightKg;
    } else if (selectedPriorModel === "Roberts 2011") {
        priorCl = clRoberts;
        priorVd = vdRoberts * state.weightKg;
    } else if (selectedPriorModel === "Masich 2020") {
        priorCl = clMasich;
        priorVd = vdMasich * state.weightKg;
    }
    
    // Apply Vd & Clearance model overrides
    state.clearanceMethod = document.getElementById("drpClearanceMethod").value;
    state.vdMethod = document.getElementById("drpVdMethod").value;

    let clEstimated = priorCl;
    let vdEstimated = priorVd;
    
    if (state.clearanceMethod === 'Bauer') {
        clEstimated = (0.695 * state.crCl / state.weightKg + 0.05) * state.weightKg * 0.06;
    } else if (state.clearanceMethod === 'Matzke') {
        clEstimated = (0.689 * state.crCl + 3.66) * 0.06;
    }
    
    if (state.vdMethod === 'Bauer') {
        vdEstimated = 0.7 * state.weightKg;
    } else if (state.vdMethod === 'Matzke') {
        vdEstimated = (state.crCl > 60 ? 0.72 : 0.89) * state.weightKg;
    } else if (state.vdMethod === 'RushingAmbrose') {
        vdEstimated = 0.17 * state.age + 0.22 * state.weightKg + 15;
    } else if (state.vdMethod === 'Obese') {
        vdEstimated = 0.52 * state.weightKg;
    } else if (state.vdMethod === 'Other') {
        const customVdRatio = parseFloat(document.getElementById("txtCustomVd").value);
        vdEstimated = (isNaN(customVdRatio) ? 0.7 : customVdRatio) * state.weightKg;
    }
    
    // 4. Level-based adjustments
    if (state.levelsAvailable) {
        const isTimingValid = handleLevelAdjustments(priorCl, priorVd, clBuelga, vdBuelga);
        if (!isTimingValid) return; // timing warning was displayed
        clEstimated = state.cl;
        vdEstimated = state.vd;
    } else {
        state.cl = clEstimated;
        state.vd = vdEstimated;
        state.ke = clEstimated / vdEstimated;
        state.thalf = Math.log(2) / state.ke;
        document.getElementById("divTimingFeedback").style.display = "none";
    }
    
    // 5. Update summary fields
    document.getElementById("valVd").innerHTML = `${state.vd.toFixed(1)} <span class="param-unit">L</span>`;
    document.getElementById("valVdRatio").innerHTML = `${(state.vd / state.weightKg).toFixed(2)} L/kg of TBW (${selectedPriorModel})`;
    document.getElementById("valCl").innerHTML = `${state.cl.toFixed(2)} <span class="param-unit">L/hr</span>`;
    document.getElementById("valKe").innerHTML = `${state.ke.toFixed(4)} <span class="param-unit">hr⁻¹</span>`;
    document.getElementById("valThalf").innerHTML = `${state.thalf.toFixed(1)} <span class="param-unit">hours</span>`;
    
    // 6. Generate options grid
    generateDosingGrid();
}

// Handle Level adjustements
function handleLevelAdjustments(priorCl, priorVd, clBuelga, vdBuelga) {
    const dosesGiven = document.getElementById("drpDosesGiven").value; // '1' or '3'
    const recentDoseMg = parseFloat(document.getElementById("txtRecentDoseMg").value);
    const recentDoseTau = parseFloat(document.getElementById("drpRecentDoseTau").value);
    const recentDoseTinf = parseFloat(document.getElementById("txtRecentDoseTinf").value);
    
    const doseTimeStr = document.getElementById("txtRecentDoseTime").value;
    const level1TimeStr = document.getElementById("txtLevel1Time").value;
    const level2TimeStr = document.getElementById("txtLevel2Time").value;
    
    const level1Conc = parseFloat(document.getElementById("txtLevel1Conc").value);
    const level2Conc = parseFloat(document.getElementById("txtLevel2Conc").value);
    
    const noSecondLevel = document.getElementById("chkNoSecondLevel").checked;
    
    if (isNaN(recentDoseMg) || isNaN(recentDoseTinf) || !doseTimeStr || !level1TimeStr || isNaN(level1Conc)) {
        showFeedbackError("請輸入最近給藥設定及 Level 1 數據 (Please fill in dose and level 1 details).");
        return false;
    }
    
    const dtDose = new Date(doseTimeStr);
    const dtLevel1 = new Date(level1TimeStr);
    
    const dtEndInfusion = new Date(dtDose.getTime() + recentDoseTinf * 60 * 60 * 1000);
    const hoursDoseToL1 = (dtLevel1.getTime() - dtEndInfusion.getTime()) / (1000 * 60 * 60);
    
    if (hoursDoseToL1 < 1.0) {
        showFeedbackError(`第一劑抽血時間太早 (${hoursDoseToL1.toFixed(1)} 小時)。輸注結束後需間隔至少 1 小時以避開分佈期。`);
        return false;
    }
    
    // Two drug levels
    if (!noSecondLevel) {
        if (!level2TimeStr || isNaN(level2Conc)) {
            showFeedbackError("請輸入第二劑抽血時間及濃度。");
            return false;
        }
        
        const dtLevel2 = new Date(level2TimeStr);
        const hoursL1toL2 = (dtLevel2.getTime() - dtLevel1.getTime()) / (1000 * 60 * 60);
        
        if (hoursL1toL2 < 3.0) {
            showFeedbackError(`兩次抽血時間間隔太短 (${hoursL1toL2.toFixed(1)} 小時)。間隔應至少 3 小時以上。`);
            return false;
        }
        
        const deltaConc = Math.log(level1Conc / level2Conc);
        const ke = deltaConc / hoursL1toL2;
        
        if (ke <= 0 || isNaN(ke)) {
            showFeedbackError("排除常數 (ke) 計算為負值。請檢查濃度 Level 2 是否確實低於 Level 1。");
            return false;
        }
        
        const hoursEndInfToL1 = (dtLevel1.getTime() - dtEndInfusion.getTime()) / (1000 * 60 * 60);
        const cmax = level1Conc * Math.exp(ke * hoursEndInfToL1);
        
        let cmin = 0;
        let vd = 0;
        
        if (dosesGiven === '3') {
            const hoursL2ToDoseEnd = (dtDose.getTime() + recentDoseTau * 60 * 60 * 1000 - dtLevel2.getTime()) / (1000 * 60 * 60);
            cmin = level2Conc * Math.exp(-ke * hoursL2ToDoseEnd);
            vd = (recentDoseMg * (1 - Math.exp(-ke * recentDoseTinf))) / 
                 (recentDoseTinf * ke * (cmax - cmin * Math.exp(-ke * recentDoseTinf)));
        } else {
            vd = (recentDoseMg * (1 - Math.exp(-ke * recentDoseTinf))) / 
                 (recentDoseTinf * ke * cmax);
        }
        
        if (vd <= 0 || isNaN(vd)) {
            showFeedbackError("計算之分佈體積 (Vd) 異常，請確認體重與時間輸入。");
            return false;
        }
        
        state.ke = ke;
        state.vd = vd;
        state.cl = ke * vd;
        state.thalf = Math.log(2) / ke;
        
        showFeedbackSuccess(`<strong>二點法 Sawchuk-Zaske 計算成功：</strong><br>` + 
                             `• 輸注結束至 Level 1 間隔: ${hoursDoseToL1.toFixed(1)} 小時<br>` + 
                             `• Level 1 至 Level 2 間隔: ${hoursL1toL2.toFixed(1)} 小時<br>` + 
                             `• 推算高峰濃度: ${cmax.toFixed(1)} mcg/mL | 推算谷值濃度: ${cmin.toFixed(1)} mcg/mL`);
        return true;
    }
    
    // One drug level (Bayesian prior optimization or solver)
    if (noSecondLevel) {
        let solvedKe = 0;
        let solvedVd = 0;
        let solvedCl = 0;
        
        const hoursDoseToDraw = (dtLevel1.getTime() - dtDose.getTime()) / (1000 * 60 * 60);
        
        if (state.clearanceMethod === 'Bayesian') {
            const bayesResult = runBayesianOptimization(priorCl, priorVd, recentDoseMg, recentDoseTinf, recentDoseTau, hoursDoseToDraw, level1Conc, dosesGiven === '3');
            solvedCl = bayesResult.cl;
            solvedVd = bayesResult.vd;
            solvedKe = solvedCl / solvedVd;
        } else {
            solvedVd = state.vd;
            solvedKe = solveKeFromTrough(solvedVd, recentDoseMg, recentDoseTinf, recentDoseTau, hoursDoseToDraw, level1Conc, dosesGiven === '3');
            solvedCl = solvedKe * solvedVd;
        }
        
        state.ke = solvedKe;
        state.vd = solvedVd;
        state.cl = solvedCl;
        state.thalf = Math.log(2) / solvedKe;
        
        showFeedbackSuccess(`<strong>單點法調整計算成功：</strong><br>` + 
                             `• 抽血時間為給藥開始後: ${hoursDoseToDraw.toFixed(1)} 小時。<br>` +
                             `• 使用模型：${state.clearanceMethod === 'Bayesian' ? 'Bayesian MAP 優化算法' : '固定群體 Vd 並反算 Ke'}。`);
        return true;
    }
    
    return false;
}

// Numerical solver for Ke
function solveKeFromTrough(vd, dose, tinf, tau, tdraw, targetConc, isSteadyState) {
    let lowKe = 0.005;
    let highKe = 0.6;
    let ke = 0.1;
    for (let i = 0; i < 40; i++) {
        ke = (lowKe + highKe) / 2;
        let pred = 0;
        if (isSteadyState) {
            const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * vd * ke * (1 - Math.exp(-ke * tau)));
            pred = cmax * Math.exp(-ke * (tdraw - tinf));
        } else {
            const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * vd * ke);
            pred = cmax * Math.exp(-ke * (tdraw - tinf));
        }
        
        if (pred > targetConc) {
            lowKe = ke;
        } else {
            highKe = ke;
        }
    }
    return ke;
}

// Bayesian MAP Optimization
function runBayesianOptimization(priorCl, priorVd, dose, tinf, tau, tdraw, measuredConc, isSteadyState) {
    let bestCl = priorCl;
    let bestVd = priorVd;
    let minObjective = Infinity;
    
    const omegaSqCl = Math.log(1 + 0.30 * 0.30); // 30% CV
    const omegaSqVd = Math.log(1 + 0.20 * 0.20); // 20% CV
    const sigmaSqConc = Math.log(1 + 0.15 * 0.15); // 15% noise
    
    const clSteps = 80;
    const vdSteps = 80;
    
    for (let i = 0; i < clSteps; i++) {
        const testClRatio = 0.1 + (3.4 * i) / clSteps;
        const testCl = priorCl * testClRatio;
        
        for (let j = 0; j < vdSteps; j++) {
            const testVdRatio = 0.4 + (1.8 * j) / vdSteps;
            const testVd = priorVd * testVdRatio;
            
            const ke = testCl / testVd;
            let pred = 0;
            if (isSteadyState) {
                const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * testVd * ke * (1 - Math.exp(-ke * tau)));
                pred = cmax * Math.exp(-ke * (tdraw - tinf));
            } else {
                const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * testVd * ke);
                pred = cmax * Math.exp(-ke * (tdraw - tinf));
            }
            
            const residualPart = Math.pow(Math.log(measuredConc / pred), 2) / sigmaSqConc;
            const clPriorPart = Math.pow(Math.log(testCl / priorCl), 2) / omegaSqCl;
            const vdPriorPart = Math.pow(Math.log(testVd / priorVd), 2) / omegaSqVd;
            const objective = residualPart + clPriorPart + vdPriorPart;
            
            if (objective < minObjective) {
                minObjective = objective;
                bestCl = testCl;
                bestVd = testVd;
            }
        }
    }
    
    // Fine pass
    const priorClBest = bestCl;
    const priorVdBest = bestVd;
    for (let i = 0; i < 20; i++) {
        const testCl = priorClBest * (0.9 + 0.2 * i / 20);
        for (let j = 0; j < 20; j++) {
            const testVd = priorVdBest * (0.9 + 0.2 * j / 20);
            
            const ke = testCl / testVd;
            let pred = 0;
            if (isSteadyState) {
                const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * testVd * ke * (1 - Math.exp(-ke * tau)));
                pred = cmax * Math.exp(-ke * (tdraw - tinf));
            } else {
                const cmax = (dose * (1 - Math.exp(-ke * tinf))) / (tinf * testVd * ke);
                pred = cmax * Math.exp(-ke * (tdraw - tinf));
            }
            
            const residualPart = Math.pow(Math.log(measuredConc / pred), 2) / sigmaSqConc;
            const clPriorPart = Math.pow(Math.log(testCl / priorCl), 2) / omegaSqCl;
            const vdPriorPart = Math.pow(Math.log(testVd / priorVd), 2) / omegaSqVd;
            const objective = residualPart + clPriorPart + vdPriorPart;
            
            if (objective < minObjective) {
                minObjective = objective;
                bestCl = testCl;
                bestVd = testVd;
            }
        }
    }
    
    return { cl: bestCl, vd: bestVd };
}

function showFeedbackError(msg) {
    const box = document.getElementById("divTimingFeedback");
    box.className = "danger-box";
    box.style.display = "block";
    box.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <strong>錯誤 Timing Error:</strong> ${msg}`;
}

function showFeedbackSuccess(msg) {
    const box = document.getElementById("divTimingFeedback");
    box.className = "info-box";
    box.style.display = "block";
    box.innerHTML = msg;
}

// Generate Dosing Options Table Grid
function generateDosingGrid() {
    const intervals = [8, 12, 18, 24, 36, 48, 72];
    const doses = [500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000];
    
    const tbody = document.getElementById("tblDosingOptions").querySelector("tbody");
    tbody.innerHTML = "";
    
    let options = [];
    let bestRegimen = null;
    let bestScore = Infinity;
    
    intervals.forEach(tau => {
        let bestDose = null;
        let bestAucDiff = Infinity;
        let optimalDoseRecord = null;
        
        doses.forEach(dose => {
            const tinf = calculateInfusionTime(dose, state.defaultInfRate, state.tinfRounding);
            
            const cmax = (dose * (1 - Math.exp(-state.ke * tinf))) / (tinf * state.vd * state.ke * (1 - Math.exp(-state.ke * tau)));
            const cmin = cmax * Math.exp(-state.ke * (tau - tinf));
            
            const auc24 = (dose * (24 / tau)) / state.cl;
            const aucMic = auc24 / state.organismMic;
            
            const record = {
                tau,
                dose,
                tinf,
                peak: cmax,
                trough: cmin,
                auc24,
                aucMic
            };
            
            const midAuc = (state.targetAucMin + state.targetAucMax) / 2;
            const aucDiff = Math.abs(aucMic - midAuc);
            
            if (aucDiff < bestAucDiff) {
                bestAucDiff = aucDiff;
                bestDose = dose;
                optimalDoseRecord = record;
            }
        });
        
        if (optimalDoseRecord) {
            options.push(optimalDoseRecord);
            
            // Score regimen
            let penalty = 0;
            const aucVal = optimalDoseRecord.aucMic;
            const troughVal = optimalDoseRecord.trough;
            
            if (aucVal < state.targetAucMin) {
                penalty += (state.targetAucMin - aucVal) * 3;
            } else if (aucVal > state.targetAucMax) {
                penalty += (aucVal - state.targetAucMax) * 5;
            }
            
            if (troughVal < state.targetTroughMin) {
                penalty += (state.targetTroughMin - troughVal) * 15;
            } else if (troughVal > state.targetTroughMax) {
                penalty += (troughVal - state.targetTroughMax) * 30;
            }
            
            if (tau === 12 || tau === 24) {
                penalty += 0;
            } else if (tau === 8) {
                penalty += 15;
            } else if (tau === 18) {
                penalty += 25;
            } else if (tau === 36) {
                penalty += 45;
            } else {
                penalty += 60;
            }
            
            if (penalty < bestScore) {
                bestScore = penalty;
                bestRegimen = optimalDoseRecord;
            }
        }
    });
    
    // Sort options and append
    options.forEach(opt => {
        const tr = document.createElement("tr");
        
        const isPreferred = (bestRegimen && opt.tau === bestRegimen.tau && opt.dose === bestRegimen.dose);
        if (isPreferred) {
            tr.className = "preferred-row";
        }
        
        const aucClass = (opt.aucMic >= state.targetAucMin && opt.aucMic <= state.targetAucMax) ? "within-goal" : "outside-goal";
        const troughClass = (opt.trough >= state.targetTroughMin && opt.trough <= state.targetTroughMax) ? "within-goal" : "outside-goal";
        
        tr.innerHTML = `
            <td>Every ${opt.tau} hr (Q${opt.tau}h)</td>
            <td class="value-highlight">${opt.dose} mg</td>
            <td>${opt.peak.toFixed(1)}</td>
            <td class="value-highlight ${troughClass}">${opt.trough.toFixed(1)}</td>
            <td>${opt.auc24.toFixed(0)}</td>
            <td class="value-highlight ${aucClass}">${opt.aucMic.toFixed(0)}</td>
            <td>
                <button class="btn btn-secondary ${isPreferred ? 'btn-success' : ''}" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="selectRegimen(${opt.dose}, ${opt.tau}, ${opt.tinf})">
                    ${isPreferred ? '<i class="fa-solid fa-circle-check"></i> Selected' : 'Select'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Update top recommendation summary box
    if (bestRegimen) {
        document.getElementById("divPreferredCard").style.display = "block";
        document.getElementById("valPreferredDoseString").innerText = `${bestRegimen.dose} mg IV Every ${bestRegimen.tau} Hours (Q${bestRegimen.tau}h, 輸注時間 ${bestRegimen.tinf.toFixed(1)} 小時)`;
        document.getElementById("valPreferredPeak").innerText = `${bestRegimen.peak.toFixed(1)} mcg/mL`;
        document.getElementById("valPreferredTrough").innerText = `${bestRegimen.trough.toFixed(1)} mcg/mL`;
        document.getElementById("valPreferredAuc").innerText = `${bestRegimen.aucMic.toFixed(0)}`;
        
        // Color AUC based on range
        const targetAucField = document.getElementById("valPreferredAuc");
        if (bestRegimen.aucMic >= state.targetAucMin && bestRegimen.aucMic <= state.targetAucMax) {
            targetAucField.style.color = "var(--success)";
        } else {
            targetAucField.style.color = "var(--danger)";
        }
        
        // Load settings to check loading dose checkbox
        updateLoadingDoseRecommendation();
        
        // Render Concentration Plot
        drawCurve(bestRegimen.dose, bestRegimen.tau, bestRegimen.tinf);
    }
}

// Check loading dose checkbox and toggle display
function updateLoadingDoseRecommendation() {
    const isChecked = document.getElementById("chkRecommendLoadDose").checked;
    state.loadingDose = isChecked;
    const loadingDoseLabel = document.getElementById("valPreferredDoseLoading");
    
    if (isChecked) {
        let loadDose = Math.round((27.5 * state.weightKg) / 250) * 250;
        loadDose = Math.min(3000, Math.max(750, loadDose));
        loadingDoseLabel.style.display = "block";
        loadingDoseLabel.innerText = `+ 建議負荷劑量 (Loading Dose): ${loadDose} mg IV x1 dose`;
    } else {
        loadingDoseLabel.style.display = "none";
    }
}

function selectRegimen(dose, tau, tinf) {
    // Redraw graph
    drawCurve(dose, tau, tinf);
    
    // Update Dosing grid highlighting
    const rows = document.getElementById("tblDosingOptions").querySelectorAll("tbody tr");
    rows.forEach(row => {
        const text = row.cells[0].innerText;
        const doseText = row.cells[1].innerText;
        if (text.includes(`Every ${tau} hr`) && doseText.includes(`${dose} mg`)) {
            row.className = "preferred-row";
            const btn = row.querySelector("button");
            btn.className = "btn btn-secondary btn-success";
            btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Selected';
        } else {
            row.classList.remove("preferred-row");
            const btn = row.querySelector("button");
            btn.className = "btn btn-secondary";
            btn.innerHTML = 'Select';
        }
    });
    
    // Update Preferred Regimen Card
    const cmax = (dose * (1 - Math.exp(-state.ke * tinf))) / (tinf * state.vd * state.ke * (1 - Math.exp(-state.ke * tau)));
    const cmin = cmax * Math.exp(-state.ke * (tau - tinf));
    const auc24 = (dose * (24 / tau)) / state.cl;
    const aucMic = auc24 / state.organismMic;
    
    document.getElementById("valPreferredDoseString").innerText = `${dose} mg IV Every ${tau} Hours (Q${tau}h, 輸注時間 ${tinf.toFixed(1)} 小時)`;
    document.getElementById("valPreferredPeak").innerText = `${cmax.toFixed(1)} mcg/mL`;
    document.getElementById("valPreferredTrough").innerText = `${cmin.toFixed(1)} mcg/mL`;
    document.getElementById("valPreferredAuc").innerText = `${aucMic.toFixed(0)}`;
    
    const targetAucField = document.getElementById("valPreferredAuc");
    if (aucMic >= state.targetAucMin && aucMic <= state.targetAucMax) {
        targetAucField.style.color = "var(--success)";
    } else {
        targetAucField.style.color = "var(--danger)";
    }
}

// Draw Curve using Chart.js
function drawCurve(dose, tau, tinf) {
    const styles = getComputedStyle(document.body);
    const gridColor = styles.getPropertyValue('--chart-grid').trim() || 'rgba(15,23,42,0.05)';
    const textColor = styles.getPropertyValue('--chart-text').trim() || '#64748b';

    const points = 100;
    let dataLabels = [];
    let dataPoints = [];
    
    const cmax = (dose * (1 - Math.exp(-state.ke * tinf))) / (tinf * state.vd * state.ke * (1 - Math.exp(-state.ke * tau)));
    const cmin = cmax * Math.exp(-state.ke * (tau - tinf));
    
    for (let i = 0; i <= points; i++) {
        const t = (tau * i) / points;
        let conc = 0;
        if (t <= tinf) {
            conc = (dose * (1 - Math.exp(-state.ke * t))) / (tinf * state.vd * state.ke) + cmin * Math.exp(-state.ke * t);
        } else {
            conc = cmax * Math.exp(-state.ke * (t - tinf));
        }
        dataLabels.push(t.toFixed(1));
        dataPoints.push(parseFloat(conc.toFixed(2)));
    }
    
    const ctx = document.getElementById('chartVanco').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataLabels,
            datasets: [{
                label: 'Vancomycin Conc. (mcg/mL)',
                data: dataPoints,
                borderColor: '#2563eb', // Royal blue curve
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Hours after Dose Start',
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Concentration (mcg/mL)',
                        color: textColor
                    },
                    min: 0,
                    max: Math.ceil(cmax / 10) * 10 + 10,
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                }
            }
        }
    });
}

function calculateIBW(heightCm, sex) {
    const heightIn = heightCm / 2.54;
    const base = sex === 'Male' ? 50 : 45.5;
    let ibw = base + 2.3 * (heightIn - 60);
    return Math.max(35.0, ibw);
}

function calculateInfusionTime(doseMg, rateMgHr, roundingHr) {
    let t = doseMg / rateMgHr;
    if (roundingHr > 0) {
        t = Math.round(t / roundingHr) * roundingHr;
    }
    return Math.max(0.25, t);
}

function validateTiming() {
    const doseTime = document.getElementById("txtRecentDoseTime").value;
    const level1Time = document.getElementById("txtLevel1Time").value;
    const level2Time = document.getElementById("txtLevel2Time").value;
    const recentDoseTinf = parseFloat(document.getElementById("txtRecentDoseTinf").value);
    
    if (!doseTime || !level1Time || isNaN(recentDoseTinf)) return;
    
    const dtDose = new Date(doseTime);
    const dtEndInf = new Date(dtDose.getTime() + recentDoseTinf * 60 * 60 * 1000);
    const dtLevel1 = new Date(level1Time);
    
    const hoursDoseToL1 = (dtLevel1.getTime() - dtEndInf.getTime()) / (1000 * 60 * 60);
    
    if (hoursDoseToL1 < 1.0) {
        showFeedbackError(`第一點抽血時間太早 (${hoursDoseToL1.toFixed(1)} 小時)。抽血需與輸注結束間隔至少 1 小時。`);
        return;
    }
    
    const noSecondLevel = document.getElementById("chkNoSecondLevel").checked;
    if (!noSecondLevel && level2Time) {
        const dtLevel2 = new Date(level2Time);
        const hoursL1ToL2 = (dtLevel2.getTime() - dtLevel1.getTime()) / (1000 * 60 * 60);
        if (hoursL1ToL2 < 3.0) {
            showFeedbackError(`第二點抽血時間太早 (${hoursL1ToL2.toFixed(1)} 小時)。兩點應間隔至少 3 小時以上。`);
            return;
        }
        showFeedbackSuccess(`時間軸參數驗證正確：<br>` + 
                             `• 輸注結束至第一點抽血間隔: ${hoursDoseToL1.toFixed(1)} 小時。<br>` +
                             `• 第一點至第二點抽血間隔: ${hoursL1ToToL2(hoursL1ToL2)} 小時。`);
        return;
    }
    
    showFeedbackSuccess(`時間軸參數驗證正確：<br>• 輸注結束至第一點抽血間隔: ${hoursDoseToL1.toFixed(1)} 小時。`);
}

function hoursL1ToToL2(val) {
    return isNaN(val) ? "0.0" : val.toFixed(1);
}

// Load Example Patient parameters
function loadExample() {
    resetAll();
    
    document.getElementById("txtWeight").value = "70";
    document.getElementById("txtHeight").value = "170";
    document.getElementById("txtAge").value = "55";
    document.getElementById("txtCreatinine").value = "0.9";
    
    calculate();
}

// Reset calculator inputs
function resetAll() {
    document.getElementById("txtAge").value = "55";
    document.getElementById("txtWeight").value = "70";
    document.getElementById("txtHeight").value = "170";
    document.getElementById("txtCreatinine").value = "0.9";
    
    document.getElementById("drpRenalReplacement").value = "None";
    document.getElementById("drpClearanceMethod").value = "Bayesian";
    document.getElementById("drpVdMethod").value = "Bayesian";
    state.clearanceMethod = "Bayesian";
    state.vdMethod = "Bayesian";
    
    // Set level values back to defaults
    setSex('Male');
    setCriticallyIll(false);
    setManualCrCl(false);
    toggleRenalReplacement();
    
    setDosingMode('Empiric');
    document.getElementById("chkRecommendLoadDose").checked = false;
    onRecommendLoadDoseToggle();
}

function onRecommendLoadDoseToggle() {
    state.loadingDose = document.getElementById("chkRecommendLoadDose").checked;
    updateLoadingDoseRecommendation();
}

// Generate Clinical Progress Note for Electronic Medical Record (EMR)
function generateEMRNote() {
    const bmi = state.weightKg / ((state.heightCm / 100) ** 2);
    const doseString = document.getElementById("valPreferredDoseString").innerText;
    const peak = document.getElementById("valPreferredPeak").innerText;
    const trough = document.getElementById("valPreferredTrough").innerText;
    const auc24 = document.getElementById("valPreferredAuc").innerText;
    
    const loadingDoseStr = state.loadingDose ? 
        `\n• 負荷劑量 (Loading Dose): ${Math.round((27.5 * state.weightKg) / 250) * 250} mg IV x1` : "";

    const labLevelsStr = state.levelsAvailable ? 
        `\n• 輸入實測血中濃度:
  - 第一點濃度 (Level 1): ${document.getElementById("txtLevel1Conc").value} mcg/mL
  - 第二點濃度 (Level 2): ${document.getElementById("chkNoSecondLevel").checked ? 'N/A' : document.getElementById("txtLevel2Conc").value + ' mcg/mL'}` : "";

    const note = `================================================
萬古黴素臨床劑量評估紀錄 (VANCOMYCIN DOSING NOTE)
================================================
基本生理指標：
• 年齡/性別: ${state.age} 歲 ${state.sex === 'Male' ? '男性' : '女性'}
• 體重: ${state.weightKg.toFixed(1)} kg | IBW: ${state.ibw.toFixed(1)} kg | AdjBW: ${state.adjbw.toFixed(1)} kg
• 身高: ${state.heightCm.toFixed(1)} cm | BMI: ${bmi.toFixed(1)} kg/m²
• 估算 CrCl: ${state.crCl.toFixed(0)} mL/min (Cockcroft-Gault)

藥動學估估參數：
• 分佈體積 Vd: ${state.vd.toFixed(1)} L (${(state.vd / state.weightKg).toFixed(2)} L/kg)
• 清除率 CL: ${state.cl.toFixed(2)} L/hr
• Ke: ${state.ke.toFixed(4)} hr⁻¹ | 半衰期 Half-life: ${state.thalf.toFixed(1)} 小時 ${labLevelsStr}

建議給藥指引及預估療效：${loadingDoseStr}
• 維持劑量: ${doseString}
• 預估穩態數值 (Predicted Steady-State):
  - 高峰濃度 (Peak): ${peak}
  - 谷值濃度 (Trough): ${trough}
  - AUC24 / MIC 比例: ${auc24} (療效目標: ${state.targetAucMin}-${state.targetAucMax} / MIC = ${state.organismMic} mcg/mL)

臨床建議：
• 建議於第 4 劑給藥前 30 分鐘抽血監測谷值濃度，以驗證是否達到穩態目標值。
• 臨床給藥應配合臨床症狀調整，以防發生腎毒性。
================================================`;

    navigator.clipboard.writeText(note).then(() => {
        alert("萬古黴素臨床病歷紀錄已成功複製至剪貼簿！");
    }).catch(err => {
        alert("複製失敗，請複製以下紀錄內容：\n\n" + note);
    });

    // Populate Print Area
    const printArea = document.getElementById("printArea");
    printArea.innerHTML = `
        <h1>萬古黴素藥物劑量報告 (Vancomycin Dosing Report)</h1>
        <p><strong>報告產生時間 Date/Time:</strong> ${new Date().toLocaleString()}</p>
        <hr>
        <h2>病患基本指標與腎功能 (Demographics & Renal Function)</h2>
        <table>
            <tr><td><strong>年齡 / 性別</strong></td><td>${state.age} 歲 / ${state.sex === 'Male' ? '男性' : '女性'}</td></tr>
            <tr><td><strong>體重 / 身高</strong></td><td>${(state.weightKg).toFixed(1)} kg / ${(state.heightCm).toFixed(1)} cm</td></tr>
            <tr><td><strong>理想體重 / BMI</strong></td><td>${state.ibw.toFixed(1)} kg / ${bmi.toFixed(1)} kg/m²</td></tr>
            <tr><td><strong>肌酸酐 / 估算 CrCl</strong></td><td>${state.scr ? state.scr.toFixed(2) + ' mg/dL' : '手動輸入'} / ${state.crCl.toFixed(0)} mL/min</td></tr>
        </table>

        <h2>估算藥動學參數 (Estimated PK Parameters)</h2>
        <table>
            <tr><td><strong>分佈體積 (Vd)</strong></td><td>${state.vd.toFixed(1)} L (${(state.vd / state.weightKg).toFixed(2)} L/kg)</td></tr>
            <tr><td><strong>排除清除率 (CL)</strong></td><td>${state.cl.toFixed(2)} L/hr</td></tr>
            <tr><td><strong>排除速率常數 (Ke)</strong></td><td>${state.ke.toFixed(4)} hr⁻¹</td></tr>
            <tr><td><strong>藥物半衰期 (T1/2)</strong></td><td>${state.thalf.toFixed(1)} 小時</td></tr>
        </table>

        <h2>建議給藥指引 (Dosing Recommendation)</h2>
        <div style="background: #f8f9fa; border: 1.5px solid #d3d3d3; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">
            <p style="font-size: 1.2rem; font-weight: bold; margin: 0;">${doseString}</p>
            ${state.loadingDose ? `<p style="font-weight: bold; color: #856404; margin-top: 0.25rem;">+ 負荷劑量 (Loading Dose): ${Math.round((27.5 * state.weightKg) / 250) * 250} mg IV x1</p>` : ''}
            <p style="margin-top: 0.5rem; margin-bottom: 0;"><strong>預測穩定狀態值：</strong>高峰: ${peak} | 谷值: ${trough} | AUC24/MIC: ${auc24}</p>
        </div>
        
        <p style="margin-top: 2rem; font-size: 0.85rem; color: #555; font-style: italic;">此報告計算公式與 ClinCalc.com Bayesian prior 一致。實際處方請依臨床狀況調整。</p>
    `;
}
