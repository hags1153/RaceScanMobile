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

export default function SignupScreen({ navigation, route }) {
  const prefilledPhone = route?.params?.phone || '';
  const lockedPhone = !!route?.params?.phoneLocked;
  const preverifiedPhone = !!route?.params?.phoneVerified;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(prefilledPhone);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [channel, setChannel] = useState(route?.params?.channel || 'sms'); // email or sms
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!firstName || !lastName || !email || !phone || !password || !confirm) {
      setError('All fields are required (phone is required for SMS).');
      setMessage('');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      setMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const selectedChannel = lockedPhone ? 'sms' : channel;

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password: password.trim(),
      channel: selectedChannel,
      phoneVerified: lockedPhone && preverifiedPhone
    };

    let lastErr;
    for (const host of API_HOSTS) {
      try {
        const res = await fetch(`${host}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

        if (res.ok) {
          setMessage(data.message || 'Account created. Please verify your email or SMS.');
          setError('');
          setLoading(false);
          if (selectedChannel === 'sms' && (lockedPhone && preverifiedPhone)) {
            navigation.navigate('Tabs', { screen: 'Home' });
          } else {
            navigation.navigate('VerifyEmail', { email: email.trim(), phone: phone.trim(), channel: selectedChannel });
          }
          return;
        } else {
          if (data.userExists) {
            setError('User already exists. Please log in instead.');
          } else {
            const fallback = res.status === 429 ? 'Too many attempts. Try again soon.' : 'Signup failed.';
            setError(data.message || fallback);
          }
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error(`Signup request failed for host ${host}`, err);
        lastErr = err;
      }
    }

    setError('Network error. Please try again.');
    if (lastErr) console.error('All signup hosts failed', lastErr);
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
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.subtitle}>
                {lockedPhone ? 'Your phone is verified. Finish your profile to start listening.' : 'Sign up to listen live.'}
              </Text>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { marginRight: spacing.xs }]}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="First Name"
                    placeholderTextColor={colors.textSecondary}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.inputGroup, { marginLeft: spacing.xs }]}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Last Name"
                    placeholderTextColor={colors.textSecondary}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone (required for SMS)</Text>
                <TextInput
                  style={[styles.input, lockedPhone && styles.inputDisabled]}
                  placeholder="+1XXXXXXXXXX"
                  placeholderTextColor={colors.textSecondary}
                  value={phone}
                  editable={!lockedPhone}
                  onChangeText={setPhone}
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>

              {!lockedPhone && (
                <>
                  <Text style={styles.label}>Verification method</Text>
                  <View style={[styles.row, { marginBottom: spacing.sm }]}>
                    <TouchableOpacity
                      style={[styles.choice, channel === 'email' && styles.choiceSelected]}
                      onPress={() => setChannel('email')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.choiceText, channel === 'email' && styles.choiceTextSelected]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.choice, channel === 'sms' && styles.choiceSelected]}
                      onPress={() => setChannel('sms')}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.choiceText, channel === 'sms' && styles.choiceTextSelected]}>SMS</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={confirm}
                  onChangeText={setConfirm}
                  returnKeyType="done"
                />
              </View>

              <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading} activeOpacity={0.9}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
              </TouchableOpacity>

              {message ? <Text style={styles.success}>{message}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'Login' })} activeOpacity={0.85}>
                <Text style={styles.link}>Already have an account? Log in</Text>
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
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sm
  },
  inputGroup: {
    flex: 1
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
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,77,77,0.1)'
  },
  choiceText: {
    color: colors.textSecondary,
    fontWeight: '700'
  },
  choiceTextSelected: {
    color: colors.textPrimary
  },
  inputDisabled: {
    backgroundColor: colors.card,
    color: colors.textSecondary
  }
});
