document.addEventListener('DOMContentLoaded', function() {
    // --- Element Cache ---
    const UIElements = {
        pathVbusToChip: document.getElementById('path-vbus-to-chip'),
        pathChipToSys: document.getElementById('path-chip-to-sys'),
        pathChipToBat: document.getElementById('path-chip-to-bat'),
        pathBatToChip: document.getElementById('path-bat-to-chip'),
        vbusComponentRect: document.getElementById('vbus-component').querySelector('rect'),
        batteryComponent: document.getElementById('battery-component'),
        batteryRect: document.getElementById('battery-rect'),
        batteryCap: document.getElementById('battery-cap'),
        chipRect: document.getElementById('chip-rect'),
        faultIndicator: document.getElementById('fault-indicator'),
        tempIndicator: document.getElementById('temp-indicator'),
        tempIndicatorCircle: document.getElementById('temp-indicator-circle'),
        vbusVoltageText: document.getElementById('vbus-voltage-text'),
        sysVoltageText: document.getElementById('sys-voltage-text'),
        batteryVoltageText: document.getElementById('battery-voltage-text'),
        batteryCurrentText: document.getElementById('battery-current-text'),
        chipTempText: document.getElementById('chip-temp-text'),
        chargeStatusText: document.getElementById('charge-status-text'),
        overallStatusContainer: document.getElementById('overall-status-container'),
        overallStatusText: document.getElementById('overall-status-text'),
        overallStatusIndicator: document.getElementById('overall-status-indicator'),
        statusCharge: document.getElementById('status-charge'),
        statusAdapter: document.getElementById('status-adapter'),
        statusIbus: document.getElementById('status-ibus'),
        statusSys: document.getElementById('status-sys'),
    };

    // --- Main UI Update Function ---
    function updateUI(data) {
        updateTextInfo(data);
        updatePowerFlow(data);
    }

    function updateTextInfo(data) {
        UIElements.vbusVoltageText.textContent = `${(data.VBUS_ADC_15_0 / 1000).toFixed(2) || '--'} V`;
        UIElements.sysVoltageText.textContent = `${(data.VSYS_ADC_15_0 / 1000).toFixed(2) || '--'} V`;
        UIElements.batteryVoltageText.textContent = `${(data.VBAT_ADC_15_0 / 1000).toFixed(2) || '--'} V`;
        UIElements.batteryCurrentText.textContent = `${(data.IBAT_ADC_15_0 / 1000).toFixed(2) || '--'} A`;
        UIElements.chipTempText.textContent = `${data.TDIE_ADC_15_0 || '--'} °C`;
        
        const statusInterpreters = {
            CHG_STAT_2_0: v => ["شارژ نمی‌شود", "قطره‌ای", "پیش‌شارژ", "شارژ سریع", "جریان پایانی", "رزرو شده", "تکمیلی", "کامل شد"][v] || "نامشخص",
            VBUS_STAT_3_0: v => ({0:"بدون ورودی",1:"SDP",2:"CDP",3:"DCP",4:"HVDCP",5:"ناشناخته",6:"غیراستاندارد",7:"OTG",8:"نامعتبر"})[v]||"رزرو شده",
        };

        const chargeStatus = statusInterpreters.CHG_STAT_2_0(data.CHG_STAT_2_0);
        UIElements.chargeStatusText.textContent = chargeStatus;
        UIElements.statusCharge.textContent = chargeStatus;
        UIElements.statusAdapter.textContent = statusInterpreters.VBUS_STAT_3_0(data.VBUS_STAT_3_0);
        UIElements.statusIbus.textContent = `${data.IBUS_ADC_15_0 || '--'} mA`;
        UIElements.statusSys.textContent = data.VSYS_STAT == 1 ? 'تنظیم ولتاژ' : 'عادی';
        
        const overallStatus = getOverallStatus(data);
        UIElements.overallStatusText.textContent = overallStatus.text;
        UIElements.overallStatusContainer.className = `mb-4 p-3 rounded-lg flex items-center justify-center space-x-3 space-x-reverse text-lg md:text-xl font-bold transition-all duration-300 ${overallStatus.colorClass}`;
    }

    function getOverallStatus(data) {
        const isCharging = data.CHG_STAT_2_0 >= 1 && data.CHG_STAT_2_0 <= 6;
        const isChargeDone = data.CHG_STAT_2_0 === 7;
        const isFault = data.TSHUT_STAT == 1 || data.VBUS_OVP_STAT == 1 || data.VSYS_OVP_STAT == 1 || data.VBAT_OVP_STAT == 1 || data.IBUS_OCP_STAT == 1;

        if (isFault) return { text: 'خطای سیستمی', colorClass: 'status-bg-error' };
        if (data.EN_OTG == 1) return { text: 'پاوربانک (OTG) فعال', colorClass: 'status-bg-info' };
        if (isCharging) return { text: 'در حال شارژ', colorClass: 'status-bg-success' };
        if (isChargeDone) return { text: 'شارژ کامل', colorClass: 'status-bg-info' };
        if (data.EN_HIZ == 1) return { text: 'ورودی غیرفعال (HIZ)', colorClass: 'status-bg-idle' };
        if (data.VBUS_PRESENT_STAT == 1) return { text: 'متصل به آداپتور', colorClass: 'status-bg-idle' };
        if (data.VBAT_PRESENT_STAT == 1) return { text: 'تغذیه از باتری', colorClass: 'status-bg-info' };
        return { text: 'خاموش / بدون تغذیه', colorClass: 'status-bg-idle' };
    }

    // --- Power Flow Logic ---

    function updatePowerFlow(data) {
        resetVisuals();
        updateVbusPath(data);
        updateVbatPath(data);
        updateVbusIcon(data);
        updateVbatIcon(data);
        
        UIElements.faultIndicator.style.visibility = (data.VBUS_OVP_STAT || data.VSYS_OVP_STAT || data.VBAT_OVP_STAT || data.TSHUT_STAT) ? 'visible' : 'hidden';
        if (data.TS_COOL_STAT == 1 || data.TS_COLD_STAT == 1) {
            UIElements.tempIndicator.style.visibility = 'visible';
            UIElements.tempIndicatorCircle.style.fill = 'var(--info-color)';
        } else if (data.TS_WARM_STAT == 1 || data.TS_HOT_STAT == 1) {
            UIElements.tempIndicator.style.visibility = 'visible';
            UIElements.tempIndicatorCircle.style.fill = 'var(--warning-color)';
        }
    }
    
    function setPathStyle(path, { color, isAnimated, isReversed = false, isStatic = false }) {
        path.style.stroke = color;
        path.style.opacity = '1';
        if (isAnimated) {
            path.classList.add('flow-active');
            if (isReversed) path.classList.add('flow-otg');
        }
        if (isStatic) {
            path.classList.add('hiz-mode');
        }
    }

    function resetVisuals() {
        const paths = [UIElements.pathVbusToChip, UIElements.pathChipToBat, UIElements.pathBatToChip];
        paths.forEach(p => {
            p.className.baseVal = 'power-path';
            p.style.stroke = 'transparent';
            p.style.opacity = '0';
        });
        
        UIElements.vbusComponentRect.style.stroke = '';
        UIElements.batteryRect.style.stroke = '';
        UIElements.batteryCap.style.stroke = '';
        UIElements.chipRect.style.stroke = '';
        
        UIElements.faultIndicator.style.visibility = 'hidden';
        UIElements.tempIndicator.style.visibility = 'hidden';
        UIElements.batteryComponent.style.opacity = '1';
    }

    function updateVbusPath(data) {
        const path = UIElements.pathVbusToChip;
        const d = data; // shorthand
        
        // Priority List: قطع, قرمز(رفت), قرمز(برگشت), خاکستری, صورتی, زرد(رفت), زرد(برگشت), بنفش, سبز, آبی
        
        // 1. قطع
        if ((d.VBUS_PRESENT_STAT == 0 && d.AC1_PRESENT_STAT == 0 && d.AC2_PRESENT_STAT == 0) && d.EN_OTG == 0) {
            console.log("VBUS Path: قطع");
        }
        // 2. قرمز (رفت)
        else if ((d.VBUS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.VAC_OVP_STAT == 1) && (d.VBUS_PRESENT_STAT == 1 || d.AC1_PRESENT_STAT == 1 || d.AC2_PRESENT_STAT == 1) && d.EN_OTG == 0) {
            console.log("VBUS Path: قرمز (رفت)");
            setPathStyle(path, { color: 'var(--error-color)', isAnimated: true });
        }
        // 3. قرمز (برگشت)
        else if ((d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.VBATOTG_LOW_STAT == 1) && d.EN_OTG == 1 && d.CHG_STAT_2_0 == 0) {
            console.log("VBUS Path: قرمز (برگشت)");
            setPathStyle(path, { color: 'var(--error-color)', isAnimated: true, isReversed: true });
        }
        // 4. خاکستری (رفت و برگشت)
        else if (((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.SDRV_CTRL == 0 && (d.VBUS_PRESENT_STAT == 1 || d.EN_OTG == 1) && (d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.EN_HIZ == 1 || d.VSYS_SHORT_STAT == 1)) {
            console.log("VBUS Path: خاکستری (رفت و برگشت)");
            setPathStyle(path, { color: 'var(--idle-color)', isAnimated: false, isStatic: true });
        }
        // 5. صورتی (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.EN_OTG == 1 && ((d.ACRB1_STAT == 1 || d.ACRB2_STAT == 1) && (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0)) && d.CHG_STAT_2_0 == 0) {
            console.log("VBUS Path: صورتی (برگشت)");
            setPathStyle(path, { color: 'var(--secondary-color)', isAnimated: true, isReversed: true });
        }
        // 6. زرد (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1)) {
            console.log("VBUS Path: زرد (رفت)");
            setPathStyle(path, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 7. زرد (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.EN_OTG == 1 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1)) {
            console.log("VBUS Path: زرد (برگشت)");
            setPathStyle(path, { color: 'var(--warning-color)', isAnimated: true, isReversed: true });
        }
        // 8. بنفش (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && ((d.CHG_STAT_2_0 == 0 || d.CHG_STAT_2_0 == 7) || (d.CHG_TMR_STAT == 1 || d.TRICHG_TMR_STAT == 1 || d.PRECHG_TMR_STAT == 1 || d.TS_WARM_STAT == 1 || d.TS_HOT_STAT == 1 || (d.STOP_WD_CHG == 1 && d.WD_STAT == 1))) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0) {
            console.log("VBUS Path: بنفش (رفت)");
            setPathStyle(path, { color: '#a855f7', isAnimated: true });
        }
        // 9. سبز (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_HOT_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0) {
            console.log("VBUS Path: سبز (رفت)");
            setPathStyle(path, { color: 'var(--success-color)', isAnimated: true });
        }
        // 10. آبی (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.EN_OTG == 1 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0) {
            console.log("VBUS Path: آبی (برگشت)");
            setPathStyle(path, { color: 'var(--info-color)', isAnimated: true, isReversed: true });
        }
    }

    function updateVbatPath(data) {
        const pathToBat = UIElements.pathChipToBat;
        const pathFromBat = UIElements.pathBatToChip;
        const d = data; // shorthand

        // Priority List: قطع, خاکستری, قرمز, مشکی, صورتی, زرد(رفت), زرد(برگشت), آبی, بنفش, سبز
        
        // 1. قطع
        if (d.VBAT_PRESENT_STAT == 0 || d.SDRV_CTRL != 0 || (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && (d.VBUS_PRESENT_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 7 && d.EN_OTG == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)))) {
            console.log("VBAT Path: قطع");
        }
        // 2. خاکستری
        else if (d.IBAT_OCP_STAT == 1 && d.SFET_PRESENT == 1 && d.EN_BATOCP == 1) {
            console.log("VBAT Path: خاکستری");
            setPathStyle(pathFromBat, { color: 'var(--idle-color)', isAnimated: false, isStatic: true });
        }
        // 3. قرمز
        else if (((d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1 || d.TSHUT_STAT == 1) || (d.EN_OTG == 1 && (d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.VBATOTG_LOW_STAT == 1))) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: قرمز");
            setPathStyle(pathFromBat, { color: 'var(--error-color)', isAnimated: false, isStatic: true });
        }
        // 4. مشکی
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 0 && d.VBAT_PRESENT_STAT == 1 && d.VBUS_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBUS_STAT_3_0 != 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && d.EN_CHG == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: مشکی");
            setPathStyle(pathFromBat, { color: '#333', isAnimated: false, isStatic: true });
        }
        // 5. صورتی
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 1 && d.VBAT_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && ((d.ACRB1_STAT == 1 || d.ACRB2_STAT == 1) && (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0)) && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: صورتی");
            setPathStyle(pathFromBat, { color: 'var(--secondary-color)', isAnimated: true });
        }
        // 6. زرد (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_HOT_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1)) {
            console.log("VBAT Path: زرد (رفت)");
            setPathStyle(pathToBat, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 7. زرد (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 1 && d.VBAT_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1) && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: زرد (برگشت)");
            setPathStyle(pathFromBat, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 8. آبی (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 1 && d.VBAT_PRESENT_STAT == 1 && d.VBUS_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBUS_STAT_3_0 != 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: آبی");
            setPathStyle(pathFromBat, { color: 'var(--info-color)', isAnimated: true });
        }
        // 9. بنفش (برگشت)
        else if ((d.VBUS_PRESENT_STAT == 0 || (d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1)) && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && (d.EN_OTG == 0 || ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1))) && d.VBAT_PRESENT_STAT == 1) {
            console.log("VBAT Path: بنفش");
            setPathStyle(pathFromBat, { color: '#a855f7', isAnimated: true });
        }
        // 10. سبز (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_HOT_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0) {
            console.log("VBAT Path: سبز");
            setPathStyle(pathToBat, { color: 'var(--success-color)', isAnimated: true });
        }
    }

    function updateVbusIcon(data) {
        const d = data;
        if (d.VBUS_PRESENT_STAT == 0 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0))) {
            console.log("VBUS Icon: خاکستری");
            UIElements.vbusComponentRect.style.stroke = 'var(--idle-color)';
        } else if (((d.VBUS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.VAC_OVP_STAT == 1) && (d.VBUS_PRESENT_STAT == 1 || d.AC1_PRESENT_STAT == 1 || d.AC2_PRESENT_STAT == 1)) || (d.EN_OTG == 1 && (d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1 || d.TS_WARM_STAT == 1 || d.TS_COLD_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.TSHUT_STAT == 1 || d.VBATOTG_LOW_STAT == 1)) && d.SDRV_CTRL == 0) {
            console.log("VBUS Icon: قرمز");
            UIElements.vbusComponentRect.style.stroke = 'var(--error-color)';
        } else {
            // No log for default state
            UIElements.vbusComponentRect.style.stroke = 'var(--info-color)';
        }
    }

    function updateVbatIcon(data) {
        const d = data;
        const setBatteryStroke = (color) => {
            UIElements.batteryRect.style.stroke = color;
            UIElements.batteryCap.style.stroke = color;
        };

        if (d.VBAT_PRESENT_STAT == 0 || d.SDRV_CTRL != 0) {
            console.log("VBAT Icon: خاکستری");
            setBatteryStroke('var(--idle-color)');
            UIElements.batteryComponent.style.opacity = '0.3';
        } else if (((d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1 || d.TSHUT_STAT == 1) || (d.EN_OTG == 1 && (d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.VBATOTG_LOW_STAT == 1)) || d.CHG_TMR_STAT == 1 || d.PRECHG_TMR_STAT == 1 || d.TRICHG_TMR_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.SDRV_CTRL == 0) {
            console.log("VBAT Icon: قرمز");
            setBatteryStroke('var(--error-color)');
        } else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 1 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_WARM_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && (d.VBUS_PRESENT_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 7 && d.EN_OTG == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_WARM_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.SDRV_CTRL == 0) {
            console.log("VBAT Icon: سبز (شارژ کامل)");
            setBatteryStroke('var(--success-color)');
        } else {
            // No log for default state
            setBatteryStroke('var(--success-color)');
        }
    }

    // --- Demo / Mock Data Fetching ---
    function mockFetch() {
        // Corrected states to trigger each specific condition
        const states = [
            // VBUS Path States
            { name: "VBUS رفت - سبز (Charging Normal)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 3, EN_CHG: 1, IBAT_ADC_15_0: 2000, VBUS_OVP_STAT: 0, VSYS_OVP_STAT: 0, VBAT_OVP_STAT: 0, IBUS_OCP_STAT: 0, PG_STAT: 0, TSHUT_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0, EN_OTG: 0, TS_COLD_STAT: 0, TS_WARM_STAT: 0, EN_HIZ: 0, SDRV_CTRL: 0, VAC_OVP_STAT: 0, VSYS_SHORT_STAT: 0, ACRB1_STAT: 0, ACRB2_STAT: 0, EN_ACDRV1: 0, EN_ACDRV2: 0, CHG_TMR_STAT: 0, TRICHG_TMR_STAT: 0, PRECHG_TMR_STAT: 0, TS_HOT_STAT: 0, VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, IBAT_OCP_STAT: 0, STOP_WD_CHG: 0, WD_STAT: 0, VINDPM_STAT: 0, IINDPM_STAT: 0, IBAT_REG_STAT: 0, TREG_STAT: 0 },
            { name: "VBUS رفت - زرد (Charging DPM)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 3, EN_CHG: 1, VINDPM_STAT: 1, IBAT_ADC_15_0: 1800, VBUS_OVP_STAT: 0, VSYS_OVP_STAT: 0, VBAT_OVP_STAT: 0, IBUS_OCP_STAT: 0, PG_STAT: 0, TSHUT_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0, EN_OTG: 0, TS_COLD_STAT: 0, TS_WARM_STAT: 0, EN_HIZ: 0, SDRV_CTRL: 0, VAC_OVP_STAT: 0, VSYS_SHORT_STAT: 0, ACRB1_STAT: 0, ACRB2_STAT: 0, EN_ACDRV1: 0, EN_ACDRV2: 0, IINDPM_STAT: 0, IBAT_REG_STAT: 0, TREG_STAT: 0 },
            { name: "VBUS Path: بنفش (SYS Only, Charge Complete)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 0, CHG_STAT_2_0: 7, VBUS_OVP_STAT: 0, VSYS_OVP_STAT: 0, VBAT_OVP_STAT: 0, IBUS_OCP_STAT: 0, PG_STAT: 0, TSHUT_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0, EN_OTG: 0, TS_COLD_STAT: 0, TS_WARM_STAT: 0, EN_HIZ: 0, SDRV_CTRL: 0, VAC_OVP_STAT: 0, VSYS_SHORT_STAT: 0, ACRB1_STAT: 0, ACRB2_STAT: 0, EN_ACDRV1: 0, EN_ACDRV2: 0, CHG_TMR_STAT: 0, TRICHG_TMR_STAT: 0, PRECHG_TMR_STAT: 0, TS_HOT_STAT: 0, STOP_WD_CHG: 0, WD_STAT: 0, VINDPM_STAT: 0, IINDPM_STAT: 0, IBAT_REG_STAT: 0, TREG_STAT: 0 },
            { name: "VBUS Path: قرمز (رفت - VBUS OVP Fault)", VBUS_OVP_STAT: 1, IBUS_OCP_STAT: 0, VAC_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0, EN_OTG: 0 },
            // { name: "VBUS Path: آبی (OTG Normal)", EN_OTG: 1, VBAT_PRESENT_STAT: 1, VBUS_PRESENT_STAT: 1, CHG_STAT_2_0: 0 },
            // { name: "VBUS Path: زرد (برگشت - OTG DPM)", EN_OTG: 1, VBAT_PRESENT_STAT: 1, VBUS_PRESENT_STAT: 1, VINDPM_STAT: 1, CHG_STAT_2_0: 0 },
            { name: "VBUS Path: قرمز (برگشت - OTG Fault)", TS_COLD_STAT: 0, TS_WARM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 1, VBATOTG_LOW_STAT: 0, EN_OTG: 1, CHG_STAT_2_0: 0 },
            // { name: "VBUS Path: صورتی (OTG, ACFETs Off)", EN_OTG: 1, VBAT_PRESENT_STAT: 1, ACRB1_STAT: 1, EN_ACDRV1: 0, CHG_STAT_2_0: 0 },
            // { name: "VBUS Path: خاکستری (Shared Fault HIZ)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, EN_HIZ: 1 },
            // { name: "VBUS Path: قطع", VBUS_PRESENT_STAT: 0, VBAT_PRESENT_STAT: 1, EN_OTG: 0 },
            // // VBAT Path States
            // { name: "VBAT Path: سبز (Charging)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 3, EN_CHG: 1 },
            // { name: "VBAT Path: زرد (رفت - Charging DPM)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 3, EN_CHG: 1, TREG_STAT: 1 },
            // { name: "VBAT Path: بنفش (Battery Only)", VBUS_PRESENT_STAT: 0, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 0 },
            // { name: "VBAT Path: قرمز (Battery Fault)", VBAT_PRESENT_STAT: 1, TS_HOT_STAT: 1, CHG_STAT_2_0: 0 },
            // { name: "VBAT Path: مشکی (Charge Disabled by User)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 0, EN_CHG: 0 },
            // { name: "VBAT Path: خاکستری (IBAT OCP)", VBAT_PRESENT_STAT: 1, IBAT_OCP_STAT: 1, SFET_PRESENT: 1, EN_BATOCP: 1 },
            // { name: "VBAT Path: قطع (Charge Complete)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 1, CHG_STAT_2_0: 7 },
            // { name: "VBAT Path: قطع (No Battery)", VBUS_PRESENT_STAT: 1, VBAT_PRESENT_STAT: 0 },
        ];
        
        const allKeys = new Set();
        states.forEach(state => Object.keys(state).forEach(key => allKeys.add(key)));
        const defaultState = {};
        allKeys.forEach(key => { if(key !== 'name') defaultState[key] = 0; });

        const completeStates = states.map(s => ({ ...defaultState, ...s }));

        let currentStateIndex = 0;
        
        const cycleStates = () => {
            const currentState = completeStates[currentStateIndex];
            console.clear(); // Clear console for new state
            console.log(`%c --- Updating to state: ${currentState.name} --- `, 'background: #222; color: #bada55');
            const displayData = {
                VBUS_ADC_15_0: currentState.VBUS_PRESENT_STAT ? 12000 : 0,
                VBAT_ADC_15_0: currentState.VBAT_PRESENT_STAT ? 7800 : 0,
                VSYS_ADC_15_0: (currentState.VBUS_PRESENT_STAT || currentState.VBAT_PRESENT_STAT) ? 8000 : 0,
                IBUS_ADC_15_0: 1500,
                TDIE_ADC_15_0: 45,
                IBAT_ADC_15_0: 0, // Default to 0 unless specified
                ...currentState
            };
            updateUI(displayData);
            currentStateIndex = (currentStateIndex + 1) % completeStates.length;
        };
        
        cycleStates();
        setInterval(cycleStates, 4000);
    }

    mockFetch();
});
