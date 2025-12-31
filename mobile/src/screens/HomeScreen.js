import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import NavBar from '../components/NavBar';

const API_BASE = 'https://racescan.racing';

const FeatureCard = ({ icon, title, subtitle, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.featureCard} activeOpacity={0.9}>
    <View style={styles.featureIconWrap}>
      <Ionicons name={icon} size={22} color={colors.textPrimary} />
    </View>
    <Text style={styles.featureTitle}>{title}</Text>
    <Text style={styles.featureSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

const CTAButton = ({ label, onPress, variant }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.9}
    style={[styles.cta, variant === 'secondary' && styles.ctaSecondary]}
  >
    <Text style={[styles.ctaText, variant === 'secondary' && styles.ctaTextSecondary]}>{label}</Text>
  </TouchableOpacity>
);

const parseEvents = (csvText = '') => {
  const lines = csvText.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    raceId: headers.indexOf('event'),
    track: headers.indexOf('name'),
    date: headers.indexOf('date'),
    time: headers.indexOf('time'),
    klass: headers.indexOf('class')
  };
  const events = [];
  lines.slice(1).forEach((line) => {
    const cols = line.split(',').map((c) => c.trim());
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
    const start = new Date(`${date}T${time}:00-05:00`);
    events.push({ raceId, track, start, classType: klass });
  });
  return events;
};

const computeLiveInfo = (events) => {
  const now = new Date();
  const active = events.filter((evt) => {
    const pre = new Date(evt.start.getTime() - 30 * 60 * 1000);
    const end = new Date(evt.start.getTime() + 7 * 60 * 60 * 1000);
    return pre <= now && now <= end;
  });
  const upcoming = events
    .filter((e) => e.start > now)
    .sort((a, b) => a.start - b.start);
  const next = upcoming[0] || null;
  const live = active.length > 0;
  const eventLabel = live ? (active[0]?.track || 'Live event') : (next?.track || 'Next event');
  return { live, eventLabel, next };
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const [liveInfo, setLiveInfo] = useState({ live: false, eventLabel: 'Checking...', next: null });
  const [auth, setAuth] = useState({ loggedIn: false, subscribed: false });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/events/events.csv?ts=${Date.now()}`);
        const text = await res.text();
        if (mounted) setLiveInfo(computeLiveInfo(parseEvents(text)));
      } catch (_) {
        if (mounted) setLiveInfo({ live: false, eventLabel: 'Schedule unavailable' });
      }
      try {
        const res = await fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (mounted) setAuth({ loggedIn: !!data.success, subscribed: !!data.subscribed });
      } catch (_) {
        if (mounted) setAuth({ loggedIn: false, subscribed: false });
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const cta = useMemo(() => {
    if (liveInfo.live) {
      return { label: 'Live Now!', variant: 'primary', action: () => navigation.navigate('Tabs', { screen: 'Live' }) };
    }
    if (!auth.loggedIn) {
      return { label: 'Login or Subscribe', variant: 'primary', action: () => navigation.navigate('Tabs', { screen: 'Login' }) };
    }
    if (auth.loggedIn && !auth.subscribed) {
      return { label: 'Subscribe', variant: 'primary', action: () => Linking.openURL(`${API_BASE}/events/subscribe.html`).catch(() => {}) };
    }
    return { label: 'Drivers', variant: 'primary', action: () => navigation.navigate('Tabs', { screen: 'Live', params: { listOnly: true } }) };
  }, [auth.loggedIn, auth.subscribed, liveInfo.live, navigation]);

  const nextRace = useMemo(() => liveInfo.next, [liveInfo.next]);
  const nextDateText = nextRace?.start
    ? new Date(nextRace.start).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'TBD';

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <NavBar />
      <View style={styles.hero}>
        <LinearGradient
          colors={['#0b0b10', '#1a1c24']}
          style={styles.heroImage}
        >
          <View style={styles.heroContent}>
            <View style={styles.logoRow}>
              <Image source={{ uri: `${API_BASE}/static/images/RaceScanLong.png` }} style={styles.logoLong} resizeMode="contain" />
            </View>
            <Text style={styles.tagline}>{liveInfo.live ? 'Live event is active' : 'Stay ready for the green'}</Text>
            <Text style={styles.title}>{liveInfo.eventLabel || 'RaceScan'}</Text>
            <Text style={styles.subtitle}>
              {liveInfo.live
                ? 'Tap Live Now to jump into driver audio.'
                : `Next up: ${nextRace?.track || 'TBD'} • ${nextDateText}`}
            </Text>
            <View style={styles.ctaRow}>
              <CTAButton label={cta.label} onPress={cta.action} />
              <CTAButton label="Schedule" onPress={() => navigation.navigate('Tabs', { screen: 'Schedule' })} variant="secondary" />
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{liveInfo.live ? 'Live Now' : 'Standby'}</Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{auth.subscribed ? 'Subscribed' : 'Subscription pending'}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>What’s inside</Text>
        <View style={styles.featureGrid}>
          <FeatureCard
            icon="volume-high-outline"
            title="Live audio"
            subtitle="Tap a driver and jump straight into the mount."
            onPress={() => navigation.navigate('Tabs', { screen: 'Live' })}
          />
          <FeatureCard
            icon="calendar-outline"
            title="Race schedule"
            subtitle="Always in sync with racescan.racing."
            onPress={() => navigation.navigate('Tabs', { screen: 'Schedule' })}
          />
          <FeatureCard
            icon="stats-chart-outline"
            title="Driver grid"
            subtitle="Numbers, classes, and quick badges ready for mobile."
            onPress={() => navigation.navigate('Tabs', { screen: 'Live' })}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  hero: {
    marginBottom: spacing.lg
  },
  heroImage: {
    height: 360,
    justifyContent: 'flex-end',
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden'
  },
  heroContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    gap: spacing.sm
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  logoLong: {
    height: 52,
    flex: 1
  },
  tagline: {
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700'
  },
  title: {
    color: colors.textPrimary,
    fontSize: 38,
    fontWeight: '800',
    marginTop: spacing.sm
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: spacing.sm,
    maxWidth: 320,
    lineHeight: 20
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  cta: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  ctaSecondary: {
    backgroundColor: 'rgba(255, 77, 77, 0.2)',
    borderWidth: 1,
    borderColor: colors.accent
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16
  },
  ctaTextSecondary: {
    color: colors.textPrimary
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap'
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.md
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  featureCard: {
    flexGrow: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs
  },
  featureSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 19
  }
});
