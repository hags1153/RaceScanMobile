import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../components/Screen';
import { colors, spacing, radius } from '../theme';
import NavBar from '../components/NavBar';

const API_BASE = 'https://racescan.racing';
// Stream through nginx /icecast/ proxy (HTTPS). Keep everything on HTTPS to avoid ATS/network issues.
const STREAM_BASE = 'https://racescan.racing/icecast';

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
    const end = new Date(start.getTime() + 7 * 60 * 60 * 1000);
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
  const [playing, setPlaying] = useState(false);
  const [playStatus, setPlayStatus] = useState('idle'); // idle | loading | playing | error
  const [currentDriver, setCurrentDriver] = useState(null);
  const [activeClass, setActiveClass] = useState(null);
  const [authState, setAuthState] = useState({ loggedIn: false, subscribed: false, hasDayPass: false });
  const soundRef = useRef(null);

  const fetchAccess = async (raceId) => {
    let state = { loggedIn: false, subscribed: false, hasDayPass: false };
    try {
      const res = await fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
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
    Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      shouldDuckAndroid: true
    }).catch((e) => console.warn('Audio mode set failed', e));

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
        const allowPlay = !listOnly && accessState.loggedIn && (accessState.subscribed || accessState.hasDayPass);
        if (firstActive && allowPlay) {
          const mount = firstActive.activePath || firstActive.plainMount;
          const normalizedMount = mount.startsWith('/') ? mount : `/${mount}`;
          const url = normalizedMount.startsWith('http') ? normalizedMount : `${STREAM_BASE}${normalizedMount}`;
          setStreamUrl(url);
        } else {
          setStreamUrl('');
        }
      } catch (e) {
        if (!isMounted) return;
        setLiveInfo({ live: false, eventLabel: 'Offline mode' });
        setDrivers(fallbackDrivers);
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
  const filteredDrivers = useMemo(() => {
    if (!activeClass) return drivers;
    const target = String(activeClass).toUpperCase();
    return drivers.filter((d) => (d.classList || [d.classType]).some((c) => String(c || '').toUpperCase() === target));
  }, [drivers, activeClass]);

  const loadAndPlay = async (url, triedFallback = false) => {
    if (!url) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      setPlayStatus('loading');
      console.log('Attempting stream', url);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url, headers: { Accept: '*/*' } },
        { shouldPlay: true, isLiveStream: true }
      );
      soundRef.current = sound;
      setPlaying(true);
      setPlayStatus('playing');
    } catch (e) {
      setPlaying(false);
      setPlayStatus('error');
      console.error('Stream play error', e);
      if (!triedFallback) {
        // try HTTP port 8500 fallback for iOS playback issues
        try {
          const plain = url.replace(/^https?:\/\/[^/]+/, '');
          const alt = `http://racescan.racing:8500${plain}`;
          console.log('Attempting fallback stream', alt);
          await loadAndPlay(alt, true);
        } catch (err) {
          console.error('Fallback stream failed', err);
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
    await loadAndPlay(streamUrl);
  };

  const handleSelectDriver = async (driver) => {
    const hasAccess = authState.loggedIn && (authState.subscribed || authState.hasDayPass);
    if (listOnly) return;
    if (!driver?.isActive || !hasAccess) return;
    const mount = driver.activePath || driver.plainMount;
    const normalizedMount = mount?.startsWith('/') ? mount : `/${mount || ''}`;
    const withIcecast = normalizedMount.startsWith('http')
      ? normalizedMount
      : `${STREAM_BASE}${normalizedMount}`;
    console.log('Switching stream to', normalizedMount, 'url', withIcecast);
    setStreamUrl(withIcecast);
    setCurrentDriver(driver);
    await loadAndPlay(withIcecast);
  };

  const hasAccess = authState.loggedIn && (authState.subscribed || authState.hasDayPass);
  const showPlayer = !listOnly;

  return (
    <Screen>
      <View style={styles.content}>
        <NavBar />
        {!authState.loggedIn ? (
          <View style={styles.lockCard}>
            <Text style={styles.title}>Live Driver Audio</Text>
            <Text style={styles.subtitle}>Please log in to view live drivers.</Text>
            <TouchableOpacity style={styles.listenBtn} onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.9}>
              <Ionicons name="log-in-outline" color="#fff" size={16} />
              <Text style={styles.listenText}>Login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.headerCard}>
              <View>
                <Text style={styles.title}>Live Driver Audio</Text>
                <Text style={styles.subtitle}>Matches the site’s live panel, now in-app</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
                <Ionicons name={liveInfo.live ? 'radio' : 'time-outline'} size={16} color="#fff" />
                <Text style={styles.statusText}>{liveInfo.live ? 'Live' : 'Standby'}</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Event</Text>
                <Text style={styles.infoValue}>{liveInfo.eventLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Drivers loaded</Text>
                <Text style={styles.infoValue}>{drivers.length}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Class</Text>
                <Text style={styles.infoValue}>{activeClass || '—'}</Text>
              </View>
          {showPlayer ? (
            <>
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
                      : () => navigation.navigate('Tabs', { screen: 'Login' })
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
              {!hasAccess && authState.loggedIn ? (
                <Text style={styles.notice}>You need a subscription or day pass to listen.</Text>
              ) : null}
              {!hasAccess && !authState.loggedIn ? (
                <Text style={styles.notice}>Login and subscribe or use a day pass for this race to listen.</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.notice}>Browse drivers by class. Streaming controls appear when a live event is active.</Text>
          )}
        </View>

            <Text style={styles.listHeading}>Driver mounts</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.md }} />
            ) : (
          <FlatList
            data={filteredDrivers}
            keyExtractor={(item, index) => `${item.number}-${index}`}
            renderItem={({ item }) => <DriverCard driver={item} onPress={handleSelectDriver} locked={!hasAccess} />}
            contentContainerStyle={styles.list}
          />
        )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background
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
    flex: 1
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
