import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_BASE = 'https://racescan.racing';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AccountScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [infoRes, passRes] = await Promise.all([
        fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${API_BASE}/api/user-day-passes`, { credentials: 'include', cache: 'no-store' })
      ]);
      const info = await infoRes.json();
      if (!info?.success) {
        setUser(null);
        setError('Please log in to view your account.');
        setLoading(false);
        return;
      }
      const passJson = await passRes.json().catch(() => ({}));
      setUser(info);
      setPasses(passJson?.passes || []);
      setError('');
    } catch (e) {
      setError('Unable to load account right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch (_) {
      // ignore
    } finally {
      setUser(null);
      navigation.navigate('Tabs', { screen: 'Login' });
    }
  };

  const renderPass = ({ item }) => {
    const startDate = `${item.event_date || ''} ${item.event_time || ''}`.trim();
    return (
      <View style={styles.passCard}>
        <View style={styles.passHeader}>
          <Text style={styles.passTitle}>{item.event_name || 'Event'}</Text>
          <Text style={styles.badge}>{item.status || 'Pass'}</Text>
        </View>
        <Text style={styles.passMeta}>{startDate}</Text>
        <Text style={styles.passMeta}>{item.track || item.location || ''}</Text>
      </View>
    );
  };

  const loggedIn = !!user;
  const verificationOk = !!(user?.emailVerified || user?.phoneVerified);

  const goToVerify = () => {
    if (!user) return;
    navigation.navigate('VerifyEmail', {
      email: user.email,
      phone: user.phoneNumber,
      channel: user.phoneVerified ? 'email' : 'sms'
    });
  };

  return (
    <Screen>
      <NavBar />
      <View style={styles.container}>
        <Text style={styles.title}>Account</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
        ) : !loggedIn ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error || 'Please log in.'}</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.9}>
              <Text style={styles.buttonText}>Log In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Profile</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value}>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{user.email || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Verification Status</Text>
                {verificationOk ? (
                  <Text style={[styles.badge, styles.badgeSuccess]}>Verified</Text>
                ) : (
                  <TouchableOpacity onPress={goToVerify} activeOpacity={0.8}>
                    <Text style={[styles.badge, styles.badgeWarn, styles.linkBadge]}>Not Verified (verify)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Subscription</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Plan</Text>
                {user.subscribed ? (
                  <Text style={[styles.badge, styles.badgeGold]}>Season Pass</Text>
                ) : (
                  <Text style={styles.value}>{user.subscriptionPlan || '—'}</Text>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Status</Text>
                <Text style={styles.value}>{user.subscriptionStatus || '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Next Billing</Text>
                <Text style={styles.value}>{formatDate(user.nextBillingDate)}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.button, styles.buttonGhost]} onPress={() => navigation.navigate('Tabs', { screen: 'Schedule' })}>
                  <Text style={styles.buttonText}>View Schedule</Text>
                </TouchableOpacity>
                {!user.subscribed && (
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Subscribe', { returnTo: { stack: 'Tabs', params: { screen: 'AccountTab' } } })}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonText}>Subscribe</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Day Passes</Text>
              {passes.length === 0 ? (
                <Text style={styles.value}>No passes yet.</Text>
              ) : (
                <FlatList
                  data={passes}
                  keyExtractor={(item, idx) => `${item.event_id || idx}-${idx}`}
                  renderItem={renderPass}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
                />
              )}
            </View>

            <TouchableOpacity style={[styles.button, styles.logoutBtn]} onPress={handleLogout} activeOpacity={0.9}>
              <Text style={styles.buttonText}>Log Out</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800'
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm
  },
  sectionLabel: {
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    marginBottom: spacing.xs
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  label: {
    color: colors.textSecondary
  },
  value: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontWeight: '700'
  },
  badgeSuccess: {
    borderColor: colors.success,
    color: colors.success
  },
  badgeWarn: {
    borderColor: colors.accent,
    color: colors.accent
  },
  badgeGold: {
    borderColor: '#d4af37',
    color: '#d4af37',
    backgroundColor: 'rgba(212,175,55,0.12)'
  },
  actions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center'
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  linkBadge: {
    textDecorationLine: 'underline'
  },
  logoutBtn: {
    backgroundColor: colors.border,
    borderColor: colors.border
  },
  error: {
    color: colors.accent,
    fontWeight: '700'
  },
  passCard: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  passHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  passTitle: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  passMeta: {
    color: colors.textSecondary
  }
});
