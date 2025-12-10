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
        updateSysPath(data); // تابع جدید برای مسیر SYS
        updateVbusIcon(data);
        updateVbatIcon(data);
        
        UIElements.faultIndicator.style.visibility = (data.VBUS_OVP_STAT || data.VSYS_OVP_STAT || data.VBAT_OVP_STAT || data.TSHUT_STAT) ? 'visible' : 'hidden';
        if (data.TS_COOL_STAT == 1 || data.TS_COLD_STAT == 1) {
            UIElements.tempIndicator.style.visibility = 'visible';
            UIElements.tempIndicatorCircle.style.fill = 'var(--info-color)';
        } else if (data.TS_HOT_STAT == 1 || data.TS_COLD_STAT == 1) {
            UIElements.tempIndicator.style.visibility = 'visible';
            UIElements.tempIndicatorCircle.style.fill = 'var(--warning-color)';
        }
    }
    
    function setPathStyle(path, { color, isAnimated, isReversed = false, isStatic = false }) {
        path.style.stroke = color;
        path.style.opacity = '1';
        // Reset classes
        path.classList.remove('flow-active', 'flow-otg', 'hiz-mode');
        
        if (isAnimated) {
            path.classList.add('flow-active');
            if (isReversed) path.classList.add('flow-otg');
        }
        if (isStatic) {
            path.classList.add('hiz-mode');
        }
    }

    function resetVisuals() {
        // اضافه کردن pathChipToSys به لیست ریست
        const paths = [UIElements.pathVbusToChip, UIElements.pathChipToSys, UIElements.pathChipToBat, UIElements.pathBatToChip];
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

    // --- تابع جدید برای مسیر SYS ---
    function updateSysPath(data) {
        const path = UIElements.pathChipToSys;
        
        // اطمینان از وجود مقادیر برای جلوگیری از خطا
        const vbat = data.VBAT_ADC_15_0 || 0;
        const vsys = data.VSYS_ADC_15_0 || 0;

        // اگر سیستم کاملاً خاموش است (هر دو ولتاژ صفر یا بسیار کم)، چیزی رسم نکن
        if (vbat < 100 && vsys < 100) return;

        if (vbat > vsys) {
            // حالت 1: ولتاژ باتری بیشتر است -> مصرف از باتری
            // رنگ: نارنجی، جهت: به سمت SYS (پیش‌فرض)
            console.log("SYS Path: تغذیه از باتری (نارنجی)");
            setPathStyle(path, { color: 'orange', isAnimated: true, isReversed: false });
        } else {
            // حالت 2: ولتاژ باتری کمتر است (آداپتور وصل است) -> مصرف از آداپتور
            // رنگ: سبز، جهت: به سمت SYS (پیش‌فرض)
            console.log("SYS Path: تغذیه از آداپتور (سبز)");
            setPathStyle(path, { color: 'var(--success-color)', isAnimated: true, isReversed: false });
        }
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
        else if ((d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.VBATOTG_LOW_STAT == 1 || d.VBUS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.VAC_OVP_STAT == 1) && d.EN_OTG == 1 && d.CHG_STAT_2_0 == 0) {
            console.log("VBUS Path: قرمز (برگشت)");
            setPathStyle(path, { color: 'var(--error-color)', isAnimated: true, isReversed: true });
        }
        // 4. خاکستری (رفت و برگشت)
        else if (((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.SDRV_CTRL == 0 && (d.VBUS_PRESENT_STAT == 1 || d.EN_OTG == 1) && (d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.EN_HIZ == 1 || d.VSYS_SHORT_STAT == 1)) {
            console.log("VBUS Path: خاکستری (رفت و برگشت)");
            setPathStyle(path, { color: 'var(--idle-color)', isAnimated: false, isStatic: true });
        }
        // 5. صورتی (رفت و برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && ((d.ACRB1_STAT == 1 || d.ACRB2_STAT == 1) && (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0)) && d.CHG_STAT_2_0 == 0) {
            console.log("VBUS Path: صورتی (برگشت)");
            setPathStyle(path, { color: 'var(--secondary-color)', isAnimated: true, isReversed: true });
        }
        // 6. زرد (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1)) {
            console.log("VBUS Path: زرد (رفت)");
            setPathStyle(path, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 7. زرد (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.EN_OTG == 1 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1) && d.VBUS_STAT_3_0 == 7) {
            console.log("VBUS Path: زرد (برگشت)");
            setPathStyle(path, { color: 'var(--warning-color)', isAnimated: true, isReversed: true });
        }
        // 8. بنفش (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && ((d.CHG_STAT_2_0 == 0 || d.CHG_STAT_2_0 == 7) || (d.CHG_TMR_STAT == 1 || d.TRICHG_TMR_STAT == 1 || d.PRECHG_TMR_STAT == 1 || d.TS_HOT_STAT == 1 || d.TS_COLD_STAT == 1 || (d.STOP_WD_CHG == 1 && d.WD_STAT == 1))) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0) {
            console.log("VBUS Path: بنفش (رفت)");
            setPathStyle(path, { color: '#a855f7', isAnimated: true });
        }
        // 9. سبز (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && (d.TS_WARM_STAT == 0 || (d.JEITA_VSET_2 != 0 && d.JEITA_ISETH_1 != 0)) && (d.TS_COOL_STAT == 0 || (d.JEITA_ISETC_1 != 0))) {
            console.log("VBUS Path: سبز (رفت)");
            setPathStyle(path, { color: 'var(--success-color)', isAnimated: true });
        }
        // 10. آبی (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.EN_OTG == 1 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && d.VBUS_STAT_3_0 == 7) {
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
        if (d.VBAT_PRESENT_STAT == 0 || d.SDRV_CTRL != 0 || (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && (d.VBUS_PRESENT_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 7 && d.EN_OTG == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.TS_WARM_STAT == 0 || (d.JEITA_VSET_2 != 0 && d.JEITA_ISETH_1 != 0)) && (d.TS_COOL_STAT == 0 || (d.JEITA_ISETC_1 != 0)))) {
            console.log("VBAT Path: قطع");
        }
        // 2. خاکستری
        else if (d.IBAT_OCP_STAT == 1 && d.SFET_PRESENT == 1 && d.EN_BATOCP == 1) {
            console.log("VBAT Path: خاکستری");
            setPathStyle(pathFromBat, { color: 'var(--idle-color)', isAnimated: false, isStatic: true });
        }
        // 3. قرمز
        else if (((d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1)) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: قرمز");
            setPathStyle(pathFromBat, { color: 'var(--error-color)', isAnimated: true, isStatic: false });
        }
        // 4. بنفش (برگشت)
        else if ((d.VBUS_PRESENT_STAT == 0 || (d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.EN_HIZ == 1 || d.VBATOTG_LOW_STAT == 1 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1)) && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && (d.EN_OTG == 0 || ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1))) && d.VBAT_PRESENT_STAT == 1) {
            console.log("VBAT Path: بنفش");
            setPathStyle(pathFromBat, { color: '#a855f7', isAnimated: true });
        }
        // 5. صورتی
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 1 && d.VBAT_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && ((d.ACRB1_STAT == 1 || d.ACRB2_STAT == 1) && (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0)) && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: صورتی");
            setPathStyle(pathFromBat, { color: 'var(--secondary-color)', isAnimated: true });
        }
        // 6. زرد (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && ((d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1) && (d.VSYS_ADC_15_0 > d.VBAT_ADC_15_0)) && (d.TS_WARM_STAT == 0 || (d.JEITA_VSET_2 != 0 && d.JEITA_ISETH_1 != 0)) && (d.TS_COOL_STAT == 0 || (d.JEITA_ISETC_1 != 0))) {
            console.log("VBAT Path: زرد (رفت)");
            setPathStyle(pathToBat, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 7. زرد (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && ((d.EN_OTG == 1 && d.TS_COLD_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && (d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1) && d.CHG_STAT_2_0 == 0) || (d.VBUS_PRESENT_STAT == 1 && d.EN_OTG == 0 && d.TS_COLD_STAT == 0 && ((d.VINDPM_STAT == 1 || d.IINDPM_STAT == 1 || d.IBAT_REG_STAT == 1 || d.TREG_STAT == 1) && (d.VSYS_ADC_15_0 <= d.VBAT_ADC_15_0)))) && d.TS_HOT_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.SDRV_CTRL == 0) {
            if (d.EN_OTG == 1){
                console.log("VBAT Path: زرد (برگشت) حالت OTG");
            } else {
                console.log("VBAT Path: زرد (برگشت) حالت supplement.");
            };
            setPathStyle(pathFromBat, { color: 'var(--warning-color)', isAnimated: true });
        }
        // 8. آبی (برگشت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 1 && d.VBAT_PRESENT_STAT == 1 && d.VBUS_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBUS_STAT_3_0 == 7 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && d.CHG_STAT_2_0 == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: آبی در vbat");
            setPathStyle(pathFromBat, { color: 'var(--info-color)', isAnimated: true });
        }
        // 9. مشکی
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.EN_OTG == 0 && d.VBAT_PRESENT_STAT == 1 && d.VBUS_PRESENT_STAT == 1 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VBUS_STAT_3_0 != 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.CHG_STAT_2_0 == 0 && d.EN_CHG == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && d.SDRV_CTRL == 0) {
            console.log("VBAT Path: مشکی");
            setPathStyle(pathFromBat, { color: '#333', isAnimated: false, isStatic: true });
        }
        // 10. سبز (رفت)
        else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && d.VBUS_PRESENT_STAT == 1 && d.VBAT_PRESENT_STAT == 1 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && (d.CHG_STAT_2_0 != 0 && d.CHG_STAT_2_0 != 7) && d.CHG_TMR_STAT == 0 && d.TRICHG_TMR_STAT == 0 && d.PRECHG_TMR_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBATOTG_LOW_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && (d.STOP_WD_CHG == 0 || d.WD_STAT == 0) && d.SDRV_CTRL == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && (d.TS_WARM_STAT == 0 || (d.JEITA_VSET_2 != 0 && d.JEITA_ISETH_1 != 0)) && (d.TS_COOL_STAT == 0 || (d.JEITA_ISETC_1 != 0))) {
            console.log("VBAT Path: سبز");
            setPathStyle(pathToBat, { color: 'var(--success-color)', isAnimated: true });
        }
        else {
            console.log("bad working now.")
        }
    }

    function updateVbusIcon(data) {
        const d = data;
        if (d.VBUS_PRESENT_STAT == 0 && d.EN_OTG == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 0 && d.EN_ACDRV2 == 0))) {
            console.log("VBUS Icon: خاکستری");
            UIElements.vbusComponentRect.style.stroke = 'var(--idle-color)';
        } else if (((d.VBUS_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.VAC_OVP_STAT == 1) && (d.VBUS_PRESENT_STAT == 1 || d.AC1_PRESENT_STAT == 1 || d.AC2_PRESENT_STAT == 1)) || (d.EN_OTG == 1 && (d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1 || d.TS_HOT_STAT == 1 || d.TS_COLD_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.TSHUT_STAT == 1 || d.VBATOTG_LOW_STAT == 1)) && d.SDRV_CTRL == 0) {
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
        } else if (((d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBAT_OCP_STAT == 1 || d.TSHUT_STAT == 1) || (d.EN_OTG == 1 && (d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || d.VBATOTG_LOW_STAT == 1)) || d.CHG_TMR_STAT == 1 || d.PRECHG_TMR_STAT == 1 || d.TRICHG_TMR_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.SDRV_CTRL == 0) {
            console.log("VBAT Icon: قرمز");
            setBatteryStroke('var(--error-color)');
        } else if (!(d.VBUS_OVP_STAT == 1 || d.VSYS_OVP_STAT == 1 || d.VBAT_OVP_STAT == 1 || d.IBUS_OCP_STAT == 1 || d.PG_STAT == 0 || d.TSHUT_STAT == 1 || d.OTG_OVP_STAT == 1 || d.OTG_UVP_STAT == 1 || (d.EN_OTG == 1 && (d.TS_COLD_STAT == 1 || d.TS_HOT_STAT == 1)) || d.EN_HIZ == 1 || d.SDRV_CTRL != 0 || d.VAC_OVP_STAT == 1 || d.VSYS_SHORT_STAT == 1) && (d.VBUS_PRESENT_STAT == 1) && d.VBAT_PRESENT_STAT == 1 && d.CHG_STAT_2_0 == 7 && d.EN_OTG == 0 && d.VBATOTG_LOW_STAT == 0 && d.TS_COLD_STAT == 0 && d.TS_HOT_STAT == 0 && d.VBAT_OVP_STAT == 0 && d.IBAT_OCP_STAT == 0 && d.TSHUT_STAT == 0 && d.OTG_OVP_STAT == 0 && d.OTG_UVP_STAT == 0 && d.VINDPM_STAT == 0 && d.IINDPM_STAT == 0 && d.IBAT_REG_STAT == 0 && d.TREG_STAT == 0 && ((d.ACRB1_STAT == 0 && d.ACRB2_STAT == 0) || (d.EN_ACDRV1 == 1 || d.EN_ACDRV2 == 1)) && d.SDRV_CTRL == 0 && (d.TS_WARM_STAT == 0 || (d.JEITA_VSET_2 != 0 && d.JEITA_ISETH_1 != 0)) && (d.TS_COOL_STAT == 0 || (d.JEITA_ISETC_1 != 0))) {
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
            // ---------- updateVbusPath cases (1..10) ----------
            // VBUS 1. قطع: VBUS=0, AC1=0, AC2=0, EN_OTG=0
            // {
            //     name: "VBUS - 1 قطع",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 0,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 2. قرمز (رفت): یک OVP/OCP و یک منبع حاضر، EN_OTG=0
            // {
            //     name: "VBUS - 2 قرمز (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 1, // trigger
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1, // source present
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 3. قرمز (برگشت): EN_OTG=1 و یکی از (TS_COLD/TS_HOT/OTG_OVP/OTG_UVP/VBATOTG_LOW)=1 و CHG_STAT_2_0==0
            // {
            //     name: "VBUS - 3 قرمز (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 1, OTG_UVP_STAT: 0, // trigger
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 4. خاکستری (رفت و برگشت): (ACRB both 0 OR EN_ACDRV=1) && SDRV_CTRL==0 && (VBUS_PRESENT || EN_OTG) && one of (VSYS_OVP, VBAT_OVP, PG, TSHUT, EN_HIZ, VSYS_SHORT)==1
            // {
            //     name: "VBUS - 4 خاکستری (رفت و برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 1, EN_OTG: 0, // EN_HIZ triggers last clause
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 5. صورتی (برگشت): many negatives, EN_OTG==1, ACRB1 or ACRB2 ==1, EN_ACDRV1/2 ==0, CHG_STAT_2_0==0
            // {
            //     name: "VBUS - 5 صورتی (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 1, ACRB2_STAT: 0, // ACRB1 true
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 6. زرد (رفت): negatives, VBUS_PRESENT=1, EN_OTG=0, ACRB both 0 OR EN_ACDRV1==1, and VINDPM_STAT==1 (DPM)
            // {
            //     name: "VBUS - 6 زرد (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 1, EN_ACDRV2: 0, // use EN_ACDRV1 to satisfy OR
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 1, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0, VSYS_ADC_15_0: 10000, VBAT_ADC_15_0: 110000
            // },

            // // VBUS 7. زرد (برگشت): like 6 but EN_OTG=1 and CHG_STAT_2_0==0 and DPM flag 1
            // {
            //     name: "VBUS - 7 زرد (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 1, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 1, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0,  VSYS_ADC_15_0: 10000, VBAT_ADC_15_0: 9000
            // },

            // // VBUS 7. زرد (برگشت2): like 6 but EN_OTG=0 and DPM flag 1
            // {
            //     name: "VBUS - 7 زرد (برگشت2)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 2, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 1, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 1, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0,  VSYS_ADC_15_0: 10000, 
            //     VBAT_ADC_15_0: 11000
            //     // VBAT_ADC_15_0: 9000
            // },

            // // VBUS 8. بنفش (رفت): negatives, VBUS_PRESENT=1, EN_OTG=0, ACRB both 0 or EN_ACDRV, CHG_STAT_2_0 == 7 (or 0)
            // {
            //     name: "VBUS - 8 بنفش (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 7, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 1, // allow AC driver present
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 1, VAC_OVP_STAT: 0, // TS_HOT used in purple-inner OR, still okay because purple allows
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 9. سبز (رفت): negatives, VBUS_PRESENT=1, VBAT_PRESENT=1, EN_OTG=0, CHG_STAT_2_0 != 0 && !=7 (e.g., 3)
            // {
            //     name: "VBUS - 9 سبز (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 3, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBUS 10. آبی (برگشت): negatives, EN_OTG=1, CHG_STAT_2_0==0, DPM/IBAT/TREG == 0
            // {
            //     name: "VBUS - 10 آبی (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // ---------- updateVbatPath cases (1..10) ----------
            // // VBAT 1. قطع: VBAT_PRESENT_STAT == 0 triggers first if
            // {
            //     name: "VBAT - 1 قطع",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 0, // triggers
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 2. خاکستری: IBAT_OCP_STAT==1 && SFET_PRESENT==1 && EN_BATOCP==1
            // {
            //     name: "VBAT - 2 خاکستری",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 1, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 1, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 1, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 3. قرمز: TS_... or VBAT_OVP or IBAT_OCP or TSHUT OR (EN_OTG && OTG_OVP/UVP/VBATOTG_LOW)  && VBAT_PRESENT==1 && CHG_STAT_2_0==0 && SDRV_CTRL==0
            // {
            //     name: "VBAT - 3 قرمز",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 1, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1, // present
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 4. مشکی: many negatives, EN_OTG==0, VBAT_PRESENT==1, VBUS_PRESENT==1, VBUS_STAT_3_0 != 0, CHG_STAT_2_0==0, EN_CHG==0, SDRV_CTRL==0
            // {
            //     name: "VBAT - 4 مشکی",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 1, // != 0
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 5. صورتی: EN_OTG==1 and ACRB1 or ACRB2 ==1 and EN_ACDRVs==0 and CHG_STAT_2_0==0
            // {
            //     name: "VBAT - 5 صورتی",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 1, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 6. زرد (رفت): VBUS_PRESENT=1 && VBAT_PRESENT=1 && EN_OTG=0 && CHG_STAT_2_0 != 0 && some DPM/IBAT_REG/TREG==1
            // {
            //     name: "VBAT - 6 زرد (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 3, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 1, IBUS_OCP_STAT: 0, // IBAT_REG triggers group
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 7. زرد (برگشت): EN_OTG=1 && VBAT_PRESENT=1 && DPM flag OR IBAT_REG==1 && CHG_STAT_2_0==0
            // {
            //     name: "VBAT - 7 زرد (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 1, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0, // DPM present
            //     WD_STAT: 0
            // },

            // // VBAT 8. آبی (برگشت): many negatives && EN_OTG==1 && VBAT_PRESENT==1 && VBUS_PRESENT==1 && VBUS_STAT_3_0==7 && CHG_STAT_2_0==0
            // {
            //     name: "VBAT - 8 آبی (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 1,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 7, // requires 7
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 9. بنفش (برگشت): (VBUS_PRESENT == 0 OR some alarm) && CHG_STAT_2_0==0 && SDRV_CTRL==0 && VBAT_PRESENT==1
            // {
            //     name: "VBAT - 9 بنفش (برگشت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 0, CHG_TMR_STAT: 0,
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, // VBUS_PRESENT=0 makes the OR true
            //     VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // },

            // // VBAT 10. سبز (رفت): negatives, VBUS_PRESENT=1, VBAT_PRESENT=1, EN_OTG=0, CHG_STAT_2_0 !=0 && !=7 (charging)
            // {
            //     name: "VBAT - 10 سبز (رفت)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 5, CHG_TMR_STAT: 0, // some charging state not 0 or 7
            //     EN_ACDRV1: 0, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_COLD_STAT: 0, TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1,
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 0,
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0
            // }
            
            // مثال 1: آداپتور نیست، ولتاژ باتری بیشتر از Sys (مسیر نارنجی به سمت Sys)
            {
                name: "مثال 1: بدون آداپتور، باتری > Sys (مسیر نارنجی)",
                AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
                ACRB1_STAT: 0, ACRB2_STAT: 0,
                CHG_STAT_2_0: 0, // شارژ نمی‌شود
                EN_ACDRV1: 0, EN_ACDRV2: 0,
                EN_BATOCP: 0, EN_CHG: 0, EN_HIZ: 0, EN_OTG: 0,
                IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
                IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
                pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
                SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
                TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
                TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
                VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1, // باتری وصل است
                VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 0, VBUS_STAT_3_0: 0, // آداپتور نیست
                VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
                WD_STAT: 0,
                VSYS_ADC_15_0: 3800, // ولتاژ سیستم کمتر
                VBAT_ADC_15_0: 4200  // ولتاژ باتری بیشتر
            },

            // // مثال 2: آداپتور هست، در حال شارژ، ولتاژ Sys بیشتر از باتری (مسیر سبز به سمت Sys)
            // {
            //     name: "مثال 2: شارژ با آداپتور، Sys > باتری (مسیر سبز)",
            //     AC1_PRESENT_STAT: 0, AC2_PRESENT_STAT: 0,
            //     ACRB1_STAT: 0, ACRB2_STAT: 0,
            //     CHG_STAT_2_0: 3, // در حال شارژ سریع
            //     EN_ACDRV1: 1, EN_ACDRV2: 0,
            //     EN_BATOCP: 0, EN_CHG: 1, EN_HIZ: 0, EN_OTG: 0,
            //     IBAT_OCP_STAT: 0, IBAT_REG_STAT: 0, IBUS_OCP_STAT: 0,
            //     IINDPM_STAT: 0, OTG_OVP_STAT: 0, OTG_UVP_STAT: 0,
            //     pg_stat: 1, PRECHG_TMR_STAT: 0, SDRV_CTRL: 0,
            //     SFET_PRESENT: 0, STOP_WD_CHG: 0, TREG_STAT: 0,
            //     TRICHG_TMR_STAT: 0, TSHUT_STAT: 0, TS_COLD_STAT: 0,
            //     TS_HOT_STAT: 0, VAC_OVP_STAT: 0,
            //     VBATOTG_LOW_STAT: 0, VBAT_OVP_STAT: 0, VBAT_PRESENT_STAT: 1, // باتری وصل
            //     VBUS_OVP_STAT: 0, VBUS_PRESENT_STAT: 1, VBUS_STAT_3_0: 3, // آداپتور وصل (DCP)
            //     VINDPM_STAT: 0, VSYS_OVP_STAT: 0, VSYS_SHORT_STAT: 0,
            //     WD_STAT: 0,
            //     VSYS_ADC_15_0: 4400, // ولتاژ سیستم بیشتر
            //     VBAT_ADC_15_0: 3900  // ولتاژ باتری کمتر
            // }
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
