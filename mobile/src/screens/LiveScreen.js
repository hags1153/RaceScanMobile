import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../components/Screen';
import { colors, spacing, radius } from '../theme';
import NavBar from '../components/NavBar';

const API_BASE = 'https://racescan.racing';
// Stream through nginx /icecast/ proxy (HTTPS). Keep everything on HTTPS to avoid ATS/network issues.
const STREAM_PROXY = 'https://racescan.racing/api/stream?mount=';
const STREAM_ORIGINS = [API_BASE, 'https://www.racescan.racing'];

const fallbackDrivers = [
  { number: '62', name: 'Keelen Harvick', classType: 'SMT' },
  { number: '00', name: 'Chase Burrow', classType: 'SMT' },
  { number: '28', name: 'Landon S. Huffman', classType: 'LMSC' }
];

const parseCsvRow = (line = '') => {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
};

const slugify = (value = '', fallback = '') => {
  const v = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return v || String(fallback || '');
};

const stripQueryAndExt = (value = '') =>
  String(value || '')
    .replace(/\?.*$/, '')
    .replace(/\.(mp3|aac|m4a|ogg|opus)$/i, '');

const ensureLeadingSlash = (value = '') => {
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
};

const normalizeMountBase = (mountPath = '') => {
  const sanitized = ensureLeadingSlash(stripQueryAndExt(mountPath));
  if (!sanitized) return '';
  return sanitized.startsWith('/icecast/') ? sanitized.replace(/^\/icecast/, '') : sanitized;
};

const buildStreamCandidates = ({ mountPath, sessionId }) => {
  const base = normalizeMountBase(mountPath);
  if (!base) return [];
  const primary = `/icecast${base}`;
  const fallback = base;
  const paths = [primary, fallback];
  const extensions = ['.mp3'];
  const candidates = [];

  STREAM_ORIGINS.forEach((origin) => {
    paths.forEach((path) => {
      extensions.forEach((ext) => {
        const withExt = path.endsWith(ext) ? path : `${path}${ext}`;
        candidates.push(`${origin}${withExt}`);
      });
    });
  });

  if (sessionId) {
    const encodedMount = encodeURIComponent(primary.endsWith('.mp3') ? primary : `${primary}.mp3`);
    candidates.unshift(`${STREAM_PROXY}${encodedMount}&sid=${encodeURIComponent(sessionId)}`);
  } else {
    const encodedMount = encodeURIComponent(primary.endsWith('.mp3') ? primary : `${primary}.mp3`);
    candidates.unshift(`${STREAM_PROXY}${encodedMount}`);
  }

  return Array.from(new Set(candidates));
};

const withCacheBuster = (url) => {
  if (!url) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}ts=${Date.now()}`;
};

const logProbe = (label, payload) => {
  if (__DEV__) {
    console.log(`[LiveStream] ${label}`, payload);
  }
};

const pickStatusFields = (status) => {
  if (!status) return status;
  return {
    isLoaded: status.isLoaded,
    isPlaying: status.isPlaying,
    isBuffering: status.isBuffering,
    shouldPlay: status.shouldPlay,
    didJustFinish: status.didJustFinish,
    isMuted: status.isMuted,
    volume: status.volume,
    rate: status.rate,
    positionMillis: status.positionMillis,
    playableDurationMillis: status.playableDurationMillis,
    durationMillis: status.durationMillis,
    error: status.error
  };
};

const probeStreamUrl = async (url) => {
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    logProbe('HEAD', {
      url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      acceptRanges: res.headers.get('accept-ranges')
    });
  } catch (e) {
    logProbe('HEAD failed', { url, error: e?.message || String(e) });
  }
};

const normalizeClassList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || '').toUpperCase()).filter(Boolean);
  const cleaned = String(value || '')
    .replace(/[\[\]]/g, '')
    .split(/[,/|;]/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  if (cleaned.length) return cleaned;
  const tokens = String(value).match(/[A-Za-z]+/g) || [];
  return tokens.map((t) => t.toUpperCase());
};

const parseDrivers = (csvText) => {
  if (!csvText) return fallbackDrivers;
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return fallbackDrivers;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    number: header.indexOf('driver number'),
    name: header.indexOf('driver name'),
    klass: header.indexOf('class'),
    logo: header.indexOf('number_logo'),
    freq: header.indexOf('frequency_1 (hz)')
  };
  return lines.slice(1).map((line) => {
    const cols = parseCsvRow(line);
    const number = idx.number >= 0 ? cols[idx.number] : cols[0];
    const name = idx.name >= 0 ? cols[idx.name] : cols[1];
    const classRaw = idx.klass >= 0 ? cols[idx.klass] : cols[5];
    const classList = normalizeClassList(classRaw);
    const classType = classList[0] || '';
    const classSlug = slugify(classType, 'class');
    const numberSlug = slugify(number, 'na');
    const nameSlug = slugify(name || number, 'driver');
    const baseSlug = `${classSlug}-${numberSlug}-${nameSlug}`;
    const plainMount = `/${baseSlug}.mp3`;
    const icecastMount = `/icecast${plainMount}`;
    const logo = idx.logo >= 0 ? cols[idx.logo] : '';
    const frequency = idx.freq >= 0 ? cols[idx.freq] : '';
    return { number, name, classType, classList, plainMount, icecastMount, logo, frequency };
  });
};

const parseActiveMounts = (statusJson) => {
  const set = new Set();
  const src = statusJson?.icestats?.source;
  const arr = Array.isArray(src) ? src : src ? [src] : [];
  arr.forEach((s) => {
    const listen = s.listenurl || s.listen_url || '';
    let path = '';
    try {
      const u = new URL(listen);
      path = u.pathname || '';
    } catch {
      const m = (String(listen).match(/\/[A-Za-z0-9_-]+\.mp3$/) || [])[0] || '';
      path = m;
    }
    if (path && path.endsWith('.mp3')) set.add(path);
  });
  return set;
};

const parseEvents = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    raceId: header.indexOf('raceid'),
    track: header.indexOf('track'),
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    klass: header.indexOf('class')
  };
  const events = [];
  lines.slice(1).forEach((line) => {
    const cols = parseCsvRow(line);
    const raceId = idx.raceId >= 0 ? cols[idx.raceId] : cols[0];
    const track = idx.track >= 0 ? cols[idx.track] : cols[1];
    const date = idx.date >= 0 ? cols[idx.date] : cols[3];
    const time = idx.time >= 0 ? cols[idx.time] : cols[4];
    let klass = idx.klass >= 0 ? (cols[idx.klass] || '').toUpperCase() : '';
    if (!klass) {
      if (/(^|\\s|-)LMSC(\\s|$)/i.test(track)) klass = 'LMSC';
      else if (/(^|\\s|-)PLM(\\s|$)/i.test(track)) klass = 'PLM';
      else if (/(^|\\s|-)SMT(\\s|$)/i.test(track)) klass = 'SMT';
    }
    const baseStart = new Date(`${date}T${time}:00-05:00`);
    if (!klass) {
      events.push({ raceId: `${raceId}-PLM`, classType: 'PLM', track, start: baseStart });
      events.push({ raceId: `${raceId}-LMSC`, classType: 'LMSC', track, start: new Date(baseStart.getTime() + 2 * 3600 * 1000) });
    } else {
      events.push({ raceId, classType: klass, track, start: baseStart });
    }
  });
  return events;
};

const computeLiveInfo = (events) => {
  const now = new Date();
  const active = events.filter((evt) => {
    const start = new Date(evt.start.getTime());
    const pre = new Date(start.getTime() - 30 * 60 * 1000);
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
    return pre <= now && now <= end;
  });
  const live = active.length > 0;
  const eventLabel = live ? (active[0]?.track || 'Live event') : (events[0]?.track || 'Next event');
  const activeClasses = Array.from(new Set(active.map((a) => a.classType).filter(Boolean)));
  const activeRaceId = live ? active[0]?.raceId : null;
  const activeClass = live ? active[0]?.classType || activeClasses[0] : null;
  return { live, eventLabel, activeClasses, activeRaceId, activeClass };
};

const DriverCard = ({ driver, onPress, locked }) => {
  const canPlay = driver.isActive && !locked;
  const logoUri = driver.logo ? `${API_BASE}${driver.logo}` : null;
  return (
    <TouchableOpacity onPress={() => onPress?.(driver)} activeOpacity={canPlay ? 0.85 : 1} disabled={!canPlay}>
      <View style={[styles.driverCard, !driver.isActive && styles.driverCardDisabled]}>
        <View style={styles.numberBadge}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.numberLogo} resizeMode="contain" />
          ) : (
            <Text style={styles.numberText}>{driver.number}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <Text style={styles.driverClass}>{driver.classType || 'Driver'}</Text>
        </View>
        {locked ? (
          <View style={styles.lockWrap}>
            <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
            <Text style={styles.lockText}>Login/Subscribe</Text>
          </View>
        ) : (
          <View style={[styles.statusDot, { backgroundColor: driver.isActive ? colors.success : colors.border }]} />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function LiveScreen({ navigation, route }) {
  const listOnly = !!route?.params?.listOnly;
  const [liveInfo, setLiveInfo] = useState({ live: false, eventLabel: 'Checking...' });
  const [drivers, setDrivers] = useState(fallbackDrivers);
  const [loading, setLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamCandidates, setStreamCandidates] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [playStatus, setPlayStatus] = useState('idle'); // idle | loading | playing | error
  const [lastError, setLastError] = useState('');
  const [currentDriver, setCurrentDriver] = useState(null);
  const [activeClass, setActiveClass] = useState(null);
  const [authState, setAuthState] = useState({ loggedIn: false, subscribed: false, hasDayPass: false });
  const [sessionId, setSessionId] = useState(null);
  const soundRef = useRef(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');

  const fetchAccess = async (raceId) => {
    let state = { loggedIn: false, subscribed: false, hasDayPass: false };
    try {
      const [infoRes, sessRes] = await Promise.all([
        fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${API_BASE}/api/session`, { credentials: 'include', cache: 'no-store' })
      ]);
      const data = await infoRes.json();
      const sess = await sessRes.json().catch(() => ({}));
      if (sess?.sessionId) setSessionId(sess.sessionId);
      state = { loggedIn: !!data.success, subscribed: !!data.subscribed, hasDayPass: false };
      if (state.loggedIn && raceId) {
        try {
          const passRes = await fetch(`${API_BASE}/api/user-day-passes`, { credentials: 'include', cache: 'no-store' });
          const passData = await passRes.json();
          if (passData?.passes) {
            state.hasDayPass = passData.passes.some((p) => String(p.event_id).toUpperCase() === String(raceId).toUpperCase());
          }
        } catch {
          state.hasDayPass = false;
        }
      }
      setAuthState(state);
    } catch {
      state = { loggedIn: false, subscribed: false, hasDayPass: false };
      setAuthState(state);
    }
    return state;
  };

  useEffect(() => {
    let isMounted = true;
    // Configure audio for live streaming
    const applyAudioMode = async () => {
      const baseMode = {
        staysActiveInBackground: true,
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false
      };
      try {
        await Audio.setAudioModeAsync({
          ...baseMode,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX
        });
        logProbe('Audio mode set (full)', { ok: true });
      } catch (e) {
        console.warn('Audio mode set failed', e);
        try {
          await Audio.setAudioModeAsync(baseMode);
          logProbe('Audio mode set (fallback)', { ok: true });
        } catch (fallbackError) {
          console.warn('Audio mode fallback failed', fallbackError);
        }
      }
      try {
        const mode = await Audio.getAudioModeAsync();
        logProbe('Audio mode active', mode);
      } catch (e) {
        logProbe('Audio mode read failed', { error: e?.message || String(e) });
      }
    };
    applyAudioMode();

    const load = async () => {
      try {
        const [eventRes, driverRes, iceRes] = await Promise.all([
          fetch(`${API_BASE}/events/events.csv?ts=${Date.now()}`),
          fetch(`${API_BASE}/drivers/drivers.csv?ts=${Date.now()}`),
          fetch(`${API_BASE}/icecast/status-json.xsl`, { cache: 'no-store' })
        ]);
        const [eventText, driverText, iceJson] = await Promise.all([eventRes.text(), driverRes.text(), iceRes.json()]);
        if (!isMounted) return;
        const parsedEvents = parseEvents(eventText);
        const liveMeta = computeLiveInfo(parsedEvents);
        setLiveInfo(liveMeta);
        setActiveClass(liveMeta.activeClass || null);
        const accessState = await fetchAccess(liveMeta.activeRaceId);
        const parsedDrivers = parseDrivers(driverText);
        const activeMounts = parseActiveMounts(iceJson);
        console.log('Active mounts', Array.from(activeMounts));
        const enrichedDrivers = (parsedDrivers.length ? parsedDrivers : fallbackDrivers).map((d) => {
          let activePath = null;
          if (activeMounts.has(d.plainMount)) activePath = d.plainMount;
          else if (activeMounts.has(d.icecastMount)) activePath = d.icecastMount;
          if (!activePath) {
            const hint = `${d.classType}-${slugify(d.number)}`.toLowerCase();
            const alt = Array.from(activeMounts).find((m) => m.toLowerCase().includes(hint));
            if (alt) activePath = alt;
          }
          if (!activePath) {
            activePath = d.plainMount; // fall back to computed mount so we can attempt play
          }
          const hasLiveMount = activeMounts.size === 0 ? true : activeMounts.has(activePath);
          return { ...d, isActive: hasLiveMount, activePath };
        });
        setDrivers(enrichedDrivers);
        const firstActive = enrichedDrivers.find((d) => d.isActive);
        const allowPlay = liveMeta.live && !listOnly && accessState.loggedIn && (accessState.subscribed || accessState.hasDayPass);
        if (firstActive && allowPlay) {
          const mount = firstActive.activePath || firstActive.plainMount;
          const candidates = buildStreamCandidates({ mountPath: mount, sessionId });
          setStreamCandidates(candidates);
          setStreamUrl(candidates[0] || '');
        } else {
          setStreamCandidates([]);
          setStreamUrl('');
        }
      } catch (e) {
        if (!isMounted) return;
        setLiveInfo({ live: false, eventLabel: 'Offline mode' });
        setDrivers(fallbackDrivers);
        setStreamCandidates([]);
        setStreamUrl('');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, [listOnly]);

  useFocusEffect(
    useCallback(() => {
      fetchAccess(liveInfo.activeRaceId || null);
    }, [liveInfo.activeRaceId])
  );

  const statusColor = useMemo(() => (liveInfo.live ? colors.success : colors.warning), [liveInfo.live]);
  const classOptions = useMemo(() => {
    const set = new Set();
    drivers.forEach((d) => {
      const classes = d.classList && d.classList.length ? d.classList : [d.classType];
      classes.forEach((c) => {
        const val = String(c || '').toUpperCase();
        if (val) set.add(val);
      });
    });
    const ordered = Array.from(set).sort();
    if (liveInfo.live && liveInfo.activeClasses?.length) {
      const allowed = new Set(liveInfo.activeClasses.map((c) => String(c || '').toUpperCase()));
      return ['ALL', ...ordered.filter((c) => allowed.has(c))];
    }
    return ['ALL', ...ordered];
  }, [drivers, liveInfo.live, liveInfo.activeClasses]);

  useEffect(() => {
    if (!classOptions.includes(classFilter)) {
      setClassFilter('ALL');
    }
  }, [classOptions, classFilter]);

  const filteredDrivers = useMemo(() => {
    const trimmed = query.toLowerCase().replace(/\s+/g, ' ').trim();
    return drivers.filter((d) => {
      if (liveInfo.live && liveInfo.activeClasses?.length) {
        const allowed = new Set(liveInfo.activeClasses.map((c) => String(c || '').toUpperCase()));
        const classes = d.classList && d.classList.length ? d.classList : [d.classType];
        const matchLiveClass = classes.some((c) => allowed.has(String(c || '').toUpperCase()));
        if (!matchLiveClass) return false;
      }
      if (classFilter !== 'ALL') {
        const classes = d.classList && d.classList.length ? d.classList : [d.classType];
        const matchClass = classes.some((c) => String(c || '').toUpperCase() === classFilter);
        if (!matchClass) return false;
      }
      if (!trimmed) return true;
      const name = String(d.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const number = String(d.number || '').toLowerCase().trim();
      const nameCompact = name.replace(/\s+/g, '');
      const queryCompact = trimmed.replace(/\s+/g, '');
      return name.includes(trimmed) || nameCompact.includes(queryCompact) || number.includes(trimmed);
    });
  }, [drivers, classFilter, query]);

  const loadAndPlay = async (candidates) => {
    const urls = Array.isArray(candidates) ? candidates : [candidates].filter(Boolean);
    if (!urls.length) return;
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
    }
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        setPlayStatus('loading');
        setLastError('');
        const liveUrl = withCacheBuster(url);
        console.log('Attempting stream', liveUrl);
        await probeStreamUrl(liveUrl);
        const { sound } = await Audio.Sound.createAsync(
          { uri: liveUrl, headers: { Accept: 'audio/mpeg' } },
          { shouldPlay: true, isLiveStream: true },
          null,
          false
        );
        sound.setOnPlaybackStatusUpdate((status) => {
          logProbe('Playback status', pickStatusFields(status));
        });
        await sound.setIsMutedAsync(false);
        await sound.setVolumeAsync(1.0);
        const status = await sound.getStatusAsync().catch(() => null);
        logProbe('Initial status', pickStatusFields(status));
        soundRef.current = sound;
        setPlaying(true);
        setPlayStatus('playing');
        setStreamUrl(liveUrl);
        return;
      } catch (e) {
        const message = e?.message || String(e);
        const label = urls.length > 1 ? `Candidate ${i + 1}/${urls.length}` : 'Candidate';
        if (i === urls.length - 1) {
          console.error('Stream play error', e);
          setLastError(`${label}: ${message}`);
          setPlayStatus('error');
          setPlaying(false);
        } else {
          // Intermediate failures are expected while we try fallbacks; keep out of the redbox.
          console.warn('Stream play candidate failed', { label, message });
          setLastError(`${label}: ${message}`);
        }
      }
    }
  };

  const handleTogglePlayback = async () => {
    if (!streamUrl) return;
    if (soundRef.current && playing) {
      await soundRef.current.stopAsync().catch(() => {});
      setPlaying(false);
      setPlayStatus('idle');
      return;
    }
    await loadAndPlay(streamCandidates.length ? streamCandidates : streamUrl);
  };

  const handleSelectDriver = async (driver) => {
    const hasAccess = authState.loggedIn && (authState.subscribed || authState.hasDayPass);
    if (listOnly || !liveInfo.live) return;
    if (!driver?.isActive || !hasAccess) return;
    const mount = driver.activePath || driver.plainMount;
    const candidates = buildStreamCandidates({ mountPath: mount, sessionId });
    console.log('Switching stream to', mount, 'candidates', candidates);
    setStreamCandidates(candidates);
    setStreamUrl(candidates[0] || '');
    setCurrentDriver(driver);
    await loadAndPlay(candidates);
  };

  const hasAccess = authState.loggedIn && (authState.subscribed || authState.hasDayPass);
  const derivedListOnly = listOnly || !liveInfo.live;
  const showPlayer = !derivedListOnly;

  return (
    <Screen>
      <NavBar />
      <View style={styles.content}>
        <View style={styles.body}>
        {showPlayer && !authState.loggedIn ? (
          <View style={styles.lockCard}>
            <Text style={styles.title}>Live Driver Audio</Text>
            <Text style={styles.subtitle}>Please log in to listen live.</Text>
            <TouchableOpacity style={styles.listenBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.9}>
              <Ionicons name="log-in-outline" color="#fff" size={16} />
              <Text style={styles.listenText}>Login</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.headerCard}>
            <View>
              <Text style={styles.title}>{liveInfo.live ? 'Live Driver Audio' : 'Driver Directory'}</Text>
              <Text style={styles.subtitle}>
                {liveInfo.live ? 'Matches the site’s live panel, now in-app' : 'Browse every driver on the roster'}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Ionicons name={liveInfo.live ? 'radio' : 'time-outline'} size={16} color="#fff" />
              <Text style={styles.statusText}>{liveInfo.live ? 'Live' : 'Standby'}</Text>
            </View>
        </View>

            {showPlayer ? (
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Event</Text>
                  <Text style={styles.infoValue}>{liveInfo.eventLabel}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Class</Text>
                  <Text style={styles.infoValue}>{classFilter}</Text>
                </View>
                <View style={styles.selectedCard}>
                  <Text style={styles.selectedLabel}>Selected</Text>
                  <Text style={styles.selectedName}>{currentDriver?.name || 'Tap a live driver'}</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.listenBtn,
                    (!streamUrl || !hasAccess) && styles.listenBtnDisabled,
                    (!hasAccess && authState.loggedIn) && styles.listenBtnGhost
                  ]}
                  onPress={
                    hasAccess
                      ? handleTogglePlayback
                      : authState.loggedIn
                        ? () => navigation.navigate('Subscribe', { returnTo: { stack: 'Tabs', params: { screen: 'Live' } } })
                        : () => navigation.navigate('Login')
                  }
                  activeOpacity={streamUrl && hasAccess ? 0.9 : 0.9}
                  disabled={!streamUrl && hasAccess}
                >
                  <Ionicons name={hasAccess ? (playing ? 'pause' : 'play') : 'lock-closed'} color="#fff" size={16} />
                  <Text style={styles.listenText}>
                    {hasAccess ? (playing ? 'Pause' : 'Listen In') : (authState.loggedIn ? 'Subscribe to Listen' : 'Login to Listen')}
                  </Text>
                </TouchableOpacity>
                {streamUrl && hasAccess && (
                  <Text style={styles.notice}>
                    Status: {playStatus}{streamUrl ? ` • ${streamUrl.replace(API_BASE, '')}` : ''}
                  </Text>
                )}
                {lastError ? (
                  <Text style={styles.notice} selectable>
                    Last error: {lastError}
                  </Text>
                ) : null}
                {!hasAccess && authState.loggedIn ? (
                  <Text style={styles.notice}>You need a subscription or day pass to listen.</Text>
                ) : null}
                {!hasAccess && !authState.loggedIn ? (
                  <Text style={styles.notice}>Login and subscribe or use a day pass for this race to listen.</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.notice}>Streaming controls appear when a live event is active.</Text>
            )}

            {!showPlayer && (
              <>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or number"
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                </View>
                <View style={styles.chips}>
                  {classOptions.map((cls) => (
                    <TouchableOpacity
                      key={cls}
                      onPress={() => setClassFilter(cls)}
                      style={[styles.chip, classFilter === cls && styles.chipSelected]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.chipText, classFilter === cls && styles.chipTextSelected]}>{cls}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.listHeading}>{showPlayer ? 'Drivers' : 'All Drivers'}</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.md }} />
            ) : (
          <FlatList
            data={filteredDrivers}
            keyExtractor={(item, index) => `${item.number}-${index}`}
            renderItem={({ item }) => <DriverCard driver={item} onPress={handleSelectDriver} locked={showPlayer && !hasAccess} />}
            contentContainerStyle={styles.list}
          />
        )}
        
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: colors.background
  },
  body: {
    flex: 1,
    padding: spacing.lg
  },
  headerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 2
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm
  },
  statusText: {
    color: '#fff',
    fontWeight: '700'
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  infoLabel: {
    color: colors.textSecondary
  },
  infoValue: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  listenBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  listenBtnGhost: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: spacing.sm
  },
  listenBtnDisabled: {
    opacity: 0.5
  },
  listenText: {
    color: '#fff',
    fontWeight: '700'
  },
  notice: {
    marginTop: spacing.xs,
    color: colors.textSecondary
  },
  selectedCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  selectedLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  selectedName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 6
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  chipSelected: {
    borderColor: colors.accent
  },
  chipLive: {
    backgroundColor: 'rgba(255,77,77,0.1)'
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: '700'
  },
  chipTextSelected: {
    color: colors.textPrimary
  },
  listHeading: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm
  },
  list: {
    gap: spacing.xs,
    paddingBottom: spacing.xl
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  driverCardDisabled: {
    opacity: 0.5
  },
  numberBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.md
  },
  numberLogo: {
    width: 42,
    height: 42
  },
  numberText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16
  },
  driverName: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16
  },
  driverClass: {
    color: colors.textSecondary,
    marginTop: 2
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  lockWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  lockText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  lockCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    gap: spacing.sm
  }
});
