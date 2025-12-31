import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius } from '../theme';

export default function NavBar() {
  const navigation = useNavigation();
  const [user, setUser] = useState({ loggedIn: false, firstName: '', lastName: '' });

  const goLogin = () => {
    if (navigation?.navigate) {
      navigation.navigate('Tabs', { screen: 'Login' });
      navigation.getParent?.()?.navigate?.('Tabs', { screen: 'Login' });
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadSession = async () => {
      try {
        const res = await fetch('https://racescan.racing/api/user-info', { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (!isMounted) return;
        if (data?.success) {
          setUser({ loggedIn: true, firstName: data.firstName || 'User', lastName: data.lastName || '' });
        } else {
          setUser({ loggedIn: false, firstName: '', lastName: '' });
        }
      } catch {
        if (isMounted) setUser({ loggedIn: false, firstName: '', lastName: '' });
      }
    };
    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const goAccount = () => {
    if (navigation?.navigate) {
      navigation.navigate('Account');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('https://racescan.racing/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {
      // ignore
    } finally {
      setUser({ loggedIn: false, firstName: '', lastName: '' });
      goLogin();
    }
  };

  const initials = (() => {
    const first = (user.firstName || '').trim();
    const last = (user.lastName || '').trim();
    if (!first && !last) return 'RS';
    return `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase();
  })();

  return (
    <View style={styles.wrapper}>
      <View style={styles.brandRow}>
        <Image source={{ uri: 'https://racescan.racing/static/images/RaceScanLong.png' }} style={styles.logo} resizeMode="contain" />
        {user.loggedIn ? (
          <TouchableOpacity onPress={goAccount} activeOpacity={0.85} style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={goLogin} activeOpacity={0.85} style={styles.avatarWrap}>
            <Text style={styles.avatarText}>Login</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  logo: {
    height: 34,
    flex: 1,
    marginRight: spacing.sm
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: colors.textPrimary,
    fontWeight: '800'
  }
});
