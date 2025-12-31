import React, { useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          <View style={styles.container}>
            <View style={styles.card}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Log in to access live driver audio.</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email or Phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email or phone"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                />
              </View>
              <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.9}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
              </TouchableOpacity>
              {message ? <Text style={styles.success}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity onPress={() => navigation.navigate('Signup')} activeOpacity={0.85}>
                <Text style={styles.link}>Don’t have an account? Sign up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    flex: 1,
    justifyContent: 'center'
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    gap: spacing.sm
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md
  },
  inputGroup: {
    gap: 4
  },
  label: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13
  },
  input: {
    backgroundColor: colors.card,
    color: colors.textPrimary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    fontSize: 15
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
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
  },
  link: {
    marginTop: spacing.sm,
    color: colors.accent,
    fontWeight: '700',
    textDecorationLine: 'underline'
  }
});
