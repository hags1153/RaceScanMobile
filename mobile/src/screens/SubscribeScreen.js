import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_BASE = 'https://racescan.racing';

const parseResponse = async (res) => {
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: raw }; }
  return { data, raw, status: res.status };
};

export default function SubscribeScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const returnTo = route?.params?.returnTo;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' });
        const info = await res.json();
        setLoggedIn(!!info?.success);
      } catch {
        setLoggedIn(false);
      }
    };
    load();
  }, []);

  const handleSubscribe = async () => {
    if (!loggedIn) {
      navigation.navigate('Tabs', { screen: 'Login' });
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    let lastErr;
    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: 'unlimited', source: 'mobile' })
      });
      const { data, raw, status } = await parseResponse(res);
      console.log('Checkout session response', { status, data, raw: raw?.slice ? raw.slice(0, 200) : raw });
      if (!res.ok || !data?.url) {
        setError(data.message || `Unable to start checkout (${status}) ${raw?.slice(0, 120) || ''}`);
        setLoading(false);
        return;
      }

      const result = await WebBrowser.openBrowserAsync(data.url);
      if (result.type === 'cancel') {
        setMessage('Closed checkout. You can reopen to finish subscribing.');
      }

      // After browser closes, check subscription status
      const checkRes = await fetch(`${API_BASE}/api/user-info`, { credentials: 'include', cache: 'no-store' });
      const checkData = await checkRes.json();
      console.log('Post-checkout user info', checkData);
      if (checkData?.subscribed) {
        setMessage('Subscription active! You can now listen live.');
        setError('');
        setTimeout(() => {
          if (returnTo?.stack) {
            navigation.navigate(returnTo.stack, returnTo.params || {});
          } else {
            navigation.navigate('Tabs', { screen: 'Home' });
          }
        }, 700);
      } else {
        setError('Subscription not completed yet. Please finish checkout.');
      }
      setLoading(false);
    } catch (err) {
      lastErr = err;
      setError('Network error. Please try again.');
      setLoading(false);
      console.error('Subscribe flow failed', err);
    }
    if (lastErr) {
      // logged above
    }
  };

  return (
    <Screen>
      <NavBar />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose your plan</Text>

          <View style={styles.cardRow}>
            <View style={[styles.planCard, styles.planPrimary]}>
              <Text style={styles.planTitle}>RaceScan Unlimited</Text>
              <Text style={styles.planPrice}>$8.99 / month</Text>
              <Text style={styles.planSubtitle}>Listen to all drivers, every event.</Text>
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubscribe}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Subscribe</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.planCard}>
              <Text style={styles.planTitle}>Day Pass</Text>
              <Text style={styles.planPrice}>Coming soon</Text>
              <Text style={styles.planSubtitle}>Grab a single-race pass right from the app (in development).</Text>
              <TouchableOpacity style={[styles.button, styles.buttonGhost]} disabled>
                <Text style={styles.buttonGhostText}>Unavailable</Text>
              </TouchableOpacity>
            </View>
          </View>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!loggedIn && (
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.85}>
              <Text style={styles.link}>Log in to subscribe</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800'
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap'
  },
  planCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  planPrimary: {
    borderColor: colors.accent
  },
  planTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  planPrice: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800'
  },
  planSubtitle: {
    color: colors.textSecondary,
    fontSize: 14
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  buttonGhost: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  buttonGhostText: {
    color: colors.textSecondary,
    fontWeight: '700'
  },
  success: {
    color: colors.success,
    fontWeight: '700'
  },
  error: {
    color: colors.accent,
    fontWeight: '700'
  },
  link: {
    color: colors.accent,
    fontWeight: '700',
    textDecorationLine: 'underline'
  }
});
