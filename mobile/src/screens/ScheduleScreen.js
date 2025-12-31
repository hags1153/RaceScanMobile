import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_BASE = 'https://racescan.racing';

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

const parseEvents = (csvText) => {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    raceId: header.indexOf('raceid'),
    track: header.indexOf('track'),
    location: header.indexOf('location'),
    date: header.indexOf('date'),
    time: header.indexOf('time'),
    klass: header.indexOf('class')
  };

  const events = [];
  lines.slice(1).forEach((line) => {
    const cols = parseCsvRow(line);
    const raceId = idx.raceId >= 0 ? cols[idx.raceId] : cols[0];
    const track = idx.track >= 0 ? cols[idx.track] : cols[1];
    const location = idx.location >= 0 ? cols[idx.location] : cols[2];
    const date = idx.date >= 0 ? cols[idx.date] : cols[3];
    const time = idx.time >= 0 ? cols[idx.time] : cols[4];
    let klass = idx.klass >= 0 ? (cols[idx.klass] || '').toUpperCase() : '';
    if (!klass) {
      if (/(^|\s|-)LMSC(\s|$)/i.test(track)) klass = 'LMSC';
      else if (/(^|\s|-)PLM(\s|$)/i.test(track)) klass = 'PLM';
      else if (/(^|\s|-)SMT(\s|$)/i.test(track)) klass = 'SMT';
    }
    const baseStart = new Date(`${date}T${time}:00-05:00`);
    if (!klass) {
      events.push({ raceId: `${raceId}-PLM`, classType: 'PLM', track, location, start: baseStart });
      events.push({ raceId: `${raceId}-LMSC`, classType: 'LMSC', track: `${track} - LMSC`, location, start: new Date(baseStart.getTime() + 2 * 3600 * 1000) });
    } else {
      events.push({ raceId, classType: klass, track, location, start: baseStart });
    }
  });

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
};

const isLiveWindow = (start) => {
  const now = new Date();
  const pre = new Date(start.getTime() - 10 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 60 * 60 * 1000);
  return pre <= now && now <= end;
};

const classBadgeStyle = (klass) => {
  switch (klass) {
    case 'LMSC':
      return { bg: 'rgba(77,163,255,0.15)', border: 'rgba(77,163,255,0.45)', text: '#cfe6ff' };
    case 'PLM':
      return { bg: 'rgba(255,184,77,0.15)', border: 'rgba(255,184,77,0.45)', text: '#ffe3b3' };
    case 'SMT':
      return { bg: 'rgba(114,137,218,0.15)', border: 'rgba(114,137,218,0.45)', text: '#d7ddff' };
    default:
      return { bg: colors.card, border: colors.border, text: colors.textSecondary };
  }
};

export default function ScheduleScreen() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState(['ALL']);
  const [selectedClass, setSelectedClass] = useState('ALL');

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/events/events.csv?ts=${Date.now()}`);
        const text = await res.text();
        if (!isMounted) return;
        const parsed = parseEvents(text);
        setEvents(parsed);
        const classList = Array.from(new Set(parsed.map((e) => (e.classType || '').toUpperCase()).filter(Boolean)));
        setClasses(['ALL', ...classList]);
      } catch (e) {
        if (!isMounted) return;
        setError('Using cached schedule data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (selectedClass === 'ALL') return events;
    return events.filter((evt) => String(evt.classType || '').toUpperCase() === selectedClass);
  }, [events, selectedClass]);

  const renderItem = ({ item }) => {
    const live = isLiveWindow(item.start);
    const badge = classBadgeStyle(item.classType);
    const dateStr = item.start.toISOString().slice(0, 10);
    const timeStr = item.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    return (
      <View style={[styles.card, live && styles.cardLive]}>
        <View style={styles.cardHeader}>
          <Text style={styles.track}>{item.track}</Text>
          <View style={[styles.classChip, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.classText, { color: badge.text }]}>{item.classType}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>{dateStr}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Start (ET)</Text>
          <Text style={styles.metaValue}>{timeStr} ET</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Location</Text>
          <Text style={styles.metaValue}>{item.location || 'TBD'}</Text>
        </View>
        {live && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>Live</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <NavBar />
      <View style={styles.content}>
        <Text style={styles.title}>Schedule</Text>
        {loading && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.md }} />}
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        <View style={styles.chips}>
          {classes.map((cls) => (
            <TouchableOpacity
              key={cls}
              onPress={() => setSelectedClass(cls)}
              style={[styles.chip, selectedClass === cls && styles.chipSelected]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, selectedClass === cls && styles.chipTextSelected]}>{cls}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => `${item.raceId}-${item.classType}-${item.start.getTime()}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
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
  title: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  warning: {
    color: colors.warning,
    marginBottom: spacing.sm
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md
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
  chipText: {
    color: colors.textSecondary,
    fontWeight: '700'
  },
  chipTextSelected: {
    color: colors.textPrimary
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardLive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,77,77,0.08)'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  track: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    paddingRight: spacing.sm
  },
  classChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1
  },
  classText: {
    fontWeight: '700'
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  metaLabel: {
    color: colors.textSecondary
  },
  metaValue: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  liveBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm
  },
  liveText: {
    color: '#fff',
    fontWeight: '800'
  }
});
