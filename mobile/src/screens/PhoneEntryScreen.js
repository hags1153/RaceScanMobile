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

export default function PhoneEntryScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleContinue = async () => {
    if (!phone.trim()) {
      setError('Enter your phone number to continue.');
      setMessage('');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    let lastErr;

    // First check if phone exists
    for (const host of API_HOSTS) {
      try {
        const checkRes = await fetch(`${host}/api/check-phone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ phone: phone.trim() })
        });
        const { data: checkData, raw: checkRaw, status: checkStatus } = await parseResponse(checkRes);
        if (!checkRes.ok) {
          setError(checkData.message || `Unable to check number (${checkStatus}) ${checkRaw?.slice(0, 80) || ''}`);
          setLoading(false);
          return;
        }

        if (checkData.exists) {
          setMessage('');
          setError('Account exists. Go to Login?');
          setLoading(false);
          return;
        }

        // Send SMS code
        const smsRes = await fetch(`${host}/api/sms/send-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone: phone.trim() })
        });
        const { data: smsData, raw: smsRaw, status: smsStatus } = await parseResponse(smsRes);
        if (smsRes.ok) {
          setLoading(false);
          navigation.navigate('SmsCode', { phone: phone.trim() });
          return;
        } else {
          setError(smsData.message || `Could not send code. (${smsStatus}) ${smsRaw?.slice(0, 80) || ''}`);
          setLoading(false);
          return;
        }
      } catch (err) {
        lastErr = err;
        console.error(`Phone check failed for host`, err);
      }
    }

    setError('Network error. Please try again.');
    if (lastErr) console.error('All phone check hosts failed', lastErr);
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
              <Text style={styles.title}>Start with your phone</Text>
              <Text style={styles.subtitle}>We’ll text you a code to begin sign up.</Text>

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+1XXXXXXXXXX"
                placeholderTextColor={colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                returnKeyType="done"
              />

              {error === 'Account exists. Go to Login?' ? (
              <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.85}>
                <Text style={styles.link}>{error}</Text>
              </TouchableOpacity>
              ) : null}

              {error && error !== 'Account exists. Go to Login?' ? <Text style={styles.error}>{error}</Text> : null}
              {message ? <Text style={styles.success}>{message}</Text> : null}

              <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={loading} activeOpacity={0.9}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
              </TouchableOpacity>
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
    color: colors.accent,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginBottom: spacing.sm
  }
});
