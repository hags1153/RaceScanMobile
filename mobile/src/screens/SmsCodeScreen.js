import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_HOSTS = ['https://racescan.racing', 'https://www.racescan.racing'];

const parseResponse = async (res) => {
  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { message: raw }; }
  return { data, raw, status: res.status };
};

export default function SmsCodeScreen({ navigation, route }) {
  const phone = route?.params?.phone || '';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const resendCode = async () => {
    if (!phone) return;
    setLoading(true);
    setError('');
    setMessage('');
    let lastErr;
    for (const host of API_HOSTS) {
      try {
        const res = await fetch(`${host}/api/sms/send-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone })
        });
        const { data, raw, status } = await parseResponse(res);
        if (res.ok) {
          setMessage('Code resent.');
          setLoading(false);
          return;
        } else {
          setError(data.message || `Could not resend code. (${status}) ${raw?.slice(0, 80) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error('Resend SMS failed', err);
      }
    }
    setError('Network error. Please try again.');
    if (lastErr) console.error('All resend hosts failed', lastErr);
    setLoading(false);
  };

  const verifyCode = async () => {
    if (!code.trim()) {
      setError('Enter the code we sent.');
      setMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    let lastErr;
    for (const host of API_HOSTS) {
      try {
        const res = await fetch(`${host}/api/sms/check-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone, code: code.trim() })
        });
        const { data, raw, status } = await parseResponse(res);
        if (res.ok) {
          setMessage('Phone verified. Continue to create your account.');
          setLoading(false);
          setTimeout(() => {
            if (data.userFound) {
              navigation.navigate('Tabs', { screen: 'Home' });
            } else {
              navigation.navigate('Signup', { phone, phoneLocked: true, channel: 'sms', phoneVerified: true });
            }
          }, 500);
          return;
        } else {
          setError(data.message || `Could not verify code. (${status}) ${raw?.slice(0, 80) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error('Verify SMS failed', err);
      }
    }
    setError('Network error. Please try again.');
    if (lastErr) console.error('All verify hosts failed', lastErr);
    setLoading(false);
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
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={styles.title}>Verify your phone</Text>
              <Text style={styles.subtitle}>We sent a code to {phone || 'your phone'}.</Text>

              <Text style={styles.label}>SMS Code</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                placeholderTextColor={colors.textSecondary}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
              />

              <TouchableOpacity style={styles.button} onPress={verifyCode} disabled={loading} activeOpacity={0.9}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={resendCode} activeOpacity={0.85}>
                <Text style={styles.link}>Resend code</Text>
              </TouchableOpacity>

              {message ? <Text style={styles.success}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    flexGrow: 1
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
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
  label: {
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
    fontSize: 13
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
  },
  link: {
    marginTop: spacing.md,
    color: colors.accent,
    fontWeight: '700',
    textDecorationLine: 'underline'
  }
});
