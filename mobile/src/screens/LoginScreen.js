import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_HOSTS = ['https://racescan.racing', 'https://www.racescan.racing'];

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      setMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      let lastErr;
      for (const host of API_HOSTS) {
        try {
          const res = await fetch(`${host}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
          });
          const text = await res.text();
          let data = {};
          try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

          if (res.ok) {
            setMessage(data.message || 'Logged in');
            setError('');
            setTimeout(() => navigation.navigate('Tabs', { screen: 'Home' }), 800);
            return;
          } else {
            const fallback = res.status === 429 ? 'Too many attempts. Please try again soon.' : 'Login failed.';
            setError(data.message || fallback);
            return;
          }
        } catch (err) {
          console.error(`Login request failed for host ${host}`, err);
          lastErr = err;
        }
      }
      setError('Network error. Please try again.');
      if (lastErr) console.error('All login hosts failed', lastErr);
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <NavBar />
      <View style={styles.container}>
        <Text style={styles.title}>Log In</Text>
        <Text style={styles.subtitle}>Use your RaceScan account to access live audio.</Text>
        <TextInput
          style={styles.input}
          placeholder="Email or Phone"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.9}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  success: {
    marginTop: spacing.sm,
    color: colors.success,
    fontWeight: '700'
  },
  error: {
    marginTop: spacing.sm,
    color: colors.accent,
    fontWeight: '700'
  }
});
