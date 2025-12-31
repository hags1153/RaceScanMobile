import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Screen from '../components/Screen';
import NavBar from '../components/NavBar';
import { colors, spacing, radius } from '../theme';

const API_HOSTS = ['https://racescan.racing', 'https://www.racescan.racing'];

export default function VerifyEmailScreen({ route, navigation }) {
  const initialEmail = route?.params?.email || '';
  const initialPhone = route?.params?.phone || '';
  const initialChannel = route?.params?.channel || 'email';
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [smsCode, setSmsCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const parseResponse = async (res) => {
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
    return { data, raw, status: res.status };
  };

  const handleResend = async () => {
    if (!email) {
      setError('Enter your email to resend the code.');
      setMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    let lastErr;
    for (const host of API_HOSTS) {
      try {
        const res = await fetch(`${host}/resend-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: email.trim() })
        });
        const { data, raw, status } = await parseResponse(res);
        if (res.ok) {
          setMessage(data.message || 'Verification email sent.');
          setError('');
          setLoading(false);
          return;
        } else {
          console.log('Email resend failed', { host, status, raw });
          setError(data.message || `Could not resend code. (${status}) ${raw?.slice(0, 120) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error(`Resend failed for host ${host}`, err);
      }
    }
    setError('Network error. Please try again.');
    if (lastErr) console.error('All resend hosts failed', lastErr);
    setLoading(false);
  };

  const handleSendSms = async () => {
    if (!phone) {
      setError('Enter your phone number to send a code.');
      setMessage('');
      return;
    }
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
          body: JSON.stringify({ phone: phone.trim() })
        });
        const { data, raw, status } = await parseResponse(res);
        if (res.ok) {
          setMessage(data.message || 'SMS code sent.');
          setError('');
          setLoading(false);
          return;
        } else {
          console.log('SMS send failed', { host, status, raw });
          setError(data.message || `Could not send SMS code. (${status}) ${raw?.slice(0, 120) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error(`SMS send failed for host ${host}`, err);
      }
    }
    setError('Network error. Please try again.');
    if (lastErr) console.error('All SMS send hosts failed', lastErr);
    setLoading(false);
  };

  const handleVerifySms = async () => {
    if (!phone || !smsCode) {
      setError('Phone and code are required.');
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
          body: JSON.stringify({ phone: phone.trim(), code: smsCode.trim() })
        });
        const { data, raw, status } = await parseResponse(res);
        if (res.ok) {
          setMessage(data.message || 'Phone verified!');
          setError('');
          setLoading(false);
          setTimeout(() => navigation.navigate('Tabs', { screen: 'Home' }), 600);
          return;
        } else {
          console.log('SMS verify failed', { host, status, raw });
          setError(data.message || `Could not verify code. (${status}) ${raw?.slice(0, 120) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error(`SMS verify failed for host ${host}`, err);
      }
    }
    setError('Network error. Please try again.');
    if (lastErr) console.error('All SMS verify hosts failed', lastErr);
    setLoading(false);
  };

  return (
    <Screen>
      <NavBar />
      <View style={styles.container}>
        {(initialChannel !== 'sms') && (
          <>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              We sent a verification email. Please tap the link in your inbox to activate your account.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity style={styles.button} onPress={handleResend} disabled={loading} activeOpacity={0.9}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Resend Verification Email</Text>}
            </TouchableOpacity>

            {message && !error ? <Text style={styles.success}>{message}</Text> : null}
            {error && !message ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.85}>
              <Text style={styles.link}>Already verified? Log in</Text>
            </TouchableOpacity>

            <View style={styles.divider} />
          </>
        )}

        <Text style={styles.title}>Verify via SMS</Text>
        <Text style={styles.subtitle}>Enter your phone to receive a code by SMS.</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone e.g. +1XXXXXXXXXX"
          placeholderTextColor={colors.textSecondary}
          value={phone}
          onChangeText={setPhone}
          autoCapitalize="none"
          keyboardType="phone-pad"
        />

        <TouchableOpacity style={styles.button} onPress={handleSendSms} disabled={loading} activeOpacity={0.9}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send SMS Code</Text>}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Enter SMS code"
          placeholderTextColor={colors.textSecondary}
          value={smsCode}
          onChangeText={setSmsCode}
          keyboardType="number-pad"
        />

        <TouchableOpacity style={styles.button} onPress={handleVerifySms} disabled={loading} activeOpacity={0.9}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify SMS Code</Text>}
        </TouchableOpacity>

        {message && error ? <Text style={styles.success}>{message}</Text> : null}
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
  },
  link: {
    marginTop: spacing.md,
    color: colors.accent,
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg
  }
});
