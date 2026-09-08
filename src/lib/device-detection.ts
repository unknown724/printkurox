/**
 * Deep Device, Brand, and Hardware Model Detection
 * Detects Samsung, Nothing, Vivo, Oppo, OnePlus, Realme, Xiaomi, Pixel, iPhone, iPad, Windows, Mac, etc.
 */

export interface DeviceInfo {
  brand: string;
  model: string;
  os: string;
  browser: string;
  fullName: string;
  isMobile: boolean;
}

export function parseUserAgentDetails(ua: string, clientHintModel?: string): DeviceInfo {
  if (!ua) {
    return {
      brand: 'Generic',
      model: 'Device',
      os: 'Unknown OS',
      browser: 'Web Browser',
      fullName: 'Web Client',
      isMobile: false,
    };
  }

  let brand = 'Device';
  let model = clientHintModel || '';
  let os = 'Unknown OS';
  let browser = 'Browser';
  let isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);

  // 1. Browser Detection
  if (/SamsungBrowser\/([0-9.]+)/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/Firefox\/([0-9.]+)/i.test(ua)) {
    browser = 'Firefox';
  } else if (/Edg\/([0-9.]+)/i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\/([0-9.]+)/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  }

  // 2. OS Detection
  if (/iPhone/i.test(ua)) {
    os = 'iOS';
    brand = 'Apple';
    const match = ua.match(/OS ([0-9_]+)/i);
    const ver = match ? match[1].replace(/_/g, '.') : '';
    model = ver ? `iPhone (iOS ${ver})` : 'iPhone';
    isMobile = true;
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    brand = 'Apple';
    model = 'iPad';
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    isMobile = true;

    // Deep Android Brand Detection
    if (/SM-[A-Z0-9]+/i.test(ua) || /SAMSUNG/i.test(ua)) {
      brand = 'Samsung';
      const m = ua.match(/(SM-[A-Z0-9]+)/i);
      model = m ? `Galaxy ${m[1]}` : 'Galaxy';
    } else if (/Nothing|A063|AIN065|A065|A142/i.test(ua)) {
      brand = 'Nothing';
      if (/A063/i.test(ua)) model = 'Phone (1)';
      else if (/AIN065|A065/i.test(ua)) model = 'Phone (2)';
      else if (/A142/i.test(ua)) model = 'Phone (2a)';
      else model = 'Phone';
    } else if (/vivo|V2[0-9]{3}|V1[0-9]{3}|iQOO|I2[0-9]{3}/i.test(ua)) {
      if (/iQOO/i.test(ua)) {
        brand = 'iQOO';
        const m = ua.match(/(I2[0-9]{3}|iQOO [A-Z0-9 ]+)/i);
        model = m ? m[1] : 'Device';
      } else {
        brand = 'Vivo';
        const m = ua.match(/(V2[0-9]{3}[A-Z]*|V1[0-9]{3}[A-Z]*)/i);
        model = m ? m[1] : 'Phone';
      }
    } else if (/OPPO|CPH[0-9]{4}|Find|Reno/i.test(ua)) {
      brand = 'Oppo';
      const m = ua.match(/(CPH[0-9]{4}|Find [A-Z0-9]+|Reno [A-Z0-9]+)/i);
      model = m ? m[1] : 'Phone';
    } else if (/OnePlus|ONEPLUS|IN2[0-9]{3}|CPH2[0-9]{3}|NE2[0-9]{3}/i.test(ua)) {
      brand = 'OnePlus';
      const m = ua.match(/(OnePlus [A-Z0-9]+|IN2[0-9]{3}|CPH2[0-9]{3})/i);
      model = m ? m[1] : 'Phone';
    } else if (/realme|RMX[0-9]{4}/i.test(ua)) {
      brand = 'Realme';
      const m = ua.match(/(RMX[0-9]{4})/i);
      model = m ? m[1] : 'Phone';
    } else if (/POCO|Redmi|Xiaomi|Mi [0-9]|2[0-9]{3}[A-Z0-9]+/i.test(ua)) {
      if (/POCO/i.test(ua)) {
        brand = 'POCO';
        const m = ua.match(/(POCO [A-Z0-9 ]+)/i);
        model = m ? m[1] : 'Phone';
      } else if (/Redmi/i.test(ua)) {
        brand = 'Redmi';
        const m = ua.match(/(Redmi [A-Z0-9 ]+)/i);
        model = m ? m[1] : 'Phone';
      } else {
        brand = 'Xiaomi';
        model = 'Phone';
      }
    } else if (/Pixel [0-9a-zA-Z ]+/i.test(ua)) {
      brand = 'Google';
      const m = ua.match(/(Pixel [0-9a-zA-Z ]+)/i);
      model = m ? m[1] : 'Pixel';
    } else if (/moto|motorola/i.test(ua)) {
      brand = 'Motorola';
      model = 'Moto';
    } else {
      brand = 'Android';
      model = 'Smartphone';
    }
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 11/10';
    brand = 'PC';
    model = 'Workstation';
    isMobile = false;
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    brand = 'PC';
    model = 'Computer';
    isMobile = false;
  } else if (/Macintosh|Mac OS/i.test(ua)) {
    os = 'macOS';
    brand = 'Apple';
    model = 'MacBook / Mac';
    isMobile = false;
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    brand = 'Linux';
    model = 'Machine';
    isMobile = false;
  }

  // If client hints model provided (e.g. "SM-S928B" or "Nothing A063")
  if (clientHintModel && !model.includes(clientHintModel)) {
    model = `${model} ${clientHintModel}`.trim();
  }

  // Construct crisp, friendly label
  let fullName = '';
  if (brand === 'Apple') {
    fullName = `${model} • ${browser}`;
  } else if (brand === 'PC' || brand === 'Linux') {
    fullName = `${os} (${browser})`;
  } else if (brand === 'Android') {
    fullName = `Android ${model} (${browser})`;
  } else {
    fullName = `${brand} ${model} (${browser})`;
  }

  return {
    brand,
    model,
    os,
    browser,
    fullName: fullName.replace(/\s+/g, ' ').trim(),
    isMobile,
  };
}

/**
 * Client-side detection with asynchronous User-Agent Client Hints API support.
 */
export async function getClientDetailedDevice(): Promise<string> {
  if (typeof window === 'undefined') return 'Web Client';

  const ua = navigator.userAgent || '';
  let hintModel = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navAny = navigator as any;
  if (navAny.userAgentData && typeof navAny.userAgentData.getHighEntropyValues === 'function') {
    try {
      const hints = await navAny.userAgentData.getHighEntropyValues(['model', 'platform']);
      if (hints && hints.model) {
        hintModel = hints.model;
      }
    } catch {
      // Ignore if permission or unsupported
    }
  }

  const details = parseUserAgentDetails(ua, hintModel);
  return details.fullName;
}
