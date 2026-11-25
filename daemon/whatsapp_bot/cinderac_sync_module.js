/**
 * cinderac_sync_module.js
 * 
 * Official Cinderac & SymphonyX Synchronization Module for Agent Kurox
 * Handles:
 *  1. Service Token Handshake (/api/slmCore/getServiceUrls)
 *  2. Student Authentication (/login/verify/password) with graceful error detection
 *  3. Dashboard Profile Fetch (/api/dashboard)
 *  4. Course Registration Extraction (/api/slmCourseRegistration/getStuRegistration)
 *  5. Profile caching & session management in user_profiles.json
 */

const fs = require('fs');
const path = require('path');

const USER_PROFILES_FILE = path.join(__dirname, 'user_profiles.json');
const CINDERAC_BASE_URL = 'https://www.cinderac.space';

// Cache service token in memory with 30-minute expiry
let cachedServiceToken = null;
let serviceTokenExpiry = 0;

/**
 * Fetch Handshake Service Token from Cinderac API proxy
 */
async function fetchServiceToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedServiceToken && serviceTokenExpiry > now) {
    return cachedServiceToken;
  }

  try {
    const res = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/slmCore/getServiceUrls`, {
      method: 'GET',
      headers: {
        'Authorization': '',
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/login`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`Service token handshake returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const token = res.headers.get('authorization') || data.token;
    if (token) {
      cachedServiceToken = token;
      serviceTokenExpiry = now + 25 * 60 * 1000; // cache for 25 minutes
      return token;
    }
    throw new Error('Service token missing in Cinderac handshake response');
  } catch (err) {
    console.error('[CinderacSync] ❌ Handshake failed:', err.message);
    throw err;
  }
}

/**
 * Authenticate student against Cinderac / SymphonyX
 * @param {string} loginId - e.g. "121/119" or "121/016"
 * @param {string} password - student password
 * @returns {Promise<{ success: boolean, token?: string, error?: string, message?: string }>}
 */
async function loginStudent(loginId, password) {
  if (!loginId || !String(loginId).trim()) {
    return { success: false, error: 'MISSING_LOGIN_ID', message: 'Registration ID is required.' };
  }
  if (!password || !String(password).trim()) {
    return { success: false, error: 'MISSING_PASSWORD', message: 'Password is required.' };
  }

  const cleanLoginId = String(loginId).trim();
  const cleanPassword = String(password).trim();

  try {
    let serviceToken = await fetchServiceToken();
    let res = await fetch(`${CINDERAC_BASE_URL}/api/proxy/login/verify/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': serviceToken,
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/login`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        instituteId: 1,
        campusId: 3,
        loginId: cleanLoginId,
        password: cleanPassword
      })
    });

    // If service token expired, refresh once and retry
    if (res.status === 401 || res.status === 403) {
      serviceToken = await fetchServiceToken(true);
      res = await fetch(`${CINDERAC_BASE_URL}/api/proxy/login/verify/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': serviceToken,
          'Origin': CINDERAC_BASE_URL,
          'Referer': `${CINDERAC_BASE_URL}/login`
        },
        body: JSON.stringify({
          instituteId: 1,
          campusId: 3,
          loginId: cleanLoginId,
          password: cleanPassword
        })
      });
    }

    const data = await res.json();
    if (data.flag === 1) {
      const jwtToken = res.headers.get('authorization') || data.token;
      return {
        success: true,
        token: jwtToken,
        message: 'Login successful'
      };
    } else {
      const errMsg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Invalid Registration ID or Password.');
      return {
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: errMsg
      };
    }
  } catch (err) {
    console.error('[CinderacSync] ❌ Login error:', err.message);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: `Connection to Cinderac failed: ${err.message}`
    };
  }
}

/**
 * Fetch Student Dashboard Profile
 */
async function fetchStudentDashboard(jwtToken) {
  try {
    const res = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/dashboard?campusId=3`, {
      headers: {
        'Authorization': jwtToken,
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/login`
      }
    });

    if (!res.ok) throw new Error(`Dashboard fetch failed with status ${res.status}`);
    const data = await res.json();
    const u = data.data?.userModel || data.userModel;
    if (!u) throw new Error('userModel not found in dashboard response');

    const fatherName = [u.fatherFirstName, u.fatherLastName].filter(Boolean).join(' ').trim() || u.fatherName || '';
    const motherName = [u.motherFirstName, u.motherLastName].filter(Boolean).join(' ').trim() || u.motherName || '';

    return {
      fullName: u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      regId: u.userId,
      studentId: u.userId,
      rollNo: u.enrollmentNumber || u.uniRollNo || '',
      departmentName: u.degreeName || 'ELECTRONICS AND COMMUNICATION ENGINEERING',
      programName: u.programName || 'B.Tech.',
      semester: u.currentStage || 7,
      email: u.emailId || '',
      mobile: u.mobile || '',
      photoUrl: u.photoPath || '',
      dob: u.dob || null,
      fatherName,
      motherName,
      parentsMobile: u.parentsMobile || '',
      address: u.address || ''
    };
  } catch (err) {
    console.error('[CinderacSync] ❌ Dashboard profile error:', err.message);
    throw err;
  }
}

/**
 * Fetch Registered Courses for Student
 */
async function fetchRegisteredCourses(jwtToken, studentId) {
  try {
    const res = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/slmCourseRegistration/getStuRegistration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': jwtToken,
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/registration`
      },
      body: JSON.stringify({
        instId: 1,
        campusId: 3,
        studentId: String(studentId).trim(),
        registrationType: 1
      })
    });

    if (!res.ok) throw new Error(`Registration fetch failed with status ${res.status}`);
    const json = await res.json();
    const comp = json.data?.compulsoryCoursesList || [];
    const elec = json.data?.electiveCoursesList || [];

    const courses = [];
    comp.forEach((c) => {
      courses.push({
        code: c.courseId || c.courseCode || '',
        name: c.name || c.courseName || '',
        credits: c.courseCredits || c.credits || 0,
        type: 'Compulsory',
        faculty: c.headFacultyName || c.faculty || 'Assigned Faculty',
        hours: c.hours || '3/0/2/0'
      });
    });

    elec.forEach((c) => {
      courses.push({
        code: c.courseId || c.courseCode || '',
        name: c.name || c.courseName || '',
        credits: c.courseCredits || c.credits || 0,
        type: 'Elective',
        faculty: c.headFacultyName || c.faculty || 'Assigned Faculty',
        hours: c.hours || '3/0/0/0'
      });
    });

    return courses;
  } catch (err) {
    console.error('[CinderacSync] ❌ Course registration error:', err.message);
    throw err;
  }
}

/**
 * Complete Student Sync Orchestrator
 */
async function syncStudentData(loginId, password) {
  const loginRes = await loginStudent(loginId, password);
  if (!loginRes.success) {
    return loginRes;
  }

  try {
    const profile = await fetchStudentDashboard(loginRes.token);
    profile.studentId = profile.studentId || profile.regId || loginId;
    const courses = await fetchRegisteredCourses(loginRes.token, loginId);

    // Update students.json and user_profiles.json
    try {
      updateStudentDatabase(profile);
    } catch (dbErr) {
      console.warn('[CinderacSync] Could not update local student DB:', dbErr.message);
    }

    return {
      success: true,
      token: loginRes.token,
      profile,
      courses,
      creds: { regId: loginId, password },
      syncedAt: Date.now()
    };
  } catch (err) {
    return {
      success: false,
      error: 'FETCH_FAILED',
      message: `Logged in successfully, but failed to retrieve academic registration: ${err.message}`
    };
  }
}

/**
 * Load or update user profile with Cinderac session and persistent credentials
 */
function saveCinderacSession(senderJid, phone, cinderacData, creds = null) {
  try {
    let profiles = {};
    if (fs.existsSync(USER_PROFILES_FILE)) {
      try { profiles = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8')); } catch (e) { profiles = {}; }
    }

    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '').slice(-10) : null;
    const key = cleanPhone || senderJid;
    if (!key) return false;

    if (!profiles[key]) profiles[key] = {};
    
    // Merge creds if provided or existing
    const savedCreds = creds || cinderacData.creds || profiles[key]?.cinderac?.creds || null;

    profiles[key].cinderac = {
      ...cinderacData,
      creds: savedCreds,
      lastSynced: Date.now(),
      updatedAt: Date.now()
    };

    if (senderJid && key !== senderJid) {
      if (!profiles[senderJid]) profiles[senderJid] = {};
      profiles[senderJid].cinderac = profiles[key].cinderac;
    }

    fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[CinderacSync] ❌ Error saving session:', err.message);
    return false;
  }
}

/**
 * Ensures user has an active, valid Cinderac session.
 * If token is expired or older than 25 minutes, automatically performs a silent re-login
 * using stored credentials in user_profiles.json so the student never needs to log in repeatedly.
 */
async function ensureValidCinderacSession(senderJid, phone) {
  const session = getCinderacSession(senderJid, phone);
  if (!session) return null;

  const now = Date.now();
  const tokenAge = session.lastSynced ? (now - session.lastSynced) : Infinity;

  // If token is fresh (under 25 minutes) and has a token, return session directly
  if (session.token && tokenAge < 25 * 60 * 1000) {
    return session;
  }

  // If token is older or needs refresh, attempt silent re-login with saved credentials
  if (session.creds && session.creds.regId && session.creds.password) {
    console.log(`[CinderacSync] 🔄 Silently refreshing Cinderac session for ${session.creds.regId}...`);
    try {
      const refreshed = await syncStudentData(session.creds.regId, session.creds.password);
      if (refreshed.success) {
        saveCinderacSession(senderJid, phone, refreshed, session.creds);
        return getCinderacSession(senderJid, phone);
      }
    } catch (err) {
      console.warn(`[CinderacSync] Silent refresh failed: ${err.message}. Retaining cached session.`);
    }
  }

  return session;
}

/**
 * Get active Cinderac session for user
 */
function getCinderacSession(senderJid, phone) {
  try {
    if (!fs.existsSync(USER_PROFILES_FILE)) return null;
    const profiles = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8'));
    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '').slice(-10) : null;

    if (cleanPhone && profiles[cleanPhone]?.cinderac) {
      return profiles[cleanPhone].cinderac;
    }
    if (senderJid && profiles[senderJid]?.cinderac) {
      return profiles[senderJid].cinderac;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Clear Cinderac session (logout)
 */
function clearCinderacSession(senderJid, phone) {
  try {
    if (!fs.existsSync(USER_PROFILES_FILE)) return false;
    const profiles = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8'));
    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '').slice(-10) : null;

    let cleared = false;
    if (cleanPhone && profiles[cleanPhone]?.cinderac) {
      delete profiles[cleanPhone].cinderac;
      cleared = true;
    }
    if (senderJid && profiles[senderJid]?.cinderac) {
      delete profiles[senderJid].cinderac;
      cleared = true;
    }

    if (cleared) {
      fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
    }
    return cleared;
  } catch (err) {
    return false;
  }
}

/**
 * Match user text input against registered courses list
 * Returns course index (0-based) or -1 if no match
 * @param {string} text
 * @param {Array} courses
 * @returns {number}
 */
function matchCinderacCourseSelection(text, courses) {
  if (!text || !Array.isArray(courses) || courses.length === 0) return -1;
  const clean = String(text).trim();

  // Pattern 1: Pure number (e.g. "6", " 6 ", "1")
  const numMatch = clean.match(/^([1-9]|1\d|20)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < courses.length) return idx;
  }

  // Pattern 2: Course / Subject prefixes (e.g., "course 6", "I mean course 6", "subject 6", "sub 6", "no. 6", "option 6")
  const prefixMatch = clean.match(/(?:i\s+mean\s+)?(?:course|subject|sub|paper|no\.?|option)\s*[:#-]?\s*([1-9]|1\d|20)\b/i);
  if (prefixMatch) {
    const idx = parseInt(prefixMatch[1], 10) - 1;
    if (idx >= 0 && idx < courses.length) return idx;
  }

  // Pattern 3: Ordinal numbers (e.g., "6th", "6th course", "6th subject")
  const ordMatch = clean.match(/^([1-9]|1\d|20)(?:st|nd|rd|th)\s*(?:course|subject)?$/i);
  if (ordMatch) {
    const idx = parseInt(ordMatch[1], 10) - 1;
    if (idx >= 0 && idx < courses.length) return idx;
  }

  // Pattern 4: Course Code Match (e.g., "EC24179", "EC 24179", "EC24101")
  const normCode = clean.replace(/[\s\-_]/g, '').toUpperCase();
  const codeIdx = courses.findIndex(c => (c.code || '').replace(/[\s\-_]/g, '').toUpperCase() === normCode);
  if (codeIdx !== -1) return codeIdx;

  // Pattern 5: Course Name Fuzzy Match (e.g., "Industrial Training", "VLSI", "Radar")
  const cleanLower = clean.toLowerCase();
  if (cleanLower.length >= 3) {
    const nameIdx = courses.findIndex(c => {
      const cn = (c.name || '').toLowerCase();
      return cn.includes(cleanLower) || (cleanLower.includes(cn) && cn.length >= 4);
    });
    if (nameIdx !== -1) return nameIdx;
  }

  return -1;
}

/**
 * Fetch Live Attendance & Bunk Buffer Stats for Enrolled Classrooms
 * Joins /api/classroom/linked with /api/attendance/studentclassroomStatsTillDate
 */
async function fetchLiveAttendance(jwtToken, studentId) {
  try {
    // 1. Fetch enrolled classrooms
    const classRes = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/classroom/linked`, {
      headers: {
        'Authorization': jwtToken,
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/dashboard`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!classRes.ok) {
      throw new Error(`Classroom link fetch failed with HTTP ${classRes.status}`);
    }

    const classData = await classRes.json();
    const rawClassrooms = classData.data || (Array.isArray(classData) ? classData : []);
    
    // Filter primary course classrooms (parentClassroomGeneratedId === 0)
    let parentClasses = rawClassrooms.filter(c => c && c.parentClassroomGeneratedId === 0 && c.courseId);
    if (parentClasses.length === 0) {
      parentClasses = rawClassrooms.filter(c => c && c.classroomGeneratedId && c.courseId);
    }

    if (parentClasses.length === 0) {
      return {
        success: true,
        studentId,
        classrooms: [],
        overall: { totalClasses: 0, totalAttended: 0, overallPercentage: 0 }
      };
    }

    // Deduplicate by courseId
    const uniqueCourseClasses = [];
    const seenCourses = new Set();
    parentClasses.forEach(c => {
      const cid = (c.courseId || '').trim();
      if (!seenCourses.has(cid)) {
        seenCourses.add(cid);
        uniqueCourseClasses.push(c);
      }
    });

    const sessionId = parentClasses[0].academicSessionId || 2611;

    // Fetch attendance for each classroom concurrently
    const classrooms = await Promise.all(uniqueCourseClasses.map(async c => {
      const classId = c.classroomGeneratedId;
      const courseId = c.courseId;
      const courseName = c.courseName || c.classroomId || 'Course';
      const faculty = (c.classroomFacultyLinkingModels && c.classroomFacultyLinkingModels[0]?.facultyName) || c.headFacultyName || 'Assigned Faculty';

      let total = 0;
      let attended = 0;
      let pctNum = 0;

      try {
        const attUrl = `${CINDERAC_BASE_URL}/api/proxy/api/attendance/studentclassroomStatsTillDate?studentIds=${encodeURIComponent(studentId)}&academicSessionId=${sessionId}&classroomGeneratedIds=${classId}`;
        const attRes = await fetch(attUrl, {
          headers: {
            'Authorization': jwtToken,
            'Origin': CINDERAC_BASE_URL,
            'Referer': `${CINDERAC_BASE_URL}/dashboard`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (attRes.ok) {
          const attJson = await attRes.json();
          const s = (attJson.data && attJson.data[0]) || {};
          total = s.totalLecture || s.totalAttendance || 0;
          attended = s.totalAttended || 0;
          pctNum = total > 0 ? parseFloat(((attended / total) * 100).toFixed(1)) : 0;
        }
      } catch (e) {
        console.warn(`[CinderacSync] Could not fetch stats for class ${classId}:`, e.message);
      }

      // Calculate Bunk/Buffer stats against the 75% NERIST requirement
      let bufferText = '';
      let statusType = 'normal';
      if (total === 0) {
        bufferText = 'No lectures held yet';
        statusType = 'neutral';
      } else if (pctNum >= 75) {
        const canBunk = Math.floor((attended - 0.75 * total) / 0.75);
        if (canBunk > 0) {
          bufferText = `Safe! Can bunk ${canBunk} class${canBunk > 1 ? 'es' : ''} safely`;
          statusType = 'safe';
        } else {
          bufferText = `Borderline 75% · Attend next lecture!`;
          statusType = 'warning';
        }
      } else {
        const needToAttend = Math.ceil((0.75 * total - attended) / 0.25);
        bufferText = `Shortage! Must attend next ${needToAttend} class${needToAttend > 1 ? 'es' : ''} consecutively`;
        statusType = 'danger';
      }

      return {
        classId,
        courseId,
        courseName,
        faculty,
        totalClasses: total,
        attendedClasses: attended,
        percentage: pctNum,
        bufferText,
        statusType
      };
    }));

    let overallTotal = 0;
    let overallAttended = 0;
    classrooms.forEach(c => {
      overallTotal += c.totalClasses;
      overallAttended += c.attendedClasses;
    });

    const overallPct = overallTotal > 0 ? parseFloat(((overallAttended / overallTotal) * 100).toFixed(1)) : 0;

    return {
      success: true,
      studentId,
      classrooms,
      overall: {
        totalClasses: overallTotal,
        attendedClasses: overallAttended,
        overallPercentage: overallPct
      },
      fetchedAt: Date.now()
    };
  } catch (err) {
    console.error('[CinderacSync] ❌ fetchLiveAttendance failed:', err.message);
    return {
      success: false,
      error: 'ATTENDANCE_FETCH_ERROR',
      message: err.message
    };
  }
}

/**
 * Fetch Complete Semester Examination Results History
 * Queries /api/slmResult/student/getStuSemester and /api/slmResult/student/getStudentResult
 */
async function fetchSemesterResultsHistory(jwtToken, studentId) {
  try {
    const semRes = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/slmResult/student/getStuSemester?instId=1&studentId=${encodeURIComponent(studentId)}`, {
      method: 'POST',
      headers: {
        'Authorization': jwtToken,
        'Content-Type': 'application/json',
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/dashboard`
      },
      body: JSON.stringify({})
    });

    if (!semRes.ok) {
      throw new Error(`Semester list fetch failed with HTTP ${semRes.status}`);
    }

    const semsData = await semRes.json();
    const rawList = semsData.data || (Array.isArray(semsData) ? semsData : []);

    // Format is "<semNum>:<sessionId>:<enrollStage>:<degreeName>:<semLabel>"
    // E.g. "1:2311:0:B.Tech.:Sem 1" or "1:2111:0:Certificate:Sem 1"
    const parsedSems = [];
    rawList.forEach(item => {
      if (typeof item === 'string') {
        const parts = item.split(':');
        const semNum = parseInt(parts[0], 10);
        const sessId = parseInt(parts[1], 10);
        const deg = (parts[3] || '').trim();
        const rawLabel = (parts[4] || '').trim();

        let semLabel = rawLabel || `Sem ${semNum}`;
        let shortLabel = `S-${semNum}`;
        if (/cert/i.test(deg)) {
          semLabel = `Certificate Sem ${semNum}`;
          shortLabel = `Cert ${semNum}`;
        } else if (/b\.?tech/i.test(deg)) {
          semLabel = `B.Tech Sem ${semNum}`;
          shortLabel = `B.Tech ${semNum}`;
        }

        parsedSems.push({
          semNum,
          sessionId: sessId,
          degreeName: deg || 'B.Tech.',
          semLabel,
          shortLabel
        });
      } else if (item && typeof item === 'object') {
        const semNum = item.semester || item.stageId || 1;
        const deg = item.degreeName || 'B.Tech.';
        let semLabel = item.semesterName || `Sem ${semNum}`;
        let shortLabel = `S-${semNum}`;
        if (/cert/i.test(deg)) {
          semLabel = `Certificate Sem ${semNum}`;
          shortLabel = `Cert ${semNum}`;
        } else if (/b\.?tech/i.test(deg)) {
          semLabel = `B.Tech Sem ${semNum}`;
          shortLabel = `B.Tech ${semNum}`;
        }

        parsedSems.push({
          semNum,
          sessionId: item.sessionId || 0,
          degreeName: deg,
          semLabel,
          shortLabel
        });
      }
    });

    // Chronological sort: by sessionId ascending (Base Module Certificate first, then B.Tech Degree)
    parsedSems.sort((a, b) => {
      if (a.sessionId && b.sessionId && a.sessionId !== b.sessionId) {
        return a.sessionId - b.sessionId;
      }
      return a.semNum - b.semNum;
    });

    // Fetch result for each semester
    const history = [];
    let latestCgpa = 0;

    for (const s of parsedSems) {
      try {
        const resRes = await fetch(`${CINDERAC_BASE_URL}/api/proxy/api/slmResult/student/getStudentResult`, {
          method: 'POST',
          headers: {
            'Authorization': jwtToken,
            'Content-Type': 'application/json',
            'Origin': CINDERAC_BASE_URL,
            'Referer': `${CINDERAC_BASE_URL}/dashboard`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({
            instituteId: 1,
            campusId: 3,
            semester: s.semNum,
            selectedStuIds: [String(studentId).trim()],
            userType: 2,
            sessionId: s.sessionId
          })
        });

        if (!resRes.ok) continue;
        const resData = await resRes.json();
        const d = resData.data;
        if (!d) continue;

        const sgpa = typeof d.sgpa === 'number' ? d.sgpa : (parseFloat(d.sgpa) || 0);
        const cgpa = typeof d.cgpa === 'number' ? d.cgpa : (parseFloat(d.cgpa) || 0);

        const courseResults = (d.studentResultList || []).map(c => ({
          courseId: c.courseId || '',
          courseName: c.courseName || '',
          grade: c.grade || 'P',
          credits: c.credit || c.securedCredit || 0,
          securedCredits: c.securedCredit || 0
        }));

        if (sgpa > 0 || courseResults.length > 0) {
          history.push({
            semester: s.semNum,
            semesterLabel: s.semLabel,
            shortLabel: s.shortLabel,
            sessionId: s.sessionId,
            degreeName: s.degreeName,
            sgpa,
            cgpa,
            courses: courseResults
          });
          if (cgpa > 0) latestCgpa = cgpa;
        }
      } catch (semErr) {
        console.warn(`[CinderacSync] Could not fetch sem ${s.semNum}:`, semErr.message);
      }
    }

    return {
      success: true,
      studentId,
      history,
      latestCgpa,
      fetchedAt: Date.now()
    };
  } catch (err) {
    console.error('[CinderacSync] ❌ fetchSemesterResultsHistory failed:', err.message);
    return {
      success: false,
      error: 'RESULTS_FETCH_ERROR',
      message: err.message
    };
  }
}

/**
 * Fetch Student Admit Card / Hall Ticket
 * Queries /api/slmExamSchedule/generateAdmitCard
 * Returns { success: boolean, available: boolean, pdfUrl?: string, pdfBuffer?: Buffer, message: string }
 */
async function fetchStudentAdmitCard(jwtToken, studentId) {
  if (!jwtToken || !studentId) {
    return { success: false, available: false, message: 'Authentication required' };
  }

  try {
    const url = `${CINDERAC_BASE_URL}/api/proxy/api/slmExamSchedule/generateAdmitCard?instId=1&studentId=${encodeURIComponent(studentId)}&collegeId=3&campusId=3`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': jwtToken,
        'Content-Type': 'application/json',
        'Origin': CINDERAC_BASE_URL,
        'Referer': `${CINDERAC_BASE_URL}/dashboard`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      throw new Error(`Admit card fetch HTTP error ${res.status}`);
    }

    const json = await res.json();
    const flag = json.flag;
    const data = json.data;
    const msgs = (json.message || []).map(m => m.msg || m).filter(Boolean);

    if (flag !== 0 && data) {
      let pdfUrl = null;
      let pdfBuffer = null;

      if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
        pdfUrl = data;
        try {
          const dlRes = await fetch(pdfUrl);
          if (dlRes.ok) {
            const arrBuf = await dlRes.arrayBuffer();
            pdfBuffer = Buffer.from(arrBuf);
          }
        } catch (dlErr) {
          console.warn('[CinderacSync] Could not pre-download admit card PDF:', dlErr.message);
        }
      }

      return {
        success: true,
        available: true,
        pdfUrl,
        pdfBuffer,
        message: 'Admit card is available for download.'
      };
    }

    const displayMsg = msgs.length > 0 ? msgs.join(', ') : 'Admit card not available';
    return {
      success: true,
      available: false,
      pdfUrl: null,
      message: displayMsg
    };
  } catch (err) {
    console.error('[CinderacSync] ❌ fetchStudentAdmitCard error:', err.message);
    return {
      success: false,
      available: false,
      error: 'ADMIT_CARD_ERROR',
      message: err.message
    };
  }
}

/**
 * Update students.json and user_profiles.json with verified Cinderac student details
 */
function updateStudentDatabase(prof, latestCgpa = null) {
  if (!prof || (!prof.regId && !prof.rollNo)) return false;

  const STUDENTS_FILE = path.join(__dirname, 'students.json');
  try {
    let students = [];
    if (fs.existsSync(STUDENTS_FILE)) {
      try {
        students = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
      } catch (e) {
        students = [];
      }
    }

    const reg = (prof.regId || '').trim();
    const roll = (prof.rollNo || '').trim().toUpperCase();

    const idx = students.findIndex(s =>
      (reg && s.user_id && s.user_id.trim() === reg) ||
      (roll && s.roll_no && s.roll_no.trim().toUpperCase() === roll)
    );

    if (idx !== -1) {
      // Update existing record
      const st = students[idx];
      if (prof.fullName) st.full_name = prof.fullName;
      if (prof.semester) {
        st.semester = prof.semester;
        st.academic_label = `Semester ${prof.semester}`;
      }
      if (latestCgpa) st.cgpa = latestCgpa;
      if (prof.dob) st.dob = prof.dob;
      if (prof.parentsMobile) st.parentsMobile = prof.parentsMobile;
      if (prof.fatherName) st.fatherName = prof.fatherName;
      if (prof.motherName) st.motherName = prof.motherName;
      if (prof.address) st.address = prof.address;
      if (prof.email) st.email = prof.email;
      if (prof.mobile) st.mobile = prof.mobile;
      st.last_updated = new Date().toISOString();
    } else {
      // Append new student record
      students.push({
        user_id: reg,
        full_name: prof.fullName || 'STUDENT',
        semester: prof.semester || 7,
        program_name: prof.programName || 'B.Tech. (Degree Module)',
        degree_name: prof.departmentName || 'ENGINEERING',
        department_name: prof.departmentName || 'ENGINEERING',
        cgpa: latestCgpa || 8.0,
        roll_no: roll,
        mobile: prof.mobile || '',
        email: prof.email || '',
        dob: prof.dob || null,
        fatherName: prof.fatherName || '',
        motherName: prof.motherName || '',
        parentsMobile: prof.parentsMobile || '',
        address: prof.address || '',
        academic_label: `Semester ${prof.semester || 7}`,
        last_updated: new Date().toISOString()
      });
    }

    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[CinderacSync] ❌ updateStudentDatabase failed:', err.message);
    return false;
  }
}

/**
 * Retrieve Today and Upcoming Birthdays from Campus Database
 * @param {number} daysAhead - default 7 days window
 */
function getTodayAndUpcomingBirthdays(daysAhead = 7) {
  const STUDENTS_FILE = path.join(__dirname, 'students.json');
  try {
    let students = [];
    if (fs.existsSync(STUDENTS_FILE)) {
      try {
        students = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
      } catch (e) {
        students = [];
      }
    }

    // Also inspect user_profiles.json for any extra synced DOBs
    if (fs.existsSync(USER_PROFILES_FILE)) {
      try {
        const uProfiles = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, 'utf8'));
        Object.values(uProfiles).forEach(up => {
          if (up && up.cinderac && up.cinderac.profile && up.cinderac.profile.dob) {
            const p = up.cinderac.profile;
            if (!students.some(s => s.user_id === p.regId || s.roll_no === p.rollNo)) {
              students.push({
                user_id: p.regId,
                full_name: p.fullName,
                roll_no: p.rollNo,
                department_name: p.departmentName,
                semester: p.semester,
                dob: p.dob
              });
            }
          }
        });
      } catch (e) {}
    }

    // Calculate in IST (Asia/Kolkata UTC+5:30)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const curMonth = nowIST.getMonth() + 1; // 1-12
    const curDay = nowIST.getDate(); // 1-31

    const today = [];
    const upcoming = [];

    students.forEach(s => {
      if (!s.dob) return;
      let bMonth = null;
      let bDay = null;
      let bYear = null;

      // Handle "YYYY-MM-DD" or "DD/MM/YYYY" or "DD-MM-YYYY"
      if (typeof s.dob === 'string') {
        const isoMatch = s.dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          bYear = parseInt(isoMatch[1], 10);
          bMonth = parseInt(isoMatch[2], 10);
          bDay = parseInt(isoMatch[3], 10);
        } else {
          const ddmmyyyy = s.dob.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
          if (ddmmyyyy) {
            bDay = parseInt(ddmmyyyy[1], 10);
            bMonth = parseInt(ddmmyyyy[2], 10);
            bYear = parseInt(ddmmyyyy[3], 10);
          }
        }
      }

      if (!bMonth || !bDay) return;

      const age = bYear ? (nowIST.getFullYear() - bYear) : null;
      const studentCard = {
        name: s.full_name,
        rollNo: s.roll_no,
        regId: s.user_id,
        department: s.department_name || s.degree_name || '',
        semester: s.semester,
        dob: s.dob,
        age
      };

      if (bMonth === curMonth && bDay === curDay) {
        today.push(studentCard);
      } else {
        // Calculate days until birthday
        const thisYearBirthday = new Date(nowIST.getFullYear(), bMonth - 1, bDay);
        if (thisYearBirthday < nowIST) {
          thisYearBirthday.setFullYear(nowIST.getFullYear() + 1);
        }
        const diffDays = Math.ceil((thisYearBirthday - nowIST) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= daysAhead) {
          upcoming.push({
            ...studentCard,
            daysUntil: diffDays,
            birthdayDate: `${bDay} ${thisYearBirthday.toLocaleString('default', { month: 'short' })}`
          });
        }
      }
    });

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    return { today, upcoming, count: today.length + upcoming.length };
  } catch (err) {
    console.error('[CinderacSync] ❌ getTodayAndUpcomingBirthdays failed:', err.message);
    return { today: [], upcoming: [], count: 0 };
  }
}

/**
 * Search student birthday by name, roll number, or reg ID
 * @param {string} query
 * @returns {object|null}
 */
function searchStudentBirthday(query) {
  if (!query || !String(query).trim()) return null;
  const q = String(query).trim().toLowerCase();

  const STUDENTS_FILE = path.join(__dirname, 'students.json');
  if (!fs.existsSync(STUDENTS_FILE)) return null;

  try {
    const students = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

    // Exact or best match
    const match = students.find(s => {
      const uid = (s.user_id || '').toLowerCase();
      const roll = (s.roll_no || '').toLowerCase();
      const name = (s.full_name || '').toLowerCase();
      return uid === q || roll === q || name === q || (name.length > 4 && (name.includes(q) || q.includes(name)));
    });

    if (!match || !match.dob) return null;

    let bMonth = match.dob_month;
    let bDay = match.dob_day;
    let bYear = null;

    if (!bMonth || !bDay) {
      const m = String(match.dob).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        bYear = parseInt(m[1], 10);
        bMonth = parseInt(m[2], 10);
        bDay = parseInt(m[3], 10);
      }
    } else {
      const m = String(match.dob).match(/^(\d{4})/);
      if (m) bYear = parseInt(m[1], 10);
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[bMonth - 1] || '';

    // Calculate days until next birthday
    const thisYearBirthday = new Date(nowIST.getFullYear(), bMonth - 1, bDay);
    if (thisYearBirthday < nowIST) {
      thisYearBirthday.setFullYear(nowIST.getFullYear() + 1);
    }
    const diffDays = Math.ceil((thisYearBirthday - nowIST) / (1000 * 60 * 60 * 24));
    const age = bYear ? (nowIST.getFullYear() - bYear) : null;

    return {
      name: match.full_name,
      rollNo: match.roll_no,
      regId: match.user_id,
      department: match.degree_name || match.department_name || '',
      state: match.state || '',
      programYear: match.program_year || '',
      dob: match.dob,
      birthdayDate: `${bDay} ${monthName}`,
      isToday: diffDays === 0 || (nowIST.getDate() === bDay && (nowIST.getMonth() + 1) === bMonth),
      daysUntil: diffDays,
      turningAge: age ? age + (diffDays === 0 ? 0 : 1) : null
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  fetchServiceToken,
  loginStudent,
  fetchStudentDashboard,
  fetchRegisteredCourses,
  syncStudentData,
  saveCinderacSession,
  getCinderacSession,
  clearCinderacSession,
  ensureValidCinderacSession,
  matchCinderacCourseSelection,
  fetchLiveAttendance,
  fetchSemesterResultsHistory,
  fetchStudentAdmitCard,
  updateStudentDatabase,
  getTodayAndUpcomingBirthdays,
  searchStudentBirthday
};
